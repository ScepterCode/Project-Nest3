import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DepartmentConfigManager } from '@/lib/services/department-config-manager';
import { UserRole } from '@/lib/types/onboarding';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const departmentId = params.id;

    // Validate user has permission to view department preferences
    const { data: userRole } = await supabase
      .from('user_institutions')
      .select(`
        role,
        department_id,
        departments!inner (
          id,
          institution_id
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (!userRole) {
      return NextResponse.json({ error: 'User not found in any institution' }, { status: 403 });
    }

    // Check if user has permission to view this department's preferences
    const canView = 
      userRole.role === 'institution_admin' ||
      (userRole.role === 'department_admin' && userRole.department_id === departmentId) ||
      userRole.role === 'system_admin';

    if (!canView) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get department configuration with inheritance
    const configManager = new DepartmentConfigManager();
    const configResult = await configManager.getDepartmentConfig(departmentId);

    return NextResponse.json({
      success: true,
      data: configResult
    });

  } catch (error) {
    console.error('Error fetching department preferences:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const departmentId = params.id;
    const body = await request.json();
    const { settings, reason } = body;

    // Validate user has permission to modify department preferences
    const { data: userRole } = await supabase
      .from('user_institutions')
      .select(`
        role,
        department_id,
        departments!inner (
          id,
          institution_id
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (!userRole) {
      return NextResponse.json({ error: 'User not found in any institution' }, { status: 403 });
    }

    // Check if user has permission to modify this department's preferences
    const canModify = 
      userRole.role === 'institution_admin' ||
      (userRole.role === 'department_admin' && userRole.department_id === departmentId) ||
      userRole.role === 'system_admin';

    if (!canModify) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Update department configuration
    const configManager = new DepartmentConfigManager();
    const result = await configManager.updateDepartmentConfig({
      departmentId,
      settings,
      updatedBy: user.id,
      reason
    });

    if (!result.success) {
      if (result.conflicts) {
        return NextResponse.json({
          success: false,
          conflicts: result.conflicts
        }, { status: 409 }); // Conflict status
      }
      
      return NextResponse.json({
        success: false,
        errors: result.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Department preferences updated successfully'
    });

  } catch (error) {
    console.error('Error updating department preferences:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const departmentId = params.id;
    const body = await request.json();
    const { action, ...actionData } = body;

    // Validate user has permission
    const { data: userRole } = await supabase
      .from('user_institutions')
      .select(`
        role,
        department_id,
        departments!inner (
          id,
          institution_id
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (!userRole) {
      return NextResponse.json({ error: 'User not found in any institution' }, { status: 403 });
    }

    const canModify = 
      userRole.role === 'institution_admin' ||
      (userRole.role === 'department_admin' && userRole.department_id === departmentId) ||
      userRole.role === 'system_admin';

    if (!canModify) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const configManager = new DepartmentConfigManager();

    switch (action) {
      case 'validate':
        const { settings: validateSettings } = actionData;
        const validation = await configManager.validateDepartmentConfig(departmentId, validateSettings);
        
        return NextResponse.json({
          success: true,
          data: validation
        });

      case 'get_hierarchy':
        const hierarchy = await configManager.getConfigHierarchy(departmentId);
        
        return NextResponse.json({
          success: true,
          data: hierarchy
        });

      case 'get_defaults':
        // Get institution ID from department
        const { data: department } = await supabase
          .from('departments')
          .select('institution_id')
          .eq('id', departmentId)
          .single();

        if (!department) {
          return NextResponse.json({ error: 'Department not found' }, { status: 404 });
        }

        const defaults = await configManager.getDefaultDepartmentSettings(department.institution_id);
        
        return NextResponse.json({
          success: true,
          data: defaults
        });

      default:
        return NextResponse.json({
          error: 'Invalid action'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Error handling department preferences action:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}