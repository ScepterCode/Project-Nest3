import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DepartmentManager } from '@/lib/services/department-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const institutionId = params.id;

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

    // Check access permissions
    const isSystemAdmin = userProfile.role === 'system_admin';
    const isInstitutionMember = userProfile.institution_id === institutionId;

    if (!isSystemAdmin && !isInstitutionMember) {
      return NextResponse.json({
        success: false,
        error: 'Access denied'
      }, { status: 403 });
    }

    // Verify institution exists
    const { data: institution, error: institutionError } = await supabase
      .from('institutions')
      .select('id, name')
      .eq('id', institutionId)
      .single();

    if (institutionError || !institution) {
      return NextResponse.json({
        success: false,
        error: 'Institution not found'
      }, { status: 404 });
    }

    const departmentManager = new DepartmentManager();
    const hierarchy = await departmentManager.getDepartmentHierarchy(institutionId);

    return NextResponse.json({
      success: true,
      data: {
        institution: {
          id: institution.id,
          name: institution.name
        },
        hierarchy
      }
    });

  } catch (error) {
    console.error('Department hierarchy API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}