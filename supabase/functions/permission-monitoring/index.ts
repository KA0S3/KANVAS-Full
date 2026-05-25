import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PermissionMonitoringResponse {
  success: boolean
  permission_health: 'healthy' | 'degraded' | 'critical'
  metrics: {
    total_permission_checks: number
    successful_checks: number
    denied_checks: number
    denial_rate: number
    cache_hit_rate: number
    average_response_time_ms: number
    checks_last_hour: number
    checks_last_24h: number
    unusual_denial_patterns: Array<{
      action: string
      denial_count: number
      expected_denial_rate: number
      actual_denial_rate: number
      severity: 'low' | 'medium' | 'high'
    }>
  }
  alerts: Array<{
    type: 'high_denial_rate' | 'permission_anomaly' | 'performance_issue' | 'cache_issues'
    severity: 'low' | 'medium' | 'high' | 'critical'
    message: string
    threshold: number
    current_value: number
    affected_actions?: string[]
  }>
  recent_denials: Array<{
    user_id: string
    action: string
    reason: string
    timestamp: string
    user_plan: string
  }>
  error?: string
}

interface PermissionLog {
  id: string
  user_id: string
  action: string
  allowed: boolean
  reason?: string
  response_time_ms: number
  cache_hit: boolean
  user_plan: string
  created_at: string
}

class PermissionMonitor {
  private supabase: any
  private alerts: Array<any> = []

  constructor(supabase: any) {
    this.supabase = supabase
  }

  async getPermissionLogs(timeRange: '1h' | '24h' | '7d' = '24h'): Promise<PermissionLog[]> {
    const timeRanges = {
      '1h': new Date(Date.now() - 60 * 60 * 1000),
      '24h': new Date(Date.now() - 24 * 60 * 60 * 1000),
      '7d': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    }

    const { data, error } = await this.supabase
      .from('permission_logs')
      .select('*')
      .gte('created_at', timeRanges[timeRange].toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch permission logs: ${error.message}`)
    }

    return data || []
  }

  async getRecentDenials(limit: number = 20): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('permission_logs')
      .select('*')
      .eq('allowed', false)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to fetch recent denials: ${error.message}`)
    }

