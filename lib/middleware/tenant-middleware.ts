// Multi-tenant middleware for API request isolation
import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext, validateInstitutionAccess, validateDepartmentAccess } from "@/lib/utils/tenant-context";
import { TenantContext } from "@/lib/types/institution";

export interface TenantMiddlewareOptions {
  requireInstitution?: boolean;
  requireDepartment?: boolean;
  allowedRoles?: string[];
  requiredPermissions?: string[];
}

/**
 * Middleware to enforce tenant isolation for API routes
 */
export async function withTenantContext(
  request: NextRequest,
  options: TenantMiddlewareOptions = {}
): Promise<{ context: TenantContext | null; response?: NextResponse }> {
  const {
    requireInstitution = true,
    requireDepartment = false,
    allowedRoles = [],
    requiredPermissions = []
  } = options;

  // Extract tenant context from request
  const { context, error } = await extractTenantContext(request);

  if (error || !context) {
    return {
      context: null,
      response: NextResponse.json(
        { error: error || "Authentication required" },
        { status: 401 }
      )
    };
  }

  // Check if institution is required
  if (requireInstitution && !context.institutionId && context.role !== 'system_admin') {
    return {
      context: null,
      response: NextResponse.json(
        { error: "User must be associated with an institution" },
        { status: 403 }
      )
    };
  }

  // Check if department is required
  if (requireDepartment && !context.departmentId && context.role !== 'system_admin' && context.role !== 'institution_admin') {
    return {
      context: null,
      response: NextResponse.json(
        { error: "User must be associated with a department" },
        { status: 403 }
      )
    };
  }

  // Check allowed roles
  if (allowedRoles.length > 0 && !allowedRoles.includes(context.role)) {
    return {
      context: null,
      response: NextResponse.json(
        { error: "Insufficient role permissions" },
        { status: 403 }
      )
    };
  }

  // Check required permissions
  for (const permission of requiredPermissions) {
    if (!context.permissions.includes(permission) && context.role !== 'system_admin') {
      return {
        context: null,
        response: NextResponse.json(
          { error: `Missing required permission: ${permission}` },
          { status: 403 }
        )
      };
    }
  }

  return { context };
}

/**
 * Validate access to specific institution resource
 */
export function validateInstitutionResourceAccess(
  context: TenantContext,
  resourceInstitutionId: string
): NextResponse | null {
  if (!validateInstitutionAccess(context, resourceInstitutionId)) {
    return NextResponse.json(
      { error: "Access denied to institution resource" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Validate access to specific department resource
 */
export function validateDepartmentResourceAccess(
  context: TenantContext,
  resourceDepartmentId: string,
  resourceInstitutionId?: string
): NextResponse | null {
  if (!validateDepartmentAccess(context, resourceDepartmentId, resourceInstitutionId)) {
    return NextResponse.json(
      { error: "Access denied to department resource" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Extract and validate institution ID from URL parameters
 */
export function extractInstitutionIdFromUrl(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/');
  
  // Look for institution ID in common patterns
  const institutionIndex = pathSegments.findIndex(segment => segment === 'institutions');
  if (institutionIndex !== -1 && pathSegments[institutionIndex + 1]) {
    return pathSegments[institutionIndex + 1];
  }

  // Check query parameters
  return url.searchParams.get('institutionId');
}

/**
 * Extract and validate department ID from URL parameters
 */
export function extractDepartmentIdFromUrl(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/');
  
  // Look for department ID in common patterns
  const departmentIndex = pathSegments.findIndex(segment => segment === 'departments');
  if (departmentIndex !== -1 && pathSegments[departmentIndex + 1]) {
    return pathSegments[departmentIndex + 1];
  }

  // Check query parameters
  return url.searchParams.get('departmentId');
}

/**
 * Middleware wrapper for API routes with tenant validation
 */
export function createTenantAwareHandler<T = any>(
  handler: (request: NextRequest, context: TenantContext, params?: T) => Promise<NextResponse>,
  options: TenantMiddlewareOptions = {}
) {
  return async (request: NextRequest, params?: T): Promise<NextResponse> => {
    // Apply tenant middleware
    const { context, response } = await withTenantContext(request, options);
    
    if (response) {
      return response; // Return error response
    }

    if (!context) {
      return NextResponse.json(
        { error: "Failed to establish tenant context" },
        { status: 500 }
      );
    }

    // Validate resource access based on URL parameters
    const institutionId = extractInstitutionIdFromUrl(request);
    if (institutionId) {
      const accessError = validateInstitutionResourceAccess(context, institutionId);
      if (accessError) return accessError;
    }

    const departmentId = extractDepartmentIdFromUrl(request);
    if (departmentId) {
      const accessError = validateDepartmentResourceAccess(context, departmentId, institutionId || undefined);
      if (accessError) return accessError;
    }

    // Call the actual handler with validated context
    return handler(request, context, params);
  };
}

/**
 * Add tenant context headers to response
 */
export function addTenantHeaders(response: NextResponse, context: TenantContext): NextResponse {
  response.headers.set('X-Tenant-Institution', context.institutionId || '');
  response.headers.set('X-Tenant-Department', context.departmentId || '');
  response.headers.set('X-Tenant-Role', context.role);
  return response;
}

/**
 * Log tenant access for monitoring
 */
export function logTenantAccess(
  context: TenantContext,
  request: NextRequest,
  action: string,
  resourceId?: string
): void {
  const logData = {
    timestamp: new Date().toISOString(),
    userId: context.userId,
    institutionId: context.institutionId,
    departmentId: context.departmentId,
    role: context.role,
    action,
    resourceId,
    path: request.nextUrl.pathname,
    method: request.method,
    userAgent: request.headers.get('user-agent'),
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
  };

  // In production, this should go to a proper logging service
  console.log('[TENANT_ACCESS]', JSON.stringify(logData));
}