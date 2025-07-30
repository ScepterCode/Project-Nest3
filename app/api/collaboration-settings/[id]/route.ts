import { NextRequest, NextResponse } from 'next/server';
import { ContentSharingPolicyManager } from '@/lib/services/content-sharing-policy-manager';
import { createClient } from '@/lib/supabase/server';

export async function PUT(
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
    const { 
      allowCrossInstitutionCollaboration,
      allowCrossDepartmentCollaboration,
      defaultPermissions,
      approvalRequired,
      approverRoles,
      maxCollaborators,
      allowExternalCollaborators,
      externalDomainWhitelist
    } = body;

    // Get the existing settings to check permissions
    const policyManager = new ContentSharingPolicyManager();
    const existingSettings = await policyManager.getCollaborationSettings(
      body.institutionId,
      body.departmentId
    );

    if (!existingSettings || existingSettings.id !== params.id) {
      return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
    }

    // Check if user has admin access to this institution
    const { data: userRole } = await supabase
      .from('user_institutions')
      .select('role')
      .eq('user_id', user.id)
      .eq('institution_id', existingSettings.institutionId)
      .single();

    if (!userRole || !['institution_admin', 'department_admin', 'system_admin'].includes(userRole.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const updates = {
      allowCrossInstitutionCollaboration,
      allowCrossDepartmentCollaboration,
      defaultPermissions,
      approvalRequired,
      approverRoles,
      maxCollaborators,
      allowExternalCollaborators,
      externalDomainWhitelist
    };

    // Remove undefined values
    Object.keys(updates).forEach(key => {
      if (updates[key] === undefined) {
        delete updates[key];
      }
    });

    const updatedSettings = await policyManager.updateCollaborationSettings(params.id, updates);

    return NextResponse.json(updatedSettings);
  } catch (error) {
    console.error('Error updating collaboration settings:', error);
    return NextResponse.json(
      { error: 'Failed to update collaboration settings' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the existing settings to check permissions
    const { data: existingSettings, error: fetchError } = await supabase
      .from('collaboration_settings')
      .select('institution_id')
      .eq('id', params.id)
      .single();

    if (fetchError || !existingSettings) {
      return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
    }

    // Check if user has admin access to this institution
    const { data: userRole } = await supabase
      .from('user_institutions')
      .select('role')
      .eq('user_id', user.id)
      .eq('institution_id', existingSettings.institution_id)
      .single();

    if (!userRole || !['institution_admin', 'department_admin', 'system_admin'].includes(userRole.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { error: deleteError } = await supabase
      .from('collaboration_settings')
      .delete()
      .eq('id', params.id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ message: 'Collaboration settings deleted successfully' });
  } catch (error) {
    console.error('Error deleting collaboration settings:', error);
    return NextResponse.json(
      { error: 'Failed to delete collaboration settings' },
      { status: 500 }
    );
  }
}