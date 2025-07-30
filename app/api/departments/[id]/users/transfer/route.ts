import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DepartmentManager, DepartmentTransferOptions } from '@/lib/services/department-manager';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const fromDepartmentId = params.id;

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    // Get user profile to check permissions
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (!userProfile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
    const { toDepartmentId, options } = body;

    if (!toDepartmentId) {
      return NextResponse.json({
        success: false,
        error: 'Target department ID is required'
      }, { status: 400 });
    }

    const departmentManager = new DepartmentManager();

    // Get both departments to verify access
    const [fromDept, toDept] = await Promise.all([
      departmentManager.getDepartmentById(fromDepartmentId),
      departmentManager.getDepartmentById(toDepartmentId)
    ]);

    if (!fromDept || !toDept) {
      return NextResponse.json({
        success: false,
        error: 'One or both departments not found'
      }, { status: 404 });
    }

    // Check access permissions
    const isSystemAdmin = userProfile.role === 'system_admin';
    const isInstitutionAdmin = userProfile.role === 'institution_admin' && 
      userProfile.institution_id === fromDept.institutionId;

    if (!isSystemAdmin && !isInstitutionAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Access denied. Institution admin role required.'
      }, { status: 403 });
    }

    // Ensure both departments are in the same institution
    if (fromDept.institutionId !== toDept.institutionId) {
      return NextResponse.json({
        success: false,
        error: 'Departments must be in the same institution'
      }, { status: 400 });
    }

    // Set default transfer options
    const transferOptions: DepartmentTransferOptions = {
      preserveUserData: options?.preserveUserData ?? true,
      preserveClassData: options?.preserveClassData ?? false,
      preserveAnalytics: options?.preserveAnalytics ?? true,
      notifyUsers: options?.notifyUsers ?? true
    };

    // Perform the transfer
    const result = await departmentManager.transferDepartmentUsers(
      fromDepartmentId,
      toDepartmentId,
      transferOptions
    );

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to transfer users',
        errors: result.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        transferredUsers: result.transferredUsers,
        failedTransfers: result.failedTransfers,
        fromDepartment: {
          id: fromDept.id,
          name: fromDept.name
        },
        toDepartment: {
          id: toDept.id,
          name: toDept.name
        }
      }
    });

  } catch (error) {
    console.error('Department user transfer API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}