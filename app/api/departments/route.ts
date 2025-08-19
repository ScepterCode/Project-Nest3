import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DepartmentManager } from '@/lib/services/department-manager';
import { DepartmentFilters, DepartmentCreationData, TenantContext } from '@/lib/types/institution';

export async function GET(request: NextRequest) {
  try {
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

    // Parse query parameters for filtering
    const url = new URL(request.url);
    const filters: DepartmentFilters = {
      status: url.searchParams.get('status') as any,
      adminId: url.searchParams.get('adminId') || undefined,
      parentDepartmentId: url.searchParams.get('parentDepartmentId') || undefined,
      search: url.searchParams.get('search') || undefined,
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 50,
      offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : 0
    };

    // System admins can see all departments, others only their institution's
    if (userProfile.role !== 'system_admin') {
      filters.institutionId = userProfile.institution_id;
    } else if (url.searchParams.get('institutionId')) {
      filters.institutionId = url.searchParams.get('institutionId')!;
    }

    const departmentManager = new DepartmentManager();
    const result = await departmentManager.listDepartments(filters);

    return NextResponse.json({
      success: true,
      data: {
        departments: result.departments,
        total: result.total,
        limit: filters.limit,
        offset: filters.offset
      }
    });

  } catch (error) {
    console.error('Departments list API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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

    // Check if user has permission to create departments
    const isSystemAdmin = userProfile.role === 'system_admin';
    const isInstitutionAdmin = userProfile.role === 'institution_admin';

    if (!isSystemAdmin && !isInstitutionAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Access denied. Institution admin role required.'
      }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const departmentData: DepartmentCreationData = {
      name: body.name,
      description: body.description || '',
      code: body.code,
      adminId: body.adminId,
      parentDepartmentId: body.parentDepartmentId,
      settings: body.settings
    };

    // Determine institution ID
    let institutionId: string;
    if (isSystemAdmin && body.institutionId) {
      institutionId = body.institutionId;
    } else if (userProfile.institution_id) {
      institutionId = userProfile.institution_id;
    } else {
      return NextResponse.json({
        success: false,
        error: 'Institution ID is required'
      }, { status: 400 });
    }

    // Create tenant context
    const context: TenantContext = {
      institutionId,
      userId: user.id,
      role: userProfile.role,
      permissions: []
    };

    const departmentManager = new DepartmentManager();
    const result = await departmentManager.createDepartment(institutionId, departmentData, context);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to create department',
        errors: result.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        department: result.department
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Department creation API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}