import { NextRequest, NextResponse } from 'next/server';
import { ContentSharingEnforcement } from '@/lib/services/content-sharing-enforcement';
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

    const { data: sharingRequest, error } = await supabase
      .from('content_sharing_requests')
      .select(`
        *,
        requester:users!requester_id(name, email),
        target_institution:institutions!target_institution_id(name),
        target_department:departments!target_department_id(name)
      `)
      .eq('id', params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 });
      }
      throw error;
    }

    // Check if user can access this request
    const canAccess = sharingRequest.requester_id === user.id || 
      await checkAdminAccess(supabase, user.id, sharingRequest.target_institution_id);

    if (!canAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json(sharingRequest);
  } catch (error) {
    console.error('Error fetching sharing request:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sharing request' },
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
    const { action, reason } = body; // action: 'approve' | 'deny'

    if (!action || !['approve', 'deny'].includes(action)) {
      return NextResponse.json(
        { error: 'Valid action (approve/deny) is required' },
        { status: 400 }
      );
    }

    // Get the sharing request
    const { data: sharingRequest, error: fetchError } = await supabase
      .from('content_sharing_requests')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 });
      }
      throw fetchError;
    }

    if (sharingRequest.status !== 'pending') {
      return NextResponse.json(
        { error: 'Request has already been processed' },
        { status: 400 }
      );
    }

    // Check if user has admin access to approve/deny
    const hasAdminAccess = await checkAdminAccess(
      supabase, 
      user.id, 
      sharingRequest.target_institution_id
    );

    if (!hasAdminAccess) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Process the approval/denial
    const enforcement = new ContentSharingEnforcement();
    await enforcement.processApproval(
      params.id,
      action === 'approve',
      user.id,
      reason
    );

    // Get updated request
    const { data: updatedRequest, error: updateError } = await supabase
      .from('content_sharing_requests')
      .select('*')
      .eq('id', params.id)
      .single();

    if (updateError) throw updateError;

    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error('Error processing sharing request:', error);
    return NextResponse.json(
      { error: 'Failed to process sharing request' },
      { status: 500 }
    );
  }
}

async function checkAdminAccess(supabase: any, userId: string, institutionId: string): Promise<boolean> {
  const { data: userRole } = await supabase
    .from('user_institutions')
    .select('role')
    .eq('user_id', userId)
    .eq('institution_id', institutionId)
    .single();

  return userRole && ['institution_admin', 'department_admin', 'system_admin'].includes(userRole.role);
}