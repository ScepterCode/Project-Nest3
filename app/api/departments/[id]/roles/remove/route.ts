import { NextRequest, NextResponse } from 'next/server';
import { DepartmentRoleManager } from '@/lib/services/department-role-manager';
import { UserRole } from '@/lib/types/role-management';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const departmentId = params.id;
    const body = await request.json();
    const { userId, role, reason } = body;

    // Validate required fields
    if (!userId || !role) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, role' },
        { status: 400 }
      );
    }

    // Validate role enum
    if (!Object.values(UserRole).includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role specified' },
        { status: 400 }
      );
    }

    // Get current user ID from session/auth
    // For now, using a placeholder - in real implementation, get from auth
    const currentUserId = 'current-user-id';
    
    // Get institution ID for the department
    // For now, using a placeholder - in real implementation, query from database
    const institutionId = 'institution-id';

    // Initialize department role manager
    const roleManager = new DepartmentRoleManager(departmentId, institutionId);

    // Remove the role
    await roleManager.removeDepartmentRole(
      currentUserId,
      userId,
      role,
      reason
    );

    return NextResponse.json({
      success: true,
      data: {
        message: 'Role removed successfully'
      }
    });

  } catch (error) {
    console.error('Error removing department role:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to remove role',
        success: false 
      },
      { status: 500 }
    );
  }
}