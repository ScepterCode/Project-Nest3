import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DepartmentConfigManager } from '@/lib/services/department-config-manager';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const departmentId = params.id;
    const body = await request.json();
    const { settings, conflicts, reason } = body;

    // Validate user has permission to resolve conflicts
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

    // Check if user has permission to resolve conflicts for this department
    const canResolve = 
      userRole.role === 'institution_admin' ||
      (userRole.role === 'department_admin' && userRole.department_id === departmentId) ||
      userRole.role === 'system_admin';

    if (!canResolve) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Validate that all conflicts have resolutions
    const unresolvedConflicts = conflicts.filter((conflict: any) => !conflict.resolution);
    if (unresolvedConflicts.length > 0) {
      return NextResponse.json({
        success: false,
        errors: [{
          field: 'conflicts',
          message: `${unresolvedConflicts.length} conflicts still need resolution`,
          code: 'UNRESOLVED_CONFLICTS'
        }]
      }, { status: 400 });
    }

    // Update department configuration with conflict resolutions
    const configManager = new DepartmentConfigManager();
    
    // First, apply conflict resolutions to the settings
    const resolvedSettings = applyConflictResolutions(settings, conflicts);
    
    const result = await configManager.updateDepartmentConfig({
      departmentId,
      settings: resolvedSettings,
      updatedBy: user.id,
      reason: reason || 'Resolved policy conflicts'
    });

    if (!result.success) {
      return NextResponse.json({
        success: false,
        errors: result.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Conflicts resolved and department preferences updated successfully'
    });

  } catch (error) {
    console.error('Error resolving department preference conflicts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to apply conflict resolutions
function applyConflictResolutions(settings: any, conflicts: any[]): any {
  const resolvedSettings = JSON.parse(JSON.stringify(settings));

  conflicts.forEach(conflict => {
    if (conflict.resolution) {
      switch (conflict.resolution) {
        case 'use_institution':
          setNestedProperty(resolvedSettings, conflict.field, conflict.institutionValue);
          break;
        case 'use_department':
          // Keep department value (no change needed)
          break;
        case 'merge':
          // Custom merge logic based on field type
          const mergedValue = mergeValues(conflict.departmentValue, conflict.institutionValue);
          setNestedProperty(resolvedSettings, conflict.field, mergedValue);
          break;
      }
    }
  });

  return resolvedSettings;
}

// Utility function to set nested property
function setNestedProperty(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

// Utility function to merge values
function mergeValues(departmentValue: any, institutionValue: any): any {
  // Custom merge logic based on value types
  if (Array.isArray(departmentValue) && Array.isArray(institutionValue)) {
    return [...institutionValue, ...departmentValue];
  }
  if (typeof departmentValue === 'object' && typeof institutionValue === 'object') {
    return { ...institutionValue, ...departmentValue };
  }
  return departmentValue; // Default to department value
}