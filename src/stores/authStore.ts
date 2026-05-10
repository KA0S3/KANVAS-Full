import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { secureStorage } from '@/utils/secureStorage';
import { dataMigrationService, type MigrationConflict, type MigrationResult } from '@/services/dataMigrationService';
import { getPlanConfig, migrateLegacyPlanId } from '@/lib/plans';
import { getEffectiveLimitsWithFallback, type EffectiveLimits } from '@/services/effectiveLimitsService';
import { updateQuotaBasedOnPlan } from './cloudStore';
import { ownerKeyService } from '@/services/ownerKeyService';
import type { User } from '@supabase/supabase-js';
import { performanceMonitor } from '@/utils/performanceMonitor';
import { logAuth, reportError } from '@/utils/logger';
import { 
  getStorageBehavior, 
  shouldUseLocalStorage, 
  shouldSyncToCloud, 
  shouldPersistData, 
  shouldSyncMetadata, 
  shouldMonitorQuota,
  validateStorageOperation 
} from '@/config/plans';

type Plan = 'guest' | 'free' | 'pro' | 'lifetime' | 'owner';

interface OwnerKeyInfo {
  isValid: boolean;
  scopes?: {
    ads: boolean;
    max_storage_bytes?: number;
    import_export: boolean;
    [key: string]: any;
  };
  userId?: string;
}

interface LicenseInfo {
  id: string;
  license_type: 'trial' | 'basic' | 'premium' | 'enterprise' | 'custom';
  status: 'active' | 'expired' | 'suspended' | 'cancelled';
  features?: Record<string, any>;
  expires_at?: string;
}

interface AuthStore {
  user: User | null;
  plan: Plan;
  isAuthenticated: boolean;
  loading: boolean;
  planLoading: boolean;
  ownerKeyInfo: OwnerKeyInfo | null;
  licenseInfo: LicenseInfo | null;
  effectiveLimits: EffectiveLimits | null;
  isVerificationPending: boolean;
  verificationEmail: string | null;
  _lastFetchedUserId?: string; // Prevent duplicate fetches
  _authStateInitialized?: boolean; // Prevent multiple initializations
  _lastAuthStateChange?: number; // Track last auth state change for debouncing
  _authStateDebounceTime?: number; // Debounce time for auth state changes
  _userExistsCache?: Map<string, { exists: boolean; providers: string[]; timestamp: number }>; // Cache for user existence checks
  
