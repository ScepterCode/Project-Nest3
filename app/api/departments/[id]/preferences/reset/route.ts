import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DepartmentConfigManager } from '@/lib/services/department-config-manager';

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
    const { reason, fieldsToReset } = body;

    // Validate user has permission to reset department preferences
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

    // Check if user has permission to reset this department's preferences
    const canReset = 
      userRole.role === 'institution_admin' ||
      (userRole.role === 'department_admin' && userRole.department_id === departmentId) ||
      userRole.role === 'system_admin';

    if (!canReset) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Reset department configuration to institution defaults
    const configManager = new DepartmentConfigManager();
    const result = await configManager.resetToInstitutionDefaults(
      departmentId,
      user.id,
      fieldsToReset
    );

    if (!result.success) {
      return NextResponse.json({
        success: false,
        errors: result.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Department preferences reset to institution defaults successfully'
    });

  } catch (error) {
    console.error('Error resetting department preferences:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}