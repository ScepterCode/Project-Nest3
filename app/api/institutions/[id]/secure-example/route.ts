// Example API endpoint demonstrating tenant security middleware
import { NextRequest, NextResponse } from "next/server";
import { createTenantAwareHandler } from "@/lib/middleware/tenant-middleware";
import { TenantContext } from "@/lib/types/institution";

// Example handler that requires institution admin role
async function handleSecureRequest(
  request: NextRequest,
  context: TenantContext,
  params: { id: string }
): Promise<NextResponse> {
  const { id: institutionId } = params;

  // The middleware has already validated that the user can access this institution
  // and has the required role/permissions

  return NextResponse.json({
    message: "Access granted to secure resource",
    institutionId,
    userContext: {
      userId: context.userId,
      role: context.role,
      permissions: context.permissions
    },
    timestamp: new Date().toISOString()
  });
}

// Wrap the handler with tenant-aware middleware
export const GET = createTenantAwareHandler(handleSecureRequest, {
  requireInstitution: true,
  allowedRoles: ['system_admin', 'institution_admin'],
  requiredPermissions: ['read']
});

export const POST = createTenantAwareHandler(handleSecureRequest, {
  requireInstitution: true,
  allowedRoles: ['system_admin', 'institution_admin'],
  requiredPermissions: ['write']
});

export const PUT = createTenantAwareHandler(handleSecureRequest, {
  requireInstitution: true,
  allowedRoles: ['system_admin', 'institution_admin'],
  requiredPermissions: ['write']
});

export const DELETE = createTenantAwareHandler(handleSecureRequest, {
  requireInstitution: true,
  allowedRoles: ['system_admin'],
  requiredPermissions: ['admin']
});