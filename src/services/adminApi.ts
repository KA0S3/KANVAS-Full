// Simple API client for admin operations
// Replace direct Supabase queries with these calls
import { supabase } from '@/lib/supabase'
import { USE_SUPABASE } from '@/config/features'

const API_BASE_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') + '/functions/v1'

interface ApiResponse<T> {
  data?: T
  error?: string
}

// Helper function to get auth headers
const getAuthHeaders = async () => {
  if (!USE_SUPABASE) {
    return null
  }

  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Authorization': `Bearer ${session?.access_token || ''}`,
    'Content-Type': 'application/json'
  }
}

// Admin Users API
export const fetchAdminUsers = async (page = 1, search = ''): Promise<ApiResponse<any[]>> => {
  if (!USE_SUPABASE) {
    return { error: 'Admin cloud APIs are disabled when USE_SUPABASE=false' }
  }

  try {
    const headers = await getAuthHeaders()
    const url = `${API_BASE_URL}/admin-users?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ''}`
    
    const response = await fetch(url, {
      method: 'GET',
      headers
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Failed to fetch admin users:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Admin Promo Codes API
export const fetchAdminPromoCodes = async (): Promise<ApiResponse<any[]>> => {
  if (!USE_SUPABASE) {
    return { error: 'Admin cloud APIs are disabled when USE_SUPABASE=false' }
  }

  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/admin-promo-codes`, {
      method: 'GET',
      headers
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Failed to fetch promo codes:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Admin Owner Keys API
export const fetchAdminOwnerKeys = async (): Promise<ApiResponse<any[]>> => {
  if (!USE_SUPABASE) {
    return { error: 'Admin cloud APIs are disabled when USE_SUPABASE=false' }
  }

  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/admin-owner-keys`, {
      method: 'GET',
      headers
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Failed to fetch owner keys:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Additional functions for admin operations
export const updateUser = async (userId: string, updates: any): Promise<ApiResponse<any>> => {
  if (!USE_SUPABASE) {
    return { error: 'Admin cloud APIs are disabled when USE_SUPABASE=false' }
  }

  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/admin-users`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ userId, updates })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Failed to update user:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export const createPromoCode = async (promoData: any): Promise<ApiResponse<any>> => {
  if (!USE_SUPABASE) {
    return { error: 'Admin cloud APIs are disabled when USE_SUPABASE=false' }
  }

  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/admin-promo-codes`, {
      method: 'POST',
      headers,
      body: JSON.stringify(promoData)
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Failed to create promo code:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export const createOwnerKey = async (email: string, notes?: string): Promise<ApiResponse<any>> => {
  if (!USE_SUPABASE) {
    return { error: 'Admin cloud APIs are disabled when USE_SUPABASE=false' }
  }

  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/admin-owner-keys`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, notes })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Failed to create owner key:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
