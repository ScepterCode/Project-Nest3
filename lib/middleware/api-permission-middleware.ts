/**
 * API Permission Middleware
 * Provides permission checking for API endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PermissionChecker, Action, ResourceContext } from '@/lib/services/permission-checker';

const permissionChecker = new PermissionChecker({
  cacheEnabled: true,
  cacheTtl: 300, // 5 minutes
  bulkCheckLimit: 50
});

export interface ApiPermissionConfig {
  permission: string;
  action?: Action;
  resourceType?: string;
  getResourceContext?: (request: NextRequest, params?: any) => Promise<Partial<ResourceContext>>;
  skipAuth?: boolean;
}

/**
 * Higher-order function that wraps API handlers with permission checking
 */
export function withPermission(
  config: ApiPermissionConfig,
  handler: (request: NextRequest, context: { params?: any }) => Promise<NextResponse>
) {
  return async (request: NextRequest, context: { params?: any } = {}) => {
    try {
      // Skip auth if configured
      if (config.skipAuth) {
        return await handler(request, context);
      }

      // Get authenticated user
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }

      // Get resource context if provided
      let resourceContext: ResourceContext | undefined;
      if (config.getResourceContext) {
        const partialContext = await config.getResourceContext(request, context.params);
        resourceContext = {
          resourceId: partialContext.resourceId || 'unknown',
          resourceType: config.resourceType || partialContext.resourceType || 'unknown',
          ownerId: partialContext.ownerId,
          departmentId: partialContext.departmentId,
          institutionId: partialContext.institutionId,
          metadata: partialContext.metadata
        };
      }

      // Check permission
      const hasPermission = await permissionChecker.hasPermission(
        user.id,
        config.permission,
        resourceContext
      );

      if (!hasPermission) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Insufficient permissions',
            required_permission: config.permission
          },
          { status: 403 }
        );
      }

      // Add user and permission info to request context
      const enhancedContext = {
        ...context,
        user,
        resourceContext,
        hasPermission: true
      };

      return await handler(request, enhancedContext);

    } catch (error) {
      console.error('Permission middleware error:', error);
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Check if user can access a specific resource
 */
export async function checkResourceAccess(
  userId: string,
  resourceId: string,
  action: Action,
  resourceType: string,
  context?: Partial<ResourceContext>
): Promise<boolean> {
  try {
    return await permissionChecker.canAccessResource(
      userId,
      resourceId,
      action,
      {
        resourceType,
        ...context
      }
    );
  } catch (error) {
    console.error('Resource access check error:', error);
    return false;
  }
}

/**
 * Check if user is admin for a specific scope
 */
export async function checkAdminAccess(
  userId: string,
  scope: 'system' | 'institution' | 'department',
  scopeId?: string
): Promise<boolean> {
  try {
    return await permissionChecker.isAdmin(userId, scope, scopeId);
  } catch (error) {
    console.error('Admin access check error:', error);
    return false;
  }
}

/**
 * Get user's institution and department context from database
 */
export async function getUserContext(userId: string): Promise<{
  institutionId?: string;
  departmentId?: string;
  roles: string[];
}> {
  try {
    const supabase = await createClient();
    
    // Get user's active role assignments
    const { data: roleAssignments, error } = await supabase
      .from('user_role_assignments')
      .select('role, institution_id, department_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .or('expires_at.is.null');

    if (error) {
      console.error('Error fetching user context:', error);
      return { roles: [] };
    }

    const roles = (roleAssignments || []).map(ra => ra.role);
    const institutionId = roleAssignments?.[0]?.institution_id;
    const departmentId = roleAssignments?.[0]?.department_id;

    return {
      institutionId,
      departmentId,
      roles
    };
  } catch (error) {
    console.error('Error getting user context:', error);
    return { roles: [] };
  }
}

/**
 * Validate that user belongs to the same institution as the resource
 */
export async function validateInstitutionAccess(
  userId: string,
  resourceInstitutionId: string
): Promise<boolean> {
  const userContext = await getUserContext(userId);
  return userContext.institutionId === resourceInstitutionId;
}

/**
 * Validate that user belongs to the same department as the resource
 */
export async function validateDepartmentAccess(
  userId: string,
  resourceDepartmentId: string
): Promise<boolean> {
  const userContext = await getUserContext(userId);
  return userContext.departmentId === resourceDepartmentId;
}

/**
 * Extract resource ID from request parameters
 */
export function getResourceIdFromParams(params: any, paramName: string = 'id'): string {
  return params?.[paramName] || 'unknown';
}

/**
 * Extract resource context from request body
 */
export async function getResourceContextFromBody(
  request: NextRequest
): Promise<Partial<ResourceContext>> {
  try {
    const body = await request.json();
    return {
      resourceId: body.id || body.resourceId,
      resourceType: body.resourceType,
      ownerId: body.ownerId || body.userId,
      departmentId: body.departmentId,
      institutionId: body.institutionId,
      metadata: body.metadata
    };
  } catch (error) {
    return {};
  }
}