  // Methods
  initializeAuth: () => void;
  signIn: (email: string, password: string) => Promise<{ error?: string; success?: boolean; provider?: string }>;
  signInWithGoogle: () => Promise<{ error?: string; success?: boolean }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; success?: boolean; provider?: string }>;
  signOut: () => Promise<void>;
  setPlan: (plan: Plan) => void;
  fetchUserPlan: (userId: string) => Promise<void>;
  fetchUserLicense: (userId: string) => Promise<void>;
  fetchOwnerKeys: (userId: string) => Promise<void>;
  validateOwnerKey: (token: string) => Promise<{ error?: string; success?: boolean }>;
  clearOwnerKey: () => Promise<void>;
  updateEffectiveLimits: () => Promise<void>;
  refreshUserData: () => Promise<void>; // New method for real-time updates
  clearAllAuthData: () => void; // Debug method to clear all auth data
  setVerificationPending: (pending: boolean, email?: string) => void; // New method for verification state
  
  // Enhanced auth methods for provider conflict resolution
  checkUserExists: (email: string) => Promise<{ exists: boolean; providers: string[]; userId?: string }>;
  linkPasswordToGoogleUser: (email: string, password: string) => Promise<{ error?: string; success?: boolean; message?: string }>;
  createPasswordForGoogleUser: (email: string, newPassword: string, resetToken?: string) => Promise<{ error?: string; success?: boolean; message?: string }>;
  detectAuthProvider: (email: string) => Promise<{ provider: string | null; canUseEmail: boolean; canUseGoogle: boolean }>;
  
  // Data migration methods
  checkForMigrationConflicts: (userId: string) => Promise<MigrationConflict | null>;
  shouldShowGuestImport: () => Promise<boolean>;
  executeDataMigration: (strategy: any, userId: string) => Promise<MigrationResult>;
  
  // Plan-based storage behavior methods
  getStorageBehavior: () => ReturnType<typeof getStorageBehavior>;
  shouldUseLocalStorage: () => boolean;
  shouldSyncToCloud: () => boolean;
  shouldPersistData: () => boolean;
  shouldSyncMetadata: () => boolean;
  shouldMonitorQuota: () => boolean;
  validateStorageOperation: (operation: 'localStorage' | 'cloudSync' | 'metadataSync' | 'quotaMonitoring') => boolean;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      plan: 'guest',
      isAuthenticated: false,
      loading: true,
      planLoading: true,
      ownerKeyInfo: null,
      licenseInfo: null,
      effectiveLimits: null,
      isVerificationPending: false,
      verificationEmail: null,
      _userExistsCache: new Map(),

      // Initialize auth listener
      initializeAuth: () => {
        // Clear old persisted _authStateInitialized if it exists in localStorage
        try {
          const stored = localStorage.getItem('kanvas-auth');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.state?._authStateInitialized) {
              logAuth('Clearing old persisted _authStateInitialized');
              delete parsed.state._authStateInitialized;
              localStorage.setItem('kanvas-auth', JSON.stringify(parsed));
            }
          }
        } catch (e) {
          // Ignore storage errors
        }

        // Prevent multiple initializations
        if (get()._authStateInitialized) {
          logAuth('Auth store already initialized');
          return;
        }

        logAuth('Initializing auth store');
        set({ _authStateInitialized: true, loading: true });
        
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            logAuth('Auth state changed:', { event, email: session?.user?.email });
            
            // Debounce rapid auth state changes
            const now = Date.now();
            const lastChange = get()._lastAuthStateChange || 0;
            const debounceTime = 200; // 200ms debounce
            
            if (now - lastChange < debounceTime) {
              logAuth('Auth state change debounced');
              return;
            }
            
            // Track auth state changes
            performanceMonitor.incrementAuthRequests();
            set({ _lastAuthStateChange: now });
            
            if (session?.user) {
              // User is signed in
              const currentUserId = session.user.id;
              const lastUserId = get()._lastFetchedUserId;
              
              // Clear verification pending state when user successfully signs in
              if (get().isVerificationPending) {
                set({ isVerificationPending: false, verificationEmail: null });
              }
              
              // Only fetch plan data if user actually changed
              if (currentUserId !== lastUserId) {
                set({
                  user: session.user,
                  isAuthenticated: true,
                  loading: false,
                  planLoading: true,
                  ownerKeyInfo: null,
                });
                
                // Fetch user data
                await Promise.all([
                  get().fetchUserPlan(session.user.id),
                  get().fetchUserLicense(session.user.id),
                  get().fetchOwnerKeys(session.user.id),
                ]);
              } else {
                // Just update user object, don't re-fetch plan
                set({
                  user: session.user,
                  isAuthenticated: true,
                  loading: false,
                  isVerificationPending: false,
                  verificationEmail: null,
                });
              }
            } else {
              // User is signed out
              set({
                user: null,
                plan: 'guest',
                isAuthenticated: false,
                loading: false,
                planLoading: false,
                ownerKeyInfo: null,
                licenseInfo: null,
                effectiveLimits: null,
                isVerificationPending: false,
                verificationEmail: null,
                _lastFetchedUserId: undefined,
                _authStateInitialized: false,
              });
              updateQuotaBasedOnPlan();
            }
          }
        );

        // Improved session check without conflicting timeout
        const sessionPromise = supabase.auth.getSession();
        
        sessionPromise.then(async ({ data: { session } }) => {
          logAuth('Initial session resolved:', { email: session?.user?.email });
          if (session?.user) {
            set({
              user: session.user,
              isAuthenticated: true,
              loading: false,
              planLoading: true,
              ownerKeyInfo: null,
              _lastFetchedUserId: session.user.id,
            });
            await Promise.all([
              get().fetchUserPlan(session.user.id),
              get().fetchUserLicense(session.user.id),
              get().fetchOwnerKeys(session.user.id),
            ]);
          } else {
            set({
              user: null,
              plan: 'guest',
              isAuthenticated: false,
              loading: false,
              planLoading: false,
              ownerKeyInfo: null,
              licenseInfo: null,
              effectiveLimits: null,
              _lastFetchedUserId: undefined,
            });
          }
        }).catch((error) => {
          reportError(error, 'authStore.sessionCheck', 'Session check failed');
          // Ensure loading is set to false even on error
          set({
            user: null,
            plan: 'guest',
            isAuthenticated: false,
            loading: false,
            planLoading: false,
            ownerKeyInfo: null,
            licenseInfo: null,
            effectiveLimits: null,
            _lastFetchedUserId: undefined,
          });
        });

        // Return cleanup function
        return () => {
          subscription.unsubscribe();
        };
      },

      // Sign in method - OPTIMIZED
      signIn: async (email: string, password: string) => {
        try {
          logAuth('Starting sign in process for:', email);
          
          // OPTIMIZED: Skip provider detection for initial attempt, only check on failure
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            reportError(error, 'authStore.signIn', 'Sign in error');
            
            // Only check for provider conflicts if it's likely to be a provider issue
            if (error.message === 'Invalid login credentials') {
              // Quick provider check without full detection flow
              const userCheck = await get().checkUserExists(email);
              if (userCheck.exists && userCheck.providers.includes('google') && !userCheck.providers.includes('email')) {
                return { 
                  error: 'This email is registered with Google. Please sign in with Google instead.',
                  provider: 'google'
                };
              }
            }
            
            return { error: error.message };
          }

          logAuth('Sign in successful');
          // The onAuthStateChange listener will handle updating the state
          return { success: true };
        } catch (error) {
          reportError(error, 'authStore.signIn', 'Unexpected sign in error');
          return { error: 'An unexpected error occurred during sign in' };
        }
      },

      // Sign in with Google method
      signInWithGoogle: async () => {
        try {
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${window.location.origin}/auth/callback`,
            },
          });

          if (error) {
            reportError(error, 'authStore.signInWithGoogle', 'Google sign in error');
            return { error: error.message };
          }

          // OAuth flow will redirect to Google, then to our callback
          // The onAuthStateChange listener will handle updating the state
          return { success: true };
        } catch (error) {
          reportError(error, 'authStore.signInWithGoogle', 'Unexpected Google sign in error');
          return { error: 'An unexpected error occurred during Google sign in' };
        }
      },

      // Sign up method
      signUp: async (email: string, password: string) => {
        try {
          logAuth('Starting sign up process for:', email);
          
          // First check if user already exists
          const userCheck = await get().checkUserExists(email);
          
          if (userCheck.exists) {
            logAuth('User already exists with providers:', userCheck.providers);
            
            if (userCheck.providers.includes('google') && userCheck.providers.includes('email')) {
              return { 
                error: 'This email is already registered. Please sign in instead, or if you\'re a Google user, click "Create password" to set up email access.',
                provider: 'conflict'
              };
            } else if (userCheck.providers.includes('google')) {
              return { 
                error: 'This email is already registered with Google. Would you like to sign in with Google, or create a password for your account?',
                provider: 'google'
              };
            } else if (userCheck.providers.includes('email')) {
              return { 
                error: 'An account with this email already exists. Please sign in instead.',
                provider: 'email'
              };
            } else {
              return { 
                error: 'An account with this email already exists. Please sign in with the correct method.',
                provider: userCheck.providers[0] || 'unknown'
              };
            }
          }
          
          // Attempt to sign up the user
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/confirm?redirectTo=${import.meta.env.VITE_APP_URL || window.location.origin}`,
            }
          });

          if (error) {
            reportError(error, 'authStore.signUp', 'Sign up error');
            
            // Handle specific Supabase errors that might indicate user exists
            if (error.message.includes('user_already_exists') || 
                error.message.includes('duplicate') ||
                error.message.includes('already registered')) {
              
              // Double-check with our own detection
              const doubleCheck = await get().checkUserExists(email);
              if (doubleCheck.exists) {
                if (doubleCheck.providers.includes('google')) {
                  return { 
                    error: 'This email is already registered with Google. Please sign in with Google instead.',
                    provider: 'google'
                  };
                } else {
                  return { 
                    error: 'An account with this email already exists. Please sign in instead.',
                    provider: 'email'
                  };
                }
              }
            }
            
            return { error: error.message };
          }

          logAuth('Sign up response received:', { 
            user: !!data.user, 
            emailConfirmed: !!data.user?.email_confirmed_at 
          });

          // Handle different sign up scenarios
          if (data.user && !data.user.email_confirmed_at) {
            logAuth('User created, email confirmation required');
            set({ isVerificationPending: true, verificationEmail: email });
            return { success: true };
          } else if (data.user && data.user.email_confirmed_at) {
            logAuth('User created and already confirmed');
            // User is already confirmed (might happen if email confirmation is disabled)
            return { success: true };
          } else {
            logAuth('No user object returned, likely email confirmation required');
            // This is the "fake success" case - Supabase returns success but no user object
            // when email confirmation is enabled and user needs to confirm
            set({ isVerificationPending: true, verificationEmail: email });
            return { success: true };
          }
        } catch (error) {
          reportError(error, 'authStore.signUp', 'Unexpected sign up error');
          return { error: 'An unexpected error occurred during sign up' };
        }
      },

      // Sign out method - IMPROVED
      signOut: async () => {
        try {
          logAuth('Starting sign out process');
          
          // Sign out from Supabase first - this will trigger the auth state change listener
          const { error } = await supabase.auth.signOut();
          
          if (error) {
            reportError(error, 'authStore.signOut', 'Supabase sign out error');
            // Continue with cleanup even if Supabase sign out fails
          }
          
          // Clear all session storage after Supabase sign out
          try {
            const storageKeys = [
              'supabase.auth.token',
              'supabase.auth.refreshToken',
              'supabase.auth.codeVerifier',
              'supabase.auth.pkceCodeVerifier'
            ];
            
            storageKeys.forEach(key => {
              localStorage.removeItem(key);
              sessionStorage.removeItem(key);
            });
            
            // Clear our auth store persisted data
            localStorage.removeItem('kanvas-auth');
            
            logAuth('Cleared all session storage');
          } catch (clearError) {
            reportError(clearError, 'authStore.signOut', 'Error clearing session storage');
          }
          
          logAuth('Sign out completed successfully');
        } catch (error) {
          reportError(error, 'authStore.signOut', 'Unexpected sign out error');
          // Ensure state is cleared even on unexpected errors
          set({
            user: null,
            plan: 'guest',
            isAuthenticated: false,
            loading: false,
            planLoading: false,
            ownerKeyInfo: null,
            licenseInfo: null,
            effectiveLimits: null,
            _lastFetchedUserId: undefined,
            _authStateInitialized: false,
          });
          localStorage.removeItem('kanvas-auth');
          updateQuotaBasedOnPlan();
          throw error;
        }
      },

      // Set plan method
      setPlan: (plan: Plan) => {
        set({ plan });
      },

      // Fetch user plan from Supabase - OPTIMIZED
      fetchUserPlan: async (userId: string) => {
        // Prevent duplicate fetches for same user
        const lastFetched = get()._lastFetchedUserId;
        if (lastFetched === userId && get().planLoading) {
          logAuth(`Skipping duplicate fetch for user: ${userId}`);
          return;
        }

        try {
          logAuth(`Fetching plan for user: ${userId}`);
          set({ planLoading: true, _lastFetchedUserId: userId });
          
          // OWNER CHECK: Immediate owner fallback - Check if this is the owner email first
          const ownerEmail = import.meta.env?.VITE_OWNER_EMAIL;
          const currentUser = get().user;
          if (currentUser?.email === ownerEmail) {
            logAuth('IMMEDIATE OWNER FALLBACK - Setting owner plan');
            set({ plan: 'owner', planLoading: false });
            await get().updateEffectiveLimits();
            return;
          }
          
          // OPTIMIZED: Parallel plan detection with single timeout
          const fetchWithTimeout = async (timeoutMs: number) => {
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
            });
            return timeoutPromise;
          };

          try {
            // Run all detection methods in parallel and return the first successful result
            const planPromise = (async () => {
              // Method 1: Direct query to users table
              try {
                const { data, error } = await supabase
                  .from('users')
                  .select('plan_type')
                  .eq('id', userId)
                  .single();

                if (!error && data) {
                  const userPlan = migrateLegacyPlanId(data?.plan_type as Plan || 'free') as Plan;
                  logAuth(`Direct query success: ${userPlan}`);
                  return userPlan;
                }
              } catch (err) {
                logAuth('Direct query failed:', err);
              }

              // Method 2: Auth metadata fallback
              try {
                const { data: { user } } = await supabase.auth.getUser();
                const metadataPlan = user?.user_metadata?.plan_type || user?.app_metadata?.plan_type;
                if (metadataPlan) {
                  const userPlan = migrateLegacyPlanId(metadataPlan as Plan) as Plan;
                  logAuth(`Metadata fallback success: ${userPlan}`);
                  return userPlan;
                }
              } catch (err) {
                logAuth('Metadata fallback failed:', err);
              }

              // Method 3: Check if user has active licenses as fallback
              try {
                const { data: licenseData } = await supabase
                  .from('licenses')
                  .select('license_type')
                  .eq('user_id', userId)
                  .eq('status', 'active')
                  .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
                  .limit(1)
                  .maybeSingle();

                if (licenseData) {
                  // Map license types to plans
                  const licenseToPlanMap: Record<string, Plan> = {
                    'trial': 'free',
                    'basic': 'free',
                    'premium': 'pro',
                    'enterprise': 'lifetime',
                    'custom': 'lifetime'
                  };
                  const userPlan = licenseToPlanMap[licenseData.license_type] || 'free';
                  logAuth(`License fallback success: ${userPlan}`);
                  return userPlan;
                }
              } catch (err) {
                logAuth('License fallback failed:', err);
              }

              return null;
            })();

            // Race between plan detection and timeout (reduced from 3000ms to 1500ms)
            const result = await Promise.race([planPromise, fetchWithTimeout(1500)]);
            
            if (result) {
              set({ plan: result, planLoading: false });
              await get().updateEffectiveLimits();
              return;
            }
          } catch (err) {
            logAuth('All plan detection methods failed or timed out');
          }

          // Final fallback
          logAuth('Using default plan: guest');
          set({ plan: 'guest', planLoading: false });
          await get().updateEffectiveLimits();
          
        } catch (error) {
          reportError(error, 'authStore.fetchUserPlan', 'Unexpected error fetching user plan');
          set({ plan: 'guest', planLoading: false });
          await get().updateEffectiveLimits();
        }
      },

