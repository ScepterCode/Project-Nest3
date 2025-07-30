import { NextRequest, NextResponse } from 'next/server';
import { DepartmentRoleManager } from '@/lib/services/department-role-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const departmentId = params.id;

    // Get institution ID for the department
    // For now, using a placeholder - in real implementation, query from database
    const institutionId = 'institution-id';

    // Initialize department role manager
    const roleManager = new DepartmentRoleManager(departmentId, institutionId);

    // Get role restrictions
    const restrictions = await roleManager.getDepartmentRoleRestrictions();
    
    // Get current role statistics
    const stats = await roleManager.getDepartmentRoleStats();

    return NextResponse.json({
      success: true,
      data: {
        allowedRoles: restrictions.allowedRoles,
        maxUsersPerRole: restrictions.maxUsersPerRole,
        requiresInstitutionApproval: restrictions.requiresInstitutionApproval,
        canManageRoles: restrictions.canManageRoles,
        currentCounts: stats.usersByRole
      }
    });

  } catch (error) {
    console.error('Error fetching department role restrictions:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch role restrictions',
        success: false 
      },
      { status: 500 }
    );
  }
}