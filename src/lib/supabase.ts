import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL environment variable is missing')
}

if (!supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_ANON_KEY environment variable is missing')
}

// Runtime validation to prevent service_role keys in client code
if (supabaseAnonKey.includes('service_role') || supabaseAnonKey.startsWith('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service_role')) {
  throw new Error('SECURITY ERROR: Service role key detected in client code. This would expose complete database access to browsers.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
export { createClient }