// ... (rest of the code remains the same)
      // Validate owner key token
      validateOwnerKey: async (token: string) => {
        try {
          const result = await ownerKeyService.validateOwnerKey(token);
          
          if (result.isValid && result.scopes && result.userId) {
            set({
              ownerKeyInfo: {
                isValid: true,
                scopes: result.scopes,
                userId: result.userId
              }
            });
            await get().updateEffectiveLimits();
            return { success: true };
          } else {
            set({ ownerKeyInfo: null });
            await get().updateEffectiveLimits();
            return { error: result.error || 'Invalid owner key' };
          }
        } catch (error) {
          reportError(error, 'authStore.validateOwnerKey', 'Owner key validation error');
          set({ ownerKeyInfo: null });
          await get().updateEffectiveLimits();
          return { error: 'Owner key validation failed' };
        }
      },

      // Clear owner key
      clearOwnerKey: async () => {
        set({ ownerKeyInfo: null });
        await get().updateEffectiveLimits();
      },

      // Fetch user license from Supabase
      fetchUserLicense: async (userId: string) => {
        try {
          const { data, error } = await supabase
            .from('licenses')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) {
            logAuth('Failed to fetch user license:', error);
            set({ licenseInfo: null });
            await get().updateEffectiveLimits();
            return;
          }

          set({ licenseInfo: data });
          await get().updateEffectiveLimits();
        } catch (error) {
          logAuth('Unexpected error fetching user license:', error);
          set({ licenseInfo: null });
          await get().updateEffectiveLimits();
        }
      },

      // Fetch owner keys for user
      fetchOwnerKeys: async (userId: string) => {
        try {
          const { data, error } = await supabase
            .from('owner_keys')
            .select('*')
            .eq('user_id', userId)
            .eq('is_revoked', false)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1);

          if (error) {
            logAuth('Failed to fetch owner keys:', error);
            set({ ownerKeyInfo: null });
            await get().updateEffectiveLimits();
            return;
          }

          if (data && data.length > 0) {
            const ownerKey = data[0];
            set({
              ownerKeyInfo: {
                isValid: true,
                scopes: ownerKey.scopes,
                userId: ownerKey.user_id
              }
            });
          } else {
            set({ ownerKeyInfo: null });
          }
          await get().updateEffectiveLimits();
        } catch (error) {
          logAuth('Unexpected error fetching owner keys:', error);
          set({ ownerKeyInfo: null });
          await get().updateEffectiveLimits();
        }
      },

  // Update effective limits using server-side computation
  updateEffectiveLimits: async () => {
    const { user } = get();
    
    if (!user) {
      // For guest users, set minimal limits
      const guestLimits: EffectiveLimits = {
        quotaBytes: 0,
        maxBooks: 1,
        adsEnabled: true,
        importExportEnabled: false,
        source: {
          plan: 'guest'
        }
      };
      set({ effectiveLimits: guestLimits });
      updateQuotaBasedOnPlan();
      return;
    }

    // OWNER CHECK: Immediate owner detection before server call
    const ownerEmail = import.meta.env?.VITE_OWNER_EMAIL;
    if (user.email === ownerEmail) {
      logAuth('🚀 IMMEDIATE OWNER DETECTION - Setting owner limits');
      const ownerLimits: EffectiveLimits = {
        quotaBytes: 10 * 1024 * 1024 * 1024, // 10GB
        maxBooks: -1, // Unlimited books
        adsEnabled: false, // No ads
        importExportEnabled: true, // Full access
        source: {
          plan: 'owner'
        }
      };
      set({ effectiveLimits: ownerLimits, plan: 'owner' });
      updateQuotaBasedOnPlan();
      return;
    }

    try {
      // Fetch authoritative effective limits from server
      const limits = await getEffectiveLimitsWithFallback();
      set({ effectiveLimits: limits });
      
      // Update cloudStore quota based on new effective limits
      updateQuotaBasedOnPlan();
      
      logAuth('Updated effective limits from server:', limits);
    } catch (error) {
      reportError(error, 'authStore.updateEffectiveLimits', 'Failed to update effective limits');
      
      // Fallback to client-side computation if server fails
      const { plan, ownerKeyInfo, licenseInfo } = get();
      let limits = ownerKeyService.applyOwnerKeyOverrides(plan, ownerKeyInfo?.scopes);
      
      if (licenseInfo && licenseInfo.features) {
        limits = ownerKeyService.applyLicenseOverrides(limits, licenseInfo.features);
      }
      
      // Convert to EffectiveLimits format
      const fallbackLimits: EffectiveLimits = {
        quotaBytes: limits.quotaBytes,
        maxBooks: limits.maxBooks,
        adsEnabled: limits.adsEnabled,
        importExportEnabled: limits.importExportEnabled,
        expiresAt: licenseInfo?.expires_at,
        source: {
          plan: limits.effectivePlan,
          licenseId: licenseInfo?.id,
          ownerKeyId: ownerKeyInfo?.userId ? 'owner-key' : undefined
        }
      };
      
      set({ effectiveLimits: fallbackLimits });
      updateQuotaBasedOnPlan();
    }
  },

  // Refresh user data for real-time updates
  refreshUserData: async () => {
    const { user } = get();
    
    if (!user) {
      logAuth('Cannot refresh user data: no authenticated user');
      return;
    }

    logAuth('Refreshing user data for real-time updates');
    
    try {
      // Refresh all user data in parallel
      await Promise.all([
        get().fetchUserPlan(user.id),
        get().fetchUserLicense(user.id),
        get().fetchOwnerKeys(user.id),
        get().updateEffectiveLimits()
      ]);
      
      logAuth('Successfully refreshed user data');
    } catch (error) {
      reportError(error, 'authStore.refreshUserData', 'Failed to refresh user data');
    }
  },

  // Set verification pending state
  setVerificationPending: (pending: boolean, email?: string) => {
    set({
      isVerificationPending: pending,
      verificationEmail: email || null,
    });
  },

  // Debug method to clear all auth data
  clearAllAuthData: () => {
    logAuth('Clearing all auth data (debug method)');
    
    // Clear all Supabase session storage first
    try {
      const storageKeys = [
        'supabase.auth.token',
        'supabase.auth.refreshToken',
        'supabase.auth.codeVerifier',
        'supabase.auth.pkceCodeVerifier'
      ];
      
      storageKeys.forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
    } catch (clearError) {
      reportError(clearError, 'authStore.clearAllAuthData', 'Error clearing session storage in debug method');
    }
    
    set({
      user: null,
      plan: 'guest',
      isAuthenticated: false,
      loading: false,
      planLoading: false,
      ownerKeyInfo: null,
      licenseInfo: null,
      effectiveLimits: null,
      isVerificationPending: false,
      verificationEmail: null,
      _lastFetchedUserId: undefined,
    });
    localStorage.removeItem('kanvas-auth');
    updateQuotaBasedOnPlan();
  },

  // Enhanced auth methods for provider conflict resolution

  // Plan-based storage behavior methods
  getStorageBehavior: () => {
    const state = get();
    return getStorageBehavior(state.plan);
  },

  shouldUseLocalStorage: () => {
    const state = get();
    return shouldUseLocalStorage(state.plan);
  },

  shouldSyncToCloud: () => {
    const state = get();
    return shouldSyncToCloud(state.plan);
  },

  shouldPersistData: () => {
    const state = get();
    return shouldPersistData(state.plan);
  },

  shouldSyncMetadata: () => {
    const state = get();
    return shouldSyncMetadata(state.plan);
  },

  shouldMonitorQuota: () => {
    const state = get();
    return shouldMonitorQuota(state.plan);
  },

  validateStorageOperation: (operation: 'localStorage' | 'cloudSync' | 'metadataSync' | 'quotaMonitoring') => {
    const state = get();
    return validateStorageOperation(state.plan, operation);
  },

  // Check if user exists and what providers they have (OPTIMIZED - minimal DB calls)
  checkUserExists: async (email: string) => {
    try {
      const now = Date.now();
      const CACHE_TTL = 5000; // 5 seconds

      // Check cache first
      const cached = get()._userExistsCache.get(email);
      if (cached && now - cached.timestamp < CACHE_TTL) {
        logAuth('Using cached user existence check');
        return cached;
      }

      logAuth('Checking if user exists:', email);

      // Only check current session - no extra DB calls
      const { data: { user } } = await supabase.auth.getUser();

      if (user?.email === email) {
        logAuth('User found in current session');
        const providers = Array.isArray(user.app_metadata?.provider)
          ? user.app_metadata.provider
          : user.app_metadata?.provider
            ? [user.app_metadata.provider]
            : [];
        
        const result = { exists: true, providers, userId: user.id };
        get()._userExistsCache.set(email, { ...result, timestamp: now });
        return result;
      }

      // Can't determine without extra DB calls - assume doesn't exist to allow sign up
      logAuth('User not in current session, assuming doesn\'t exist');
      const result = { exists: false, providers: [] };
      get()._userExistsCache.set(email, { ...result, timestamp: now });
      return result;

    } catch (error) {
      reportError(error, 'authStore.checkUserExists', 'Error checking user existence');
      return { exists: false, providers: [] };
    }
  },

  // Detect which auth provider a user can/should use
  detectAuthProvider: async (email: string) => {
    try {
      logAuth('Detecting auth provider for:', email);
      
      const userCheck = await get().checkUserExists(email);
      
      if (!userCheck.exists) {
        return { 
          provider: null, 
          canUseEmail: true, 
          canUseGoogle: true 
        };
      }
      
      const providers = userCheck.providers || [];
      const canUseEmail = providers.includes('email');
      const canUseGoogle = providers.includes('google');
      
      logAuth('Provider detection result:', {
        providers,
        canUseEmail,
        canUseGoogle
      });
      
      // If both providers are possible, we need to let the actual sign-in attempt determine
      if (providers.length > 1) {
        return {
          provider: null, // Let the actual sign-in determine
          canUseEmail: true,
          canUseGoogle: true
        };
      }
      
      return {
        provider: providers[0] || null,
        canUseEmail,
        canUseGoogle
      };
      
    } catch (error) {
      reportError(error, 'authStore.detectAuthProvider', 'Error detecting auth provider');
      return { 
        provider: null, 
        canUseEmail: true, 
        canUseGoogle: true 
      };
    }
  },

  // Link password to existing Google user
  linkPasswordToGoogleUser: async (email: string, password: string) => {
    try {
      logAuth('Attempting to link password to Google user:', email);
      
      // Method 1: Try to update the user's password directly
      // This requires the user to be authenticated first, so we'll use password reset
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/reset-password?setup=true`
      });
      
      if (error) {
        reportError(error, 'authStore.linkPasswordToGoogleUser', 'Error sending password reset');
        return { error: error.message };
      }
      
      logAuth('Password reset sent successfully');
      return { success: true, message: 'Password setup link sent to your email! Check your inbox to continue.' };
      
    } catch (error) {
      reportError(error, 'authStore.linkPasswordToGoogleUser', 'Unexpected error linking password');
      return { error: 'An unexpected error occurred while setting up password access' };
    }
  },

  // Enhanced method to create password for Google users
  createPasswordForGoogleUser: async (email: string, newPassword: string, resetToken?: string) => {
    try {
      logAuth('Creating password for Google user:', email);
      
      // This would typically be called from the reset password flow
      // For now, we'll use the reset password approach
      
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      
      if (error) {
        reportError(error, 'authStore.createPasswordForGoogleUser', 'Error updating password');
        return { error: error.message };
      }
      
      logAuth('Password created successfully');
      return { success: true, message: 'Password created successfully! You can now sign in with either Google or your password.' };
      
    } catch (error) {
      reportError(error, 'authStore.createPasswordForGoogleUser', 'Unexpected error creating password');
      return { error: 'An unexpected error occurred while creating your password' };
    }
  },

  // Data migration methods
  checkForMigrationConflicts: async (userId: string) => {
    try {
      logAuth('Checking for migration conflicts for user:', userId);
      const conflict = await dataMigrationService.checkMigrationConflicts(userId);
      return conflict;
    } catch (error) {
      reportError(error, 'authStore.checkForMigrationConflicts', 'Error checking migration conflicts');
      return null;
    }
  },

  shouldShowGuestImport: async () => {
    try {
      logAuth('Checking if guest import should be shown');
      const shouldShow = await dataMigrationService.shouldMigrateLocalData();
      return shouldShow;
    } catch (error) {
      reportError(error, 'authStore.shouldShowGuestImport', 'Error checking guest import');
      return false;
    }
  },

  executeDataMigration: async (strategy: any, userId: string) => {
    try {
      logAuth('Executing data migration with strategy:', strategy);
      const result = await dataMigrationService.executeMigration(strategy, userId);
      return result;
    } catch (error) {
      reportError(error, 'authStore.executeDataMigration', 'Error executing data migration');
      return {
        success: false,
        strategy,
        message: 'Migration failed. Please try again.'
      };
    }
  },
    }),
    {
      name: 'kanvas-auth',
      version: 2, // Force reset to clear old _authStateInitialized
      // Use secure storage for sensitive authentication data
      storage: {
        getItem: (name) => secureStorage.getItem(name),
        setItem: (name, value) => secureStorage.setItem(name, value, { encrypt: true }),
        removeItem: (name) => secureStorage.removeItem(name),
      },
      // Only persist minimal state - authentication should be fresh each time
      // Don't persist _authStateInitialized - it must always reset on page load
      partialize: (state) => ({
        plan: state.plan || 'guest',
        licenseInfo: state.licenseInfo,
        _lastFetchedUserId: state._lastFetchedUserId || '',
      } as any),
      // Don't persist authentication state to avoid sign out issues
      skipHydration: false,
    }
  )
);
