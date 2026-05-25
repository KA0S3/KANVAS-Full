import { createClient } from '@supabase/supabase-js'
import { USE_SUPABASE } from '@/config/features'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const disabledAuth = {
  getSession: async () => ({ data: { session: null }, error: null }),
  getUser: async () => ({ data: { user: null }, error: null }),
  refreshSession: async () => ({ data: { session: null }, error: null }),
  signOut: async () => ({ error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
}

const disabledStorage = new Proxy({}, {
  get() {
    return async () => ({ data: null, error: null })
  },
})

const disabledFunctions = {
  invoke: async () => ({ data: null, error: null }),
}

function createDisabledClient(): any {
  return {
    auth: disabledAuth,
    storage: {
      from() {
        return disabledStorage
      },
    },
    functions: disabledFunctions,
    rpc: async () => ({ data: null, error: null }),
    from() {
      return disabledStorage
    },
  }
}

let supabaseClient: any = createDisabledClient()

if (USE_SUPABASE) {
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

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
} else if (import.meta.env.DEV) {
  console.info('[Supabase] Skipped: USE_SUPABASE=false')
}

export const supabase = supabaseClient
export { createClient }
