// Tenant context utilities for multi-tenant security
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { TenantContext } from "@/lib/types/institution";

export interface TenantContextResult {
  context: TenantContext | null;
  error?: string;
}

/**
 * Extract tenant context from authenticated user
 */
export async function extractTenantContext(request: NextRequest): Promise<TenantContextResult> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {
            // No-op for read-only operations
          },
        },
      },
    );

    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return { context: null, error: "User not authenticated" };
    }

    // Extract tenant information from user metadata or JWT claims
    const institutionId = user.user_metadata?.institution_id || 
                         user.app_metadata?.institution_id;
    const departmentId = user.user_metadata?.department_id || 
                        user.app_metadata?.department_id;
    const role = user.user_metadata?.role || 
                user.app_metadata?.role || 
                'student';
    const permissions = user.user_metadata?.permissions || 
                       user.app_metadata?.permissions || 
                       [];

    if (!institutionId && role !== 'system_admin') {
      return { 
        context: null, 
        error: "User not associated with any institution" 
      };
    }

    const context: TenantContext = {
      institutionId,
      departmentId,
      userId: user.id,
      role,
      permissions: Array.isArray(permissions) ? permissions : []
    };

    return { context };
  } catch (error) {
    return { 
      context: null, 
      error: `Failed to extract tenant context: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * Validate if user has access to specific institution
 */
export function validateInstitutionAccess(
  context: TenantContext, 
  targetInstitutionId: string
): boolean {
  // System admins can access any institution
  if (context.role === 'system_admin') {
    return true;
  }

  // Users can only access their own institution
  return context.institutionId === targetInstitutionId;
}

/**
 * Validate if user has access to specific department
 */
export function validateDepartmentAccess(
  context: TenantContext, 
  targetDepartmentId: string,
  targetInstitutionId?: string
): boolean {
  // System admins can access any department
  if (context.role === 'system_admin') {
    return true;
  }

  // Institution admins can access any department in their institution
  if (context.role === 'institution_admin' && targetInstitutionId) {
    return context.institutionId === targetInstitutionId;
  }

  // Department admins and users can access their own department
  if (context.departmentId === targetDepartmentId) {
    return true;
  }

  // Check if user has cross-department permissions
  return context.permissions.includes('cross_department_access');
}

/**
 * Get allowed institution IDs for the user
 */
export function getAllowedInstitutionIds(context: TenantContext): string[] {
  if (context.role === 'system_admin') {
    return ['*']; // Special marker for all institutions
  }

  return context.institutionId ? [context.institutionId] : [];
}

/**
 * Get allowed department IDs for the user
 */
export function getAllowedDepartmentIds(context: TenantContext): string[] {
  if (context.role === 'system_admin') {
    return ['*']; // Special marker for all departments
  }

  if (context.role === 'institution_admin') {
    return ['*']; // Institution admins can access all departments in their institution
  }

  return context.departmentId ? [context.departmentId] : [];
}

/**
 * Check if user has specific permission
 */
export function hasPermission(context: TenantContext, permission: string): boolean {
  // System admins have all permissions
  if (context.role === 'system_admin') {
    return true;
  }

  return context.permissions.includes(permission);
}

/**
 * Create tenant-aware database query filter
 */
export function createTenantFilter(context: TenantContext, tableName: string): string {
  if (context.role === 'system_admin') {
    return ''; // No filter for system admins
  }

  switch (tableName) {
    case 'institutions':
      return `id = '${context.institutionId}'`;
    
    case 'departments':
      if (context.role === 'institution_admin') {
        return `institution_id = '${context.institutionId}'`;
      }
      return `id = '${context.departmentId}' OR institution_id = '${context.institutionId}'`;
    
    case 'institution_analytics':
    case 'institution_integrations':
    case 'content_sharing_policies':
    case 'institution_invitations':
      return `institution_id = '${context.institutionId}'`;
    
    case 'department_analytics':
      if (context.role === 'institution_admin') {
        return `department_id IN (SELECT id FROM departments WHERE institution_id = '${context.institutionId}')`;
      }
      return `department_id = '${context.departmentId}'`;
    
    default:
      return `institution_id = '${context.institutionId}'`;
  }
}