/**
 * Centralized Permission Service
 * 
 * This service provides a single source of truth for all permission checks
 * across the application, eliminating duplicated permission logic.
 */

import { authenticateAndTranslatePlan, type AuthenticatedUser } from './authMiddleware.ts';

export type Action = 'create_book';

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  details?: any;
}

export interface PermissionContext {
  userId: string;
  resourceId?: string;
  resourceType?: string;
}

/**
 * Centralized permission service
 */
class PermissionService {
  /**
   * Check if a user can perform a specific action
   */
  async canUserPerform(
    supabase: any,
    authHeader: string | null,
    action: Action,
    context?: PermissionContext
  ): Promise<PermissionResult> {
    try {
      // Authenticate user and get effective limits
      const userInfo = await authenticateAndTranslatePlan(supabase, authHeader, `permission:${action}`);
      
      if (!userInfo) {
        return {
          allowed: false,
          reason: 'Authentication failed',
          details: { action }
        };
      }

      // Check permissions based on action
      switch (action) {
        case 'create_book':
          return this.checkCreateBookPermission(userInfo, context);
          
        default:
          return {
            allowed: false,
            reason: `Unknown action: ${action}`,
            details: { action }
          };
      }
    } catch (error) {
      console.error(`[PermissionService] Error checking permission for ${action}:`, error);
      return {
        allowed: false,
        reason: 'Internal permission check error',
        details: { action, error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Check book creation permissions
   */
  private checkCreateBookPermission(userInfo: AuthenticatedUser, context?: PermissionContext): PermissionResult {
    const { canonical_plan_id, effective_limits } = userInfo;
    
    // For now, all plans can create books within their limits
    // The actual book count limit should be enforced at the business logic layer
    return {
      allowed: true,
      details: {
        plan_type: canonical_plan_id,
        max_books: effective_limits.maxBooks
      }
    };
  }

  /**
   * Get user permissions for UI display purposes
   */
  async getUserPermissions(
    supabase: any,
    authHeader: string | null
  ): Promise<{
    canCreateBook: boolean;
    planType: string;
  }> {
    const createBook = await this.canUserPerform(supabase, authHeader, 'create_book');

    // Get plan info
    const userInfo = await authenticateAndTranslatePlan(supabase, authHeader, 'ui_permissions');
    const planType = userInfo?.canonical_plan_id || 'guest';

    return {
      canCreateBook: createBook.allowed,
      planType
    };
  }
}

// Export singleton instance
export const permissionService = new PermissionService();

/**
 * Helper function to wrap existing functions with permission checks
 */
export function withPermissionCheck<T extends any[], R>(
  permissionService: PermissionService,
  supabase: any,
  action: Action,
  contextFn?: (...args: T) => PermissionContext | undefined
) {
  return function(
    originalFunction: (...args: T) => Promise<R>,
    authHeader: string | null
  ): ((...args: T) => Promise<R>) {
    return async (...args: T): Promise<R> => {
      const context = contextFn ? contextFn(...args) : undefined;
      const permission = await permissionService.canUserPerform(supabase, authHeader, action, context);
      
      if (!permission.allowed) {
        const error = new Error(permission.reason || 'Permission denied');
        (error as any).status = 403;
        (error as any).details = permission.details;
        throw error;
      }
      
      return originalFunction(...args);
    };
  };
}
