import { NextRequest, NextResponse } from 'next/server';
import { ContentSharingPolicyManager } from '@/lib/services/content-sharing-policy-manager';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const institutionId = url.searchParams.get('institutionId');
    const departmentId = url.searchParams.get('departmentId');

    if (!institutionId) {
      return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 });
    }

    // Check if user has access to this institution
    const { data: userInstitution } = await supabase
      .from('user_institutions')
      .select('institution_id, role')
      .eq('user_id', user.id)
      .eq('institution_id', institutionId)
      .single();

    if (!userInstitution) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const policyManager = new ContentSharingPolicyManager();
    const settings = await policyManager.getCollaborationSettings(institutionId, departmentId);

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching collaboration settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collaboration settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      institutionId, 
      departmentId,
      allowCrossInstitutionCollaboration,
      allowCrossDepartmentCollaboration,
      defaultPermissions,
      approvalRequired,
      approverRoles,
      maxCollaborators,
      allowExternalCollaborators,
      externalDomainWhitelist
    } = body;

    if (!institutionId) {
      return NextResponse.json(
        { error: 'Institution ID is required' },
        { status: 400 }
      );
    }

    // Check if user has admin access to this institution
    const { data: userRole } = await supabase
      .from('user_institutions')
      .select('role')
      .eq('user_id', user.id)
      .eq('institution_id', institutionId)
      .single();

    if (!userRole || !['institution_admin', 'department_admin', 'system_admin'].includes(userRole.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const policyManager = new ContentSharingPolicyManager();
    const settings = await policyManager.createCollaborationSettings({
      institutionId,
      departmentId,
      allowCrossInstitutionCollaboration: allowCrossInstitutionCollaboration || false,
      allowCrossDepartmentCollaboration: allowCrossDepartmentCollaboration || true,
      defaultPermissions: defaultPermissions || ['view'],
      approvalRequired: approvalRequired || false,
      approverRoles: approverRoles || [],
      maxCollaborators,
      allowExternalCollaborators: allowExternalCollaborators || false,
      externalDomainWhitelist
    });

    return NextResponse.json(settings, { status: 201 });
  } catch (error) {
    console.error('Error creating collaboration settings:', error);
    return NextResponse.json(
      { error: 'Failed to create collaboration settings' },
      { status: 500 }
    );
  }
}