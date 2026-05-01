import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"
import { getPlanConfig, migrateLegacyPlanId } from "../shared/plans.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UploadRequest {
  project_id: string
  files: Array<{
    asset_id: string
    size_bytes: number
  }>
}

interface UploadResponse {
  uploadUrls: Array<{
    asset_id: string
    signedUrl: string
    path: string
  }>
}

interface StorageUsage {
  total_bytes_used: bigint
  pending_bytes: bigint
  asset_count: number
}

interface License {
  license_type: string
  status: string
  features: any
  extra_quota_bytes?: bigint
}

interface User {
  id: string
  plan_type: string
  storage_quota_mb: number
}

interface EffectiveLimits {
  quotaBytes: bigint
  canExport: boolean
  canImport: boolean
  maxAssetSize: number
}

// Plan quota mapping - DEPRECATED, use getPlanConfig instead
// Keeping for backward compatibility during migration
const PLAN_QUOTA_MB = {
  free: 100,        // 100MB
  pro: 10240,       // 10GB
  lifetime: 15360,  // 15GB
} as const

function calculateEffectiveLimits(userInfo: User, license: License | null): EffectiveLimits {
  // Migrate legacy plan names if needed
  const planId = migrateLegacyPlanId(userInfo.plan_type);
  const planConfig = getPlanConfig(planId);
  
  if (!planConfig) {
    console.error(`[getUploadUrls] Unknown plan: ${planId}, falling back to free`);
    const freeConfig = getPlanConfig('free')!;
    return {
      quotaBytes: BigInt(freeConfig.quotaBytes),
      canExport: freeConfig.importExportEnabled,
      canImport: freeConfig.importExportEnabled,
      maxAssetSize: freeConfig.maxAssetSize
    };
  }
  
  // Start with base plan quota
  const baseQuotaBytes = BigInt(planConfig.quotaBytes);
  
  // Add extra quota from license if available
  const extraQuotaBytes = license?.extra_quota_bytes || BigInt(0);
  const totalQuotaBytes = baseQuotaBytes + extraQuotaBytes;
  
  // Determine feature permissions
  const canExport = planConfig.importExportEnabled || (license?.features && (license.features as any).can_export);
  const canImport = planConfig.importExportEnabled || (license?.features && (license.features as any).can_import);
  const maxAssetSize = planConfig.maxAssetSize;
  
  return {
    quotaBytes: totalQuotaBytes,
    canExport,
    canImport,
    maxAssetSize
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: UploadRequest = await req.json()
    const { project_id, files } = body

    if (!project_id || !files || !Array.isArray(files)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate files array
    for (const file of files) {
      if (!file.asset_id || typeof file.size_bytes !== 'number' || file.size_bytes <= 0) {
        return new Response(
          JSON.stringify({ error: 'Invalid file data in request' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Calculate total upload size
    const totalUploadSize = files.reduce((sum, file) => sum + file.size_bytes, 0)

    // Verify user owns the project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', project_id)
      .eq('user_id', user.id)
      .single()

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: 'Project not found or access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user info
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, plan_type, storage_quota_mb')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userInfo: User = userData

    // Get current storage usage including pending bytes
    const { data: storageData, error: storageError } = await supabase
      .from('storage_usage')
      .select('total_bytes_used, pending_bytes, asset_count')
      .eq('user_id', user.id)
      .single()

    if (storageError && storageError.code !== 'PGRST116') {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch storage usage' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const currentUsage: StorageUsage = storageData || {
      total_bytes_used: BigInt(0),
      pending_bytes: BigInt(0),
      asset_count: 0
    }

    // Get active license with extra quota
    const { data: licenseData, error: licenseError } = await supabase
      .from('licenses')
      .select('license_type, status, features')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .or('expires_at.is.null,expires_at.gt.now()')
      .single()

    let license: License | null = null
    if (!licenseError && licenseData) {
      license = licenseData
      // Extract extra_quota_bytes from features if present
      if (license.features && typeof license.features === 'object') {
        const features = license.features as any
        license.extra_quota_bytes = features.extra_quota_bytes ? BigInt(features.extra_quota_bytes) : BigInt(0)
      } else {
        license.extra_quota_bytes = BigInt(0)
      }
    }

    // Calculate effective limits using new plan mapping
    const effectiveLimits = calculateEffectiveLimits(userInfo, license)

    // Check for owner plan (unlimited storage)
    const isOwner = userInfo.plan_type === 'owner'

    // Skip quota checks for owner users
    if (!isOwner) {
      // Check if upload would exceed quota (including pending uploads)
      const effectiveUsage = currentUsage.total_bytes_used + currentUsage.pending_bytes
      const newTotalUsage = effectiveUsage + BigInt(totalUploadSize)
      
      if (newTotalUsage > effectiveLimits.quotaBytes) {
        return new Response(
          JSON.stringify({ 
            error: 'Storage quota exceeded',
            details: {
              current_used: Number(currentUsage.total_bytes_used),
              pending_uploads: Number(currentUsage.pending_bytes),
              effective_usage: Number(effectiveUsage),
              upload_size: totalUploadSize,
              quota_allowed: Number(effectiveLimits.quotaBytes),
              plan_type: userInfo.plan_type,
              effective_limits: effectiveLimits
            }
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Atomically reserve the bytes for upload
    try {
      const { error: incrementError } = await supabase.rpc('increment_pending_bytes', {
        p_user_id: user.id,
        p_bytes: totalUploadSize
      })

      if (incrementError) {
        console.error('Failed to reserve upload bytes:', incrementError)
        return new Response(
          JSON.stringify({ error: 'Failed to reserve upload space' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } catch (error) {
      console.error('Error reserving upload bytes:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to reserve upload space' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate R2 signed URLs
    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID')
    const r2AccessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
    const r2SecretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
    const r2BucketName = Deno.env.get('R2_BUCKET_NAME')

    // CRITICAL DEBUG: Log R2 configuration status (without exposing secrets)
    console.log('[getUploadUrls] R2 Configuration Check:', {
      hasAccountId: !!r2AccountId,
      hasAccessKeyId: !!r2AccessKeyId,
      hasSecretAccessKey: !!r2SecretAccessKey,
      hasBucketName: !!r2BucketName,
      accountIdPrefix: r2AccountId ? r2AccountId.substring(0, 4) + '...' : 'missing',
      bucketName: r2BucketName || 'missing'
    })

    if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2BucketName) {
      console.error('[getUploadUrls] R2 configuration missing - asset uploads will fail');
      return new Response(
        JSON.stringify({ 
          error: 'R2 configuration missing',
          details: {
            hasAccountId: !!r2AccountId,
            hasAccessKeyId: !!r2AccessKeyId,
            hasSecretAccessKey: !!r2SecretAccessKey,
            hasBucketName: !!r2BucketName
          }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const uploadUrls: UploadResponse['uploadUrls'] = []

    for (const file of files) {
      const objectKey = `users/${user.id}/projects/${project_id}/assets/${file.asset_id}`
      const signedUrl = await generateR2SignedUrl(
        r2AccountId,
        r2AccessKeyId,
        r2SecretAccessKey,
        r2BucketName,
        objectKey
      )

      uploadUrls.push({
        asset_id: file.asset_id,
        signedUrl,
        path: objectKey
      })
    }

    return new Response(
      JSON.stringify({ uploadUrls }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in getUploadUrls:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function generateR2SignedUrl(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
  bucketName: string,
  objectKey: string
): Promise<string> {
  const region = 'auto'
  const service = 's3'
  const host = `${bucketName}.${accountId}.r2.cloudflarestorage.com`
  const endpoint = `https://${host}`
  const method = 'PUT'
  const expires = 3600 // 1 hour

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '')
  const dateStamp = amzDate.substr(0, 8)

  const canonicalUri = `/${objectKey}`
  const canonicalQuerystring = ''
  const canonicalHeaders = `host:${host}\n`
  const signedHeaders = 'host'

  const payloadHash = await sha256Hex('')
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n')

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n')

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service)
  const signature = await hmacSha256(signingKey, stringToSign)

  const queryParameters = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': expires.toString(),
    'X-Amz-SignedHeaders': signedHeaders,
    'X-Amz-Signature': signature
  })

  return `${endpoint}${canonicalUri}?${queryParameters.toString()}`
}

async function sha256Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256(key: Uint8Array, message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.sign('HMAC', await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  ), msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Promise<Uint8Array> {
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + key), dateStamp)
  const kRegion = await hmacSha256(new TextEncoder().encode(kDate), regionName)
  const kService = await hmacSha256(new TextEncoder().encode(kRegion), serviceName)
  const kSigning = await hmacSha256(new TextEncoder().encode(kService), 'aws4_request')
  return new TextEncoder().encode(kSigning)
}
