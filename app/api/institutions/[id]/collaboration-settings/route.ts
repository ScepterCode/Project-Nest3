import { NextRequest, NextResponse } from 'next/server';
import { ContentSharingPolicyManager } from '@/lib/services/content-sharing-policy-manager';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has access to this institution
    const { data: userInstitution } = await supabase
      .from('user_institutions')
      .select('institution_id, role')
      .eq('user_id', user.id)
      .eq('institution_id', params.id)
      .single();

    if (!userInstitution) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const policyManager = new ContentSharingPolicyManager();
    const settings = await policyManager.getCollaborationSettings(params.id);

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching institution collaboration settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collaboration settings' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Check if user has admin access to this institution
    const { data: userRole } = await supabase
      .from('user_institutions')
      .select('role')
      .eq('user_id', user.id)
      .eq('institution_id', params.id)
      .single();

    if (!userRole || !['institution_admin', 'system_admin'].includes(userRole.role)) {
      return NextResponse.json({ error: 'Institution admin access required' }, { status: 403 });
    }

    const policyManager = new ContentSharingPolicyManager();
    const settings = await policyManager.createCollaborationSettings({
      institutionId: params.id,
      allowCrossInstitutionCollaboration: body.allowCrossInstitutionCollaboration || false,
      allowCrossDepartmentCollaboration: body.allowCrossDepartmentCollaboration || true,
      defaultPermissions: body.defaultPermissions || ['view'],
      approvalRequired: body.approvalRequired || false,
      approverRoles: body.approverRoles || [],
      maxCollaborators: body.maxCollaborators,
      allowExternalCollaborators: body.allowExternalCollaborators || false,
      externalDomainWhitelist: body.externalDomainWhitelist
    });

    return NextResponse.json(settings, { status: 201 });
  } catch (error) {
    console.error('Error creating institution collaboration settings:', error);
    return NextResponse.json(
      { error: 'Failed to create collaboration settings' },
      { status: 500 }
    );
  }
}