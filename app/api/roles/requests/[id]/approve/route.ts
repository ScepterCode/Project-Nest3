import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RoleManager } from '@/lib/services/role-manager';
import { UserRole, RoleRequestStatus } from '@/lib/types/role-management';
import { withPermission, getUserContext } from '@/lib/middleware/api-permission-middleware';

const roleManagerConfig = {
  defaultRoleRequestExpiration: 7,
  maxTemporaryRoleDuration: 30,
  requireApprovalForRoles: [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
  autoApproveRoles: [UserRole.STUDENT]
};

async function handleRoleApproval(
  request: NextRequest,
  { params, user }: { params: { id: string }; user: any }
) {
  try {
    const supabase = await createClient();
    const requestId = params.id;
    const body = await request.json();
    const { notes } = body;

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

    // Use RoleManager to approve the role
    const roleManager = new RoleManager(roleManagerConfig);

    try {
      // Update the request status in database first
      const { error: updateError } = await supabase
        .from('role_requests')
        .update({
          status: RoleRequestStatus.APPROVED,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          review_notes: notes || null
        })
        .eq('id', requestId);

      if (updateError) {
        console.error('Error updating role request:', updateError);
        return NextResponse.json(
          { error: 'Failed to update role request' },
          { status: 500 }
        );
      }

      // Assign the role to the user
      const { error: roleUpdateError } = await supabase
        .from('users')
        .update({
          primary_role: roleRequest.requested_role,
          role_status: 'active',
          role_verified_at: new Date().toISOString(),
          role_assigned_by: user.id
        })
        .eq('id', roleRequest.user_id);

      if (roleUpdateError) {
        console.error('Error updating user role:', roleUpdateError);
        // Rollback the request status
        await supabase
          .from('role_requests')
          .update({ status: RoleRequestStatus.PENDING })
          .eq('id', requestId);

        return NextResponse.json(
          { error: 'Failed to assign role to user' },
          { status: 500 }
        );
      }

      // Create role assignment record
      const { error: assignmentError } = await supabase
        .from('user_role_assignments')
        .insert({
          user_id: roleRequest.user_id,
          role: roleRequest.requested_role,
          status: 'active',
          assigned_by: user.id,
          assigned_at: new Date().toISOString(),
          institution_id: roleRequest.institution_id,
          department_id: roleRequest.department_id,
          is_temporary: false,
          metadata: { approved_request_id: requestId }
        });

      if (assignmentError) {
        console.error('Error creating role assignment:', assignmentError);
      }

      // Log the approval in audit log
      const { error: auditError } = await supabase
        .from('role_audit_log')
        .insert({
          user_id: roleRequest.user_id,
          action: 'approved',
          old_role: roleRequest.current_role,
          new_role: roleRequest.requested_role,
          changed_by: user.id,
          reason: notes || 'Role request approved',
          timestamp: new Date().toISOString(),
          institution_id: roleRequest.institution_id,
          department_id: roleRequest.department_id,
          metadata: { request_id: requestId }
        });

      if (auditError) {
        console.error('Error creating audit log:', auditError);
      }

      // Notify the user about approval
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: roleRequest.user_id,
          type: 'role_request_approved',
          title: 'Role Request Approved',
          message: `Your request for ${roleRequest.requested_role} role has been approved`,
          data: {
            requestId: requestId,
            approvedRole: roleRequest.requested_role,
            approvedBy: user.email,
            notes: notes
          },
          created_at: new Date().toISOString()
        });

      if (notificationError) {
        console.error('Error creating notification:', notificationError);
      }

      return NextResponse.json({
        success: true,
        message: 'Role request approved successfully',
        data: {
          requestId: requestId,
          approvedRole: roleRequest.requested_role,
          approvedAt: new Date().toISOString(),
          approvedBy: user.id
        }
      });

    } catch (managerError) {
      console.error('RoleManager error:', managerError);
      return NextResponse.json(
        { error: managerError instanceof Error ? managerError.message : 'Failed to approve role request' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Role approval error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Export the PUT handler with permission middleware
export const PUT = withPermission(
  {
    permission: 'role_requests.approve',
    getResourceContext: async (request, params) => {
      const supabase = await createClient();
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
  handleRoleApproval
);