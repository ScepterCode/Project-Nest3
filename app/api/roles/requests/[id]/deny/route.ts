import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UserRole, RoleRequestStatus } from '@/lib/types/role-management';
import { withPermission } from '@/lib/middleware/api-permission-middleware';

async function handleRoleDenial(
  request: NextRequest,
  { params, user }: { params: { id: string }; user: any }
) {
  try {
    const supabase = createClient();
    const requestId = params.id;
    const body = await request.json();
    const { reason } = body;

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'Denial reason is required' },
        { status: 400 }
      );
    }

    // Get the role request
    const { data: roleRequest, error: requestError } = await supabase
      .from('role_requests')
      .select(`
        *,
        users!role_requests_user_id_fkey (
          id,
          email,
          full_name,
          institution_id,
          primary_role
        )
      `)
      .eq('id', requestId)
      .single();

    if (requestError || !roleRequest) {
      return NextResponse.json(
        { error: 'Role request not found' },
        { status: 404 }
      );
    }

    if (roleRequest.status !== RoleRequestStatus.PENDING) {
      return NextResponse.json(
        { error: 'Role request is not in pending status' },
        { status: 400 }
      );
    }

    // Check if request has expired
    if (new Date(roleRequest.expires_at) < new Date()) {
      // Update status to expired
      await supabase
        .from('role_requests')
        .update({ status: RoleRequestStatus.EXPIRED })
        .eq('id', requestId);

      return NextResponse.json(
        { error: 'Role request has expired' },
        { status: 400 }
      );
    }

    try {
      // Update the request status in database
      const { error: updateError } = await supabase
        .from('role_requests')
        .update({
          status: RoleRequestStatus.DENIED,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          review_notes: reason.trim()
        })
        .eq('id', requestId);

      if (updateError) {
        console.error('Error updating role request:', updateError);
        return NextResponse.json(
          { error: 'Failed to update role request' },
          { status: 500 }
        );
      }

      // Log the denial in audit log
      const { error: auditError } = await supabase
        .from('role_audit_log')
        .insert({
          user_id: roleRequest.user_id,
          action: 'denied',
          old_role: roleRequest.current_role,
          new_role: roleRequest.requested_role,
          changed_by: user.id,
          reason: reason.trim(),
          timestamp: new Date().toISOString(),
          institution_id: roleRequest.institution_id,
          department_id: roleRequest.department_id,
          metadata: { request_id: requestId }
        });

      if (auditError) {
        console.error('Error creating audit log:', auditError);
      }

      // Notify the user about denial
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: roleRequest.user_id,
          type: 'role_request_denied',
          title: 'Role Request Denied',
          message: `Your request for ${roleRequest.requested_role} role has been denied`,
          data: {
            requestId: requestId,
            deniedRole: roleRequest.requested_role,
            deniedBy: user.email,
            reason: reason.trim()
          },
          created_at: new Date().toISOString()
        });

      if (notificationError) {
        console.error('Error creating notification:', notificationError);
      }

      return NextResponse.json({
        success: true,
        message: 'Role request denied successfully',
        data: {
          requestId: requestId,
          deniedRole: roleRequest.requested_role,
          deniedAt: new Date().toISOString(),
          deniedBy: user.id,
          reason: reason.trim()
        }
      });

    } catch (processingError) {
      console.error('Role denial processing error:', processingError);
      return NextResponse.json(
        { error: processingError instanceof Error ? processingError.message : 'Failed to deny role request' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Role denial error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Export the PUT handler with permission middleware
export const PUT = withPermission(
  {
    permission: 'role_requests.deny',
    getResourceContext: async (request, params) => {
      const supabase = createClient();
      const { data: roleRequest } = await supabase
        .from('role_requests')
        .select('institution_id, department_id')
        .eq('id', params?.id)
        .single();

      return {
        resourceId: params?.id || 'unknown',
        resourceType: 'role_request',
        institutionId: roleRequest?.institution_id,
        departmentId: roleRequest?.department_id
      };
    }
  },
  handleRoleDenial
);