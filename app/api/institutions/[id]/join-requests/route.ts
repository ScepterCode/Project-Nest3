import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { InstitutionJoinRequestManager } from '@/lib/services/institution-join-request-manager';
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

    const institutionId = params.id;
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const filters = {
      status: searchParams.get('status') as 'pending' | 'approved' | 'rejected' | 'withdrawn' | undefined,
      requestedRole: searchParams.get('requestedRole') as UserRole | undefined,
      departmentId: searchParams.get('departmentId') || undefined,
      requestedAfter: searchParams.get('requestedAfter') ? new Date(searchParams.get('requestedAfter')!) : undefined,
      requestedBefore: searchParams.get('requestedBefore') ? new Date(searchParams.get('requestedBefore')!) : undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
    };

    // Validate user has permission to view join requests
    const { data: userRole } = await supabase
      .from('user_institutions')
      .select('role')
      .eq('user_id', user.id)
      .eq('institution_id', institutionId)
      .eq('status', 'active')
      .single();

    if (!userRole || !['institution_admin', 'department_admin'].includes(userRole.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get join requests
    const joinRequestManager = new InstitutionJoinRequestManager();
    const result = await joinRequestManager.getInstitutionJoinRequests(institutionId, filters);

    return NextResponse.json({
      success: true,
      data: {
        requests: result.requests,
        total: result.total,
        filters
      }
    });

  } catch (error) {
    console.error('Error fetching institution join requests:', error);
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

    const institutionId = params.id;
    const body = await request.json();
    const { action, ...actionData } = body;

    const joinRequestManager = new InstitutionJoinRequestManager();

    switch (action) {
      case 'create':
        // User creating a join request
        const { requestedRole, departmentId, message } = actionData;
        
        const createResult = await joinRequestManager.createJoinRequest({
          userId: user.id,
          institutionId,
          requestedRole,
          departmentId,
          message
        });

        if (!createResult.success) {
          return NextResponse.json({
            success: false,
            errors: createResult.errors
          }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          data: { request: createResult.request }
        });

      case 'review':
        // Admin reviewing a join request
        const { requestId, approved, reviewNotes, assignedRole, assignedDepartmentId } = actionData;

        // Validate user has permission to review requests
        const { data: userRole } = await supabase
          .from('user_institutions')
          .select('role')
          .eq('user_id', user.id)
          .eq('institution_id', institutionId)
          .eq('status', 'active')
          .single();

        if (!userRole || !['institution_admin', 'department_admin'].includes(userRole.role)) {
          return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
        }

        const reviewResult = await joinRequestManager.reviewJoinRequest({
          requestId,
          reviewedBy: user.id,
          approved,
          reviewNotes,
          assignedRole,
          assignedDepartmentId
        });

        if (!reviewResult.success) {
          return NextResponse.json({
            success: false,
            errors: reviewResult.errors
          }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          message: `Join request ${approved ? 'approved' : 'rejected'} successfully`
        });

      case 'withdraw':
        // User withdrawing their own request
        const { requestId: withdrawRequestId, reason } = actionData;
        
        const withdrawResult = await joinRequestManager.withdrawJoinRequest(
          withdrawRequestId,
          user.id,
          reason
        );

        if (!withdrawResult.success) {
          return NextResponse.json({
            success: false,
            errors: withdrawResult.errors
          }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          message: 'Join request withdrawn successfully'
        });

      case 'bulk_review':
        // Admin bulk reviewing multiple requests
        const { requestIds, approved: bulkApproved, reviewNotes: bulkReviewNotes } = actionData;

        // Validate user has permission to review requests
        const { data: bulkUserRole } = await supabase
          .from('user_institutions')
          .select('role')
          .eq('user_id', user.id)
          .eq('institution_id', institutionId)
          .eq('status', 'active')
          .single();

        if (!bulkUserRole || !['institution_admin', 'department_admin'].includes(bulkUserRole.role)) {
          return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
        }

        const bulkResult = await joinRequestManager.bulkReviewRequests(
          requestIds,
          user.id,
          bulkApproved,
          bulkReviewNotes
        );

        return NextResponse.json({
          success: true,
          data: bulkResult
        });

      default:
        return NextResponse.json({
          error: 'Invalid action'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Error managing institution join requests:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}