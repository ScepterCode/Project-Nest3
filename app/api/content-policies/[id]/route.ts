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

    const policyManager = new ContentSharingPolicyManager();
    const policy = await policyManager.getSharingPolicy(params.id);

    if (!policy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    // Check if user has access to this institution
    const { data: userInstitution } = await supabase
      .from('user_institutions')
      .select('institution_id')
      .eq('user_id', user.id)
      .eq('institution_id', policy.institutionId)
      .single();

    if (!userInstitution) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json(policy);
  } catch (error) {
    console.error('Error fetching content policy:', error);
    return NextResponse.json(
      { error: 'Failed to fetch content policy' },
      { status: 500 }
    );
  }
}

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
    const policyManager = new ContentSharingPolicyManager();
    
    // Get existing policy to check permissions
    const existingPolicy = await policyManager.getSharingPolicy(params.id);
    if (!existingPolicy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    // Check if user has admin access to this institution
    const { data: userRole } = await supabase
      .from('user_institutions')
      .select('role')
      .eq('user_id', user.id)
      .eq('institution_id', existingPolicy.institutionId)
      .single();

    if (!userRole || !['institution_admin', 'system_admin'].includes(userRole.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const updatedPolicy = await policyManager.updateSharingPolicy(params.id, body);
    return NextResponse.json(updatedPolicy);
  } catch (error) {
    console.error('Error updating content policy:', error);
    return NextResponse.json(
      { error: 'Failed to update content policy' },
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

    const policyManager = new ContentSharingPolicyManager();
    
    // Get existing policy to check permissions
    const existingPolicy = await policyManager.getSharingPolicy(params.id);
    if (!existingPolicy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    // Check if user has admin access to this institution
    const { data: userRole } = await supabase
      .from('user_institutions')
      .select('role')
      .eq('user_id', user.id)
      .eq('institution_id', existingPolicy.institutionId)
      .single();

    if (!userRole || !['institution_admin', 'system_admin'].includes(userRole.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await policyManager.deleteSharingPolicy(params.id);
    return NextResponse.json({ message: 'Policy deleted successfully' });
  } catch (error) {
    console.error('Error deleting content policy:', error);
    return NextResponse.json(
      { error: 'Failed to delete content policy' },
      { status: 500 }
    );
  }
}