    return data || []
  }

  calculateMetrics(logs: PermissionLog[]): any {
    const totalChecks = logs.length
    const successfulChecks = logs.filter(l => l.allowed).length
    const deniedChecks = totalChecks - successfulChecks
    const denialRate = totalChecks > 0 ? (deniedChecks / totalChecks) * 100 : 0
    
    const cacheHits = logs.filter(l => l.cache_hit).length
    const cacheHitRate = totalChecks > 0 ? (cacheHits / totalChecks) * 100 : 0

    const responseTimes = logs.map(l => l.response_time_ms).filter(t => t > 0)
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0

    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const checksLastHour = logs.filter(l => 
      new Date(l.created_at) >= oneHourAgo
    ).length

    const checksLast24h = logs.filter(l => 
      new Date(l.created_at) >= twentyFourHoursAgo
    ).length

    // Analyze unusual denial patterns
    const unusualDenialPatterns = this.analyzeDenialPatterns(logs)

    return {
      total_permission_checks: totalChecks,
      successful_checks: successfulChecks,
      denied_checks: deniedChecks,
      denial_rate: denialRate,
      cache_hit_rate: cacheHitRate,
      average_response_time_ms: averageResponseTime,
      checks_last_hour: checksLastHour,
      checks_last_24h: checksLast24h,
      unusual_denial_patterns: unusualDenialPatterns
    }
  }

  private analyzeDenialPatterns(logs: PermissionLog[]): Array<any> {
    const denialsByAction = logs
      .filter(l => !l.allowed)
      .reduce((acc, log) => {
        if (!acc[log.action]) {
          acc[log.action] = []
        }
        acc[log.action].push(log)
        return acc
      }, {} as Record<string, PermissionLog[]>)

    const patterns = []

    // Expected denial rates by action and plan type
    const expectedDenialRates = {
      'create_book': { free: 0, pro: 0, lifetime: 0 }, // All should be allowed
    }

    for (const [action, actionDenials] of Object.entries(denialsByAction)) {
      const totalActionChecks = logs.filter(l => l.action === action).length
      const actualDenialRate = totalActionChecks > 0 ? (actionDenials.length / totalActionChecks) * 100 : 0

      // Check against expected rates for each plan type
      for (const [plan, expectedRate] of Object.entries(expectedDenialRates[action as keyof typeof expectedDenialRates] || {})) {
        const planDenials = actionDenials.filter(d => d.user_plan === plan)
        const planTotalChecks = logs.filter(l => l.action === action && l.user_plan === plan).length
        const planActualRate = planTotalChecks > 0 ? (planDenials.length / planTotalChecks) * 100 : 0

        // Check for unusual patterns
        let severity: 'low' | 'medium' | 'high' = 'low'
        let isUnusual = false

        if (plan === 'free' && action.startsWith('export') && planActualRate < 95) {
          // Free users should be denied exports almost always
          severity = 'high'
          isUnusual = true
        } else if (plan === 'pro' && action.startsWith('export') && planActualRate > 10) {
          // Pro users should rarely be denied exports
          severity = 'medium'
          isUnusual = true
        } else if (plan === 'lifetime' && planActualRate > 5) {
          // Lifetime users should very rarely be denied anything
          severity = 'medium'
          isUnusual = true
        } else if (action === 'create_book' && planActualRate > 5) {
          // Book creation should almost never be denied
          severity = 'high'
          isUnusual = true
        }

        if (isUnusual && planTotalChecks > 10) { // Only flag if we have sufficient data
          patterns.push({
            action: `${action}_${plan}`,
            denial_count: planDenials.length,
            expected_denial_rate: expectedRate,
            actual_denial_rate: planActualRate,
            severity
          })
        }
      }
    }

    return patterns
  }

  checkAlerts(logs: PermissionLog[], calculatedMetrics: any): Array<any> {
    this.alerts = []

    // High denial rate alert
    if (calculatedMetrics.denial_rate > 25) { // > 25% denial rate
      this.alerts.push({
        type: 'high_denial_rate',
        severity: calculatedMetrics.denial_rate > 50 ? 'critical' : 'high',
        message: `Permission denial rate is ${(calculatedMetrics.denial_rate).toFixed(2)}%`,
        threshold: 25,
        current_value: calculatedMetrics.denial_rate
      })
    } else if (calculatedMetrics.denial_rate > 15) { // > 15% denial rate
      this.alerts.push({
        type: 'high_denial_rate',
        severity: 'medium',
        message: `Elevated permission denial rate: ${(calculatedMetrics.denial_rate).toFixed(2)}%`,
        threshold: 15,
        current_value: calculatedMetrics.denial_rate
      })
    }

    // Performance alert
    if (calculatedMetrics.average_response_time_ms > 1000) { // > 1 second
      this.alerts.push({
        type: 'performance_issue',
        severity: calculatedMetrics.average_response_time_ms > 2000 ? 'critical' : 'high',
        message: `Permission check response time is ${(calculatedMetrics.average_response_time_ms / 1000).toFixed(2)}s`,
        threshold: 1000,
        current_value: calculatedMetrics.average_response_time_ms
      })
    } else if (calculatedMetrics.average_response_time_ms > 500) { // > 500ms
      this.alerts.push({
        type: 'performance_issue',
        severity: 'medium',
        message: `Permission checks are slower than expected: ${(calculatedMetrics.average_response_time_ms / 1000).toFixed(2)}s`,
        threshold: 500,
        current_value: calculatedMetrics.average_response_time_ms
      })
    }

    // Cache issues alert
    if (calculatedMetrics.cache_hit_rate < 50) { // < 50% cache hit rate
      this.alerts.push({
        type: 'cache_issues',
        severity: calculatedMetrics.cache_hit_rate < 25 ? 'high' : 'medium',
        message: `Low cache hit rate: ${(calculatedMetrics.cache_hit_rate).toFixed(2)}%`,
        threshold: 50,
        current_value: calculatedMetrics.cache_hit_rate
      })
    }

    // Permission anomaly alerts
    const highSeverityPatterns = calculatedMetrics.unusual_denial_patterns.filter(p => p.severity === 'high')
    const mediumSeverityPatterns = calculatedMetrics.unusual_denial_patterns.filter(p => p.severity === 'medium')

    if (highSeverityPatterns.length > 0) {
      this.alerts.push({
        type: 'permission_anomaly',
        severity: 'high',
        message: `High severity permission anomalies detected: ${highSeverityPatterns.length} patterns`,
        threshold: 0,
        current_value: highSeverityPatterns.length,
        affected_actions: highSeverityPatterns.map(p => p.action)
      })
    } else if (mediumSeverityPatterns.length > 2) {
      this.alerts.push({
        type: 'permission_anomaly',
        severity: 'medium',
        message: `Multiple permission anomalies detected: ${mediumSeverityPatterns.length} patterns`,
        threshold: 2,
        current_value: mediumSeverityPatterns.length,
        affected_actions: mediumSeverityPatterns.map(p => p.action)
      })
    }

    // Low volume alert
    if (calculatedMetrics.checks_last_hour < 10 && calculatedMetrics.checks_last_24h > 100) {
      this.alerts.push({
        type: 'performance_issue',
        severity: 'low',
        message: `Low permission check volume in last hour: ${calculatedMetrics.checks_last_hour} checks`,
        threshold: 10,
        current_value: calculatedMetrics.checks_last_hour
      })
    }

    return this.alerts
  }

  determinePermissionHealth(metrics: any, alerts: any[]): 'healthy' | 'degraded' | 'critical' {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length
    const highAlerts = alerts.filter(a => a.severity === 'high').length

    if (criticalAlerts > 0 || highAlerts > 2) {
      return 'critical'
    } else if (highAlerts > 0 || alerts.length > 3) {
      return 'degraded'
    } else if (metrics.denial_rate > 15 || metrics.average_response_time_ms > 500) {
      return 'degraded'
    } else if (metrics.cache_hit_rate < 50) {
      return 'degraded'
    }

    return 'healthy'
  }

  async logMonitoringResults(health: string, metrics: any, alerts: any[]): Promise<void> {
    try {
      await this.supabase
        .from('permission_monitoring_logs')
        .insert({
          permission_health: health,
          total_checks: metrics.total_permission_checks,
          denial_rate: metrics.denial_rate,
          cache_hit_rate: metrics.cache_hit_rate,
          average_response_time_ms: metrics.average_response_time_ms,
          unusual_patterns_count: metrics.unusual_denial_patterns.length,
          alerts_count: alerts.length,
          critical_alerts_count: alerts.filter(a => a.severity === 'critical').length,
          created_at: new Date().toISOString()
        })
    } catch (error) {
      console.error('Failed to log permission monitoring results:', error)
    }
  }

  async sendAlerts(alerts: any[]): Promise<void> {
    for (const alert of alerts) {
      try {
        await this.supabase
          .from('permission_alerts')
          .insert({
            alert_type: alert.type,
            severity: alert.severity,
            message: alert.message,
            threshold: alert.threshold,
            current_value: alert.current_value,
            affected_actions: alert.affected_actions,
            created_at: new Date().toISOString(),
            resolved: false
          })

        console.log(`Permission alert sent: ${alert.type} - ${alert.message}`)
      } catch (error) {
        console.error('Failed to send permission alert:', error)
      }
    }
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check authorization
    const authHeader = req.headers.get('Authorization')
    let isAuthorized = false
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      
      if (!authError && user) {
        // Check if user is admin
        const { data: userData } = await supabase
          .from('users')
          .select('plan_type')
          .eq('id', user.id)
          .single()
        
        isAuthorized = userData?.plan_type === 'lifetime' // Simple admin check
      }
    }

    // Allow cron job execution
    const cronKey = req.headers.get('X-Cron-Key')
    if (cronKey === Deno.env.get('CRON_SECRET_KEY')) {
      isAuthorized = true
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Starting permission service monitoring...')

    // Initialize monitor
    const monitor = new PermissionMonitor(supabase)

    // Get permission logs for different time ranges
    const logs24h = await monitor.getPermissionLogs('24h')
    const logs1h = await monitor.getPermissionLogs('1h')
    
    // Get recent denials
    const recentDenials = await monitor.getRecentDenials(20)

    // Calculate metrics
    const calculatedMetrics = monitor.calculateMetrics(logs24h)

    // Check for alerts
    const alerts = monitor.checkAlerts(logs24h, calculatedMetrics)

    // Determine permission health
    const permissionHealth = monitor.determinePermissionHealth(calculatedMetrics, alerts)

    // Send alerts if any
    if (alerts.length > 0) {
      await monitor.sendAlerts(alerts)
    }

    // Log monitoring results
    await monitor.logMonitoringResults(permissionHealth, calculatedMetrics, alerts)

    console.log(`Permission monitoring completed:`)
    console.log(`- Health status: ${permissionHealth}`)
    console.log(`- Total checks (24h): ${calculatedMetrics.total_permission_checks}`)
    console.log(`- Denial rate: ${calculatedMetrics.denial_rate.toFixed(2)}%`)
    console.log(`- Cache hit rate: ${calculatedMetrics.cache_hit_rate.toFixed(2)}%`)
    console.log(`- Average response time: ${(calculatedMetrics.average_response_time_ms / 1000).toFixed(2)}s`)
    console.log(`- Unusual patterns: ${calculatedMetrics.unusual_denial_patterns.length}`)
    console.log(`- Alerts triggered: ${alerts.length}`)

    const response: PermissionMonitoringResponse = {
      success: true,
      permission_health: permissionHealth,
      metrics: calculatedMetrics,
      alerts: alerts,
      recent_denials: recentDenials.map(denial => ({
        user_id: denial.user_id,
        action: denial.action,
        reason: denial.reason || 'Unknown',
        timestamp: denial.created_at,
        user_plan: denial.user_plan
      }))
    }

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error in permission monitoring:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        details: errorMessage
      } as PermissionMonitoringResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
