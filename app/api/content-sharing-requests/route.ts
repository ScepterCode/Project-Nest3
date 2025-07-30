import { NextRequest, NextResponse } from 'next/server';
import { ContentSharingEnforcement } from '@/lib/services/content-sharing-enforcement';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const institutionId = url.searchParams.get('institutionId');

    let query = supabase
      .from('content_sharing_requests')
      .select(`
        *,
        requester:users!requester_id(name, email),
        target_institution:institutions!target_institution_id(name)
      `);

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Filter by institution if user is admin
    if (institutionId) {
      const { data: userRole } = await supabase
        .from('user_institutions')
        .select('role')
        .eq('user_id', user.id)
        .eq('institution_id', institutionId)
        .single();

      if (userRole && ['institution_admin', 'department_admin', 'system_admin'].includes(userRole.role)) {
        query = query.eq('target_institution_id', institutionId);
      } else {
        // Regular users can only see their own requests
        query = query.eq('requester_id', user.id);
      }
    } else {
      // No institution specified, show user's own requests
      query = query.eq('requester_id', user.id);
    }

    const { data: requests, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(requests);
  } catch (error) {
    console.error('Error fetching sharing requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sharing requests' },
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
      contentId, 
      contentType, 
      targetInstitutionId, 
      targetDepartmentId, 
      requestedPermissions, 
      justification 
    } = body;

    if (!contentId || !contentType || !requestedPermissions) {
      return NextResponse.json(
        { error: 'Content ID, content type, and requested permissions are required' },
        { status: 400 }
      );
    }

    // Get user's institution
    const { data: userInstitution } = await supabase
      .from('user_institutions')
      .select('institution_id, department_id')
      .eq('user_id', user.id)
      .single();

    if (!userInstitution) {
      return NextResponse.json(
        { error: 'User not associated with any institution' },
        { status: 400 }
      );
    }

    // Create sharing request
    const { data: sharingRequest, error } = await supabase
      .from('content_sharing_requests')
      .insert({
        content_id: contentId,
        content_type: contentType,
        requester_id: user.id,
        target_institution_id: targetInstitutionId,
        target_department_id: targetDepartmentId,
        requested_permissions: requestedPermissions,
        justification,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(sharingRequest, { status: 201 });
  } catch (error) {
    console.error('Error creating sharing request:', error);
    return NextResponse.json(
      { error: 'Failed to create sharing request' },
      { status: 500 }
    );
  }
}