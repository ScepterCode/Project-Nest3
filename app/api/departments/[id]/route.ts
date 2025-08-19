import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DepartmentManager, DepartmentDeletionOptions } from '@/lib/services/department-manager';
import { DepartmentCreationData, TenantContext } from '@/lib/types/institution';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const departmentId = params.id;
    const supabase = await createClient();

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

    const departmentManager = new DepartmentManager();
    const department = await departmentManager.getDepartmentById(departmentId);

    if (!department) {
      return NextResponse.json({
        success: false,
        error: 'Department not found'
      }, { status: 404 });
    }

    // Check access permissions
    const isSystemAdmin = userProfile.role === 'system_admin';
    const isInstitutionMember = userProfile.institution_id === department.institutionId;

    if (!isSystemAdmin && !isInstitutionMember) {
      return NextResponse.json({
        success: false,
        error: 'Access denied'
      }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        department
      }
    });

  } catch (error) {
    console.error('Department get API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const departmentId = params.id;
    const supabase = await createClient();

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

    const departmentManager = new DepartmentManager();
    const department = await departmentManager.getDepartmentById(departmentId);

    if (!department) {
      return NextResponse.json({
        success: false,
        error: 'Department not found'
      }, { status: 404 });
    }

    // Check access permissions
    const isSystemAdmin = userProfile.role === 'system_admin';
    const isInstitutionAdmin = userProfile.role === 'institution_admin' && userProfile.institution_id === department.institutionId;
    const isDepartmentAdmin = userProfile.role === 'department_admin' && department.adminId === user.id;

    if (!isSystemAdmin && !isInstitutionAdmin && !isDepartmentAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Access denied. Admin role required.'
      }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const updates: Partial<DepartmentCreationData> = {
      name: body.name,
      description: body.description,
      code: body.code,
      adminId: body.adminId,
      parentDepartmentId: body.parentDepartmentId,
      settings: body.settings
    };

    // Remove undefined values
    Object.keys(updates).forEach(key => {
      if (updates[key as keyof DepartmentCreationData] === undefined) {
        delete updates[key as keyof DepartmentCreationData];
      }
    });

    // Create tenant context
    const context: TenantContext = {
      institutionId: department.institutionId,
      departmentId,
      userId: user.id,
      role: userProfile.role,
      permissions: []
    };

    const result = await departmentManager.updateDepartment(departmentId, updates, context);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to update department',
        errors: result.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        department: result.department
      }
    });

  } catch (error) {
    console.error('Department update API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const departmentId = params.id;
    const supabase = await createClient();

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

    const departmentManager = new DepartmentManager();
    const department = await departmentManager.getDepartmentById(departmentId);

    if (!department) {
      return NextResponse.json({
        success: false,
        error: 'Department not found'
      }, { status: 404 });
    }

    // Check access permissions (only system admin and institution admin can delete departments)
    const isSystemAdmin = userProfile.role === 'system_admin';
    const isInstitutionAdmin = userProfile.role === 'institution_admin' && userProfile.institution_id === department.institutionId;

    if (!isSystemAdmin && !isInstitutionAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Access denied. Institution admin role required.'
      }, { status: 403 });
    }

    // Parse deletion options from request body
    const body = await request.json().catch(() => ({}));
    const options: DepartmentDeletionOptions = {
      preserveData: body.preserveData || false,
      transferUsersTo: body.transferUsersTo,
      transferClassesTo: body.transferClassesTo,
      archiveAnalytics: body.archiveAnalytics || true
    };

    // Create tenant context
    const context: TenantContext = {
      institutionId: department.institutionId,
      departmentId,
      userId: user.id,
      role: userProfile.role,
      permissions: []
    };

    const result = await departmentManager.deleteDepartment(departmentId, options, context);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to delete department',
        errors: result.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Department deleted successfully'
    });

  } catch (error) {
    console.error('Department delete API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}