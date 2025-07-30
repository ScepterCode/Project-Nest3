/**
 * Permission Middleware
 * 
 * Provides middleware functions for checking permissions in API endpoints.
 * Integrates with the PermissionChecker service to enforce access control.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PermissionChecker, ResourceContext, Action } from '../services/permission-checker';
import { createClient } from '../supabase/server';

export interface PermissionMiddlewareConfig {
  cacheEnabled: boolean;
  cacheTtl: number;
  bulkCheckLimit: number;
}

export interface PermissionRequirement {
  permission: string;
  context?: Partial<ResourceContext>;
}

export interface ResourcePermissionRequirement {
  resourceType: string;
  action: Action;
  context?: Partial<ResourceContext>;
}

/**
 * Default configuration for permission middleware
 */
const DEFAULT_CONFIG: PermissionMiddlewareConfig = {
  cacheEnabled: true,
  cacheTtl: 300, // 5 minutes
  bulkCheckLimit: 50
};

/**
 * Global permission checker instance
 */
let permissionChecker: PermissionChecker | null = null;

/**
 * Get or create permission checker instance
 */
function getPermissionChecker(config?: PermissionMiddlewareConfig): PermissionChecker {
  if (!permissionChecker) {
    permissionChecker = new PermissionChecker(config || DEFAULT_CONFIG);
  }
  return permissionChecker;
}

/**
 * Extract user ID from request
 */
async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }
    
    return user.id;
  } catch (error) {
    console.error('Error extracting user from request:', error);
    return null;
  }
}

/**
 * Extract resource context from request
 */
function extractResourceContext(
  request: NextRequest,
  baseContext?: Partial<ResourceContext>
): ResourceContext | undefined {
  if (!baseContext) return undefined;

  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/').filter(Boolean);
  
  // Extract resource ID from URL path (assumes it's the last segment or specified)
  const resourceId = baseContext.resourceId || pathSegments[pathSegments.length - 1] || '';
  
  // Extract other context from headers or query params
  const departmentId = baseContext.departmentId || 
                      request.headers.get('x-department-id') || 
                      url.searchParams.get('departmentId') || 
                      undefined;
                      
  const institutionId = baseContext.institutionId || 
                       request.headers.get('x-institution-id') || 
                       url.searchParams.get('institutionId') || 
                       undefined;

  return {
    resourceId,
    resourceType: baseContext.resourceType || 'unknown',
    ownerId: baseContext.ownerId,
    departmentId,
    institutionId,
    metadata: baseContext.metadata
  };
}

/**
 * Middleware to check if user has a specific permission
 */
export function requirePermission(
  requirement: PermissionRequirement,
  config?: PermissionMiddlewareConfig
) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const checker = getPermissionChecker(config);
    const userId = await getUserIdFromRequest(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const context = extractResourceContext(request, requirement.context);
    const hasPermission = await checker.hasPermission(
      userId,
      requirement.permission,
      context
    );

    if (!hasPermission) {
      return NextResponse.json(
        { 
          error: 'Insufficient permissions',
          required: requirement.permission,
          context: context ? {
            resourceType: context.resourceType,
            resourceId: context.resourceId
          } : undefined
        },
        { status: 403 }
      );
    }

    return null; // Permission granted, continue to next middleware/handler
  };
}

/**
 * Middleware to check if user can access a resource with specific action
 */
export function requireResourceAccess(
  requirement: ResourcePermissionRequirement,
  config?: PermissionMiddlewareConfig
) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const checker = getPermissionChecker(config);
    const userId = await getUserIdFromRequest(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const context = extractResourceContext(request, requirement.context);
    
    if (!context) {
      return NextResponse.json(
        { error: 'Resource context required' },
        { status: 400 }
      );
    }

    const canAccess = await checker.canAccessResource(
      userId,
      context.resourceId,
      requirement.action,
      context
    );

    if (!canAccess) {
      return NextResponse.json(
        { 
          error: 'Access denied',
          resource: {
            type: requirement.resourceType,
            id: context.resourceId,
            action: requirement.action
          }
        },
        { status: 403 }
      );
    }

    return null; // Access granted, continue to next middleware/handler
  };
}

/**
 * Middleware to check if user has admin privileges
 */
export function requireAdmin(
  scope: 'system' | 'institution' | 'department',
  config?: PermissionMiddlewareConfig
) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const checker = getPermissionChecker(config);
    const userId = await getUserIdFromRequest(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Extract scope ID from request if needed
    let scopeId: string | undefined;
    if (scope === 'institution') {
      scopeId = request.headers.get('x-institution-id') || 
                new URL(request.url).searchParams.get('institutionId') || 
                undefined;
    } else if (scope === 'department') {
      scopeId = request.headers.get('x-department-id') || 
                new URL(request.url).searchParams.get('departmentId') || 
                undefined;
    }

    const isAdmin = await checker.isAdmin(userId, scope, scopeId);

    if (!isAdmin) {
      return NextResponse.json(
        { 
          error: 'Admin privileges required',
          scope,
          scopeId
        },
        { status: 403 }
      );
    }

    return null; // Admin access granted, continue to next middleware/handler
  };
}

/**
 * Middleware to check multiple permissions at once
 */
export function requireMultiplePermissions(
  requirements: PermissionRequirement[],
  requireAll: boolean = true,
  config?: PermissionMiddlewareConfig
) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const checker = getPermissionChecker(config);
    const userId = await getUserIdFromRequest(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const permissionChecks = requirements.map(req => ({
      permission: req.permission,
      context: extractResourceContext(request, req.context)
    }));

    const results = await checker.checkBulkPermissions(userId, permissionChecks);
    
    const grantedPermissions = results.filter(r => r.granted);
    const deniedPermissions = results.filter(r => !r.granted);

    if (requireAll && deniedPermissions.length > 0) {
      return NextResponse.json(
        { 
          error: 'Insufficient permissions',
          required: 'all',
          denied: deniedPermissions.map(p => p.permission)
        },
        { status: 403 }
      );
    }

    if (!requireAll && grantedPermissions.length === 0) {
      return NextResponse.json(
        { 
          error: 'Insufficient permissions',
          required: 'any',
          available: requirements.map(r => r.permission)
        },
        { status: 403 }
      );
    }

    return null; // Permission requirements met, continue to next middleware/handler
  };
}

/**
 * Utility function to compose multiple middleware functions
 */
export function composeMiddleware(
  middlewares: Array<(request: NextRequest) => Promise<NextResponse | null>>
) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    for (const middleware of middlewares) {
      const result = await middleware(request);
      if (result) {
        return result; // Middleware returned a response, stop processing
      }
    }
    return null; // All middleware passed, continue to handler
  };
}

/**
 * Higher-order function to wrap API handlers with permission checking
 */
export function withPermissions<T extends any[]>(
  middleware: (request: NextRequest) => Promise<NextResponse | null>,
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    const middlewareResult = await middleware(request);
    if (middlewareResult) {
      return middlewareResult;
    }
    return handler(request, ...args);
  };
}

/**
 * Invalidate permission cache for a user (useful after role changes)
 */
export function invalidateUserPermissions(userId: string, config?: PermissionMiddlewareConfig): void {
  const checker = getPermissionChecker(config);
  checker.invalidateUserCache(userId);
}

/**
 * Clear all permission cache (useful for system maintenance)
 */
export function clearPermissionCache(config?: PermissionMiddlewareConfig): void {
  const checker = getPermissionChecker(config);
  checker.clearCache();
}