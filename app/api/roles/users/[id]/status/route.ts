import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UserRole } from '@/lib/types/role-management';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const targetUserId = params.id;
    const body = await request.json();
    const { status } = body;

    if (!status || !['active', 'suspended'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "active" or "suspended"' },
        { status: 400 }
      );
    }

    // Get admin profile to check permissions
    const { data: adminProfile, error: adminError } = await supabase
      .from('users')
      .select('id, institution_id, primary_role, department_id, full_name')
      .eq('id', user.id)
      .single();

    if (adminError || !adminProfile) {
      return NextResponse.json(
        { error: 'Admin profile not found' },
        { status: 404 }
      );
    }

    // Check if user has permission to change user status
    const canChangeStatus = [
      UserRole.SYSTEM_ADMIN,
      UserRole.INSTITUTION_ADMIN,
      UserRole.DEPARTMENT_ADMIN
    ].includes(adminProfile.primary_role);

    if (!canChangeStatus) {
      return NextResponse.json(
        { error: 'Insufficient permissions to change user status' },
        { status: 403 }
      );
    }

    // Get target user profile
    const { data: targetUser, error: targetError } = await supabase
      .from('users')
      .select('id, email, full_name, institution_id, department_id, primary_role, role_status')
      .eq('id', targetUserId)
      .single();

    if (targetError || !targetUser) {
      return NextResponse.json(
        { error: 'Target user not found' },
        { status: 404 }
      );
    }

    // Validate admin can modify this user based on scope
    const canModifyUser = await validateModificationPermission(
      adminProfile,
      targetUser,
      supabase
    );

    if (!canModifyUser) {
      return NextResponse.json(
        { error: 'Insufficient permissions to modify this user' },
        { status: 403 }
      );
    }

    // Prevent admins from suspending themselves
    if (targetUserId === user.id && status === 'suspended') {
      return NextResponse.json(
        { error: 'Cannot suspend your own account' },
        { status: 400 }
      );
    }

    // Prevent lower-level admins from modifying higher-level admins
    if (!canModifyUserRole(adminProfile.primary_role, targetUser.primary_role)) {
      return NextResponse.json(
        { error: 'Cannot modify user with equal or higher privileges' },
        { status: 403 }
      );
    }

    try {
      // Update user status
      const { error: updateError } = await supabase
        .from('users')
        .update({
          role_status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', targetUserId);

      if (updateError) {
        console.error('Error updating user status:', updateError);
        return NextResponse.json(
          { error: 'Failed to update user status' },
          { status: 500 }
        );
      }

      // Update role assignments status
      const { error: assignmentError } = await supabase
        .from('user_role_assignments')
        .update({
          status: status === 'suspended' ? 'suspended' : 'active',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', targetUserId);

      if (assignmentError) {
        console.error('Error updating role assignments:', assignmentError);
      }

      // Log the status change in audit log
      const { error: auditError } = await supabase
        .from('role_audit_log')
        .insert({
          user_id: targetUserId,
          action: status === 'suspended' ? 'suspended' : 'activated',
          old_role: targetUser.primary_role,
          new_role: targetUser.primary_role,
          changed_by: user.id,
          reason: `User status changed to ${status}`,
          timestamp: new Date().toISOString(),
          institution_id: targetUser.institution_id,
          department_id: targetUser.department_id,
          metadata: { 
            previous_status: targetUser.role_status,
            new_status: status
          }
        });

      if (auditError) {
        console.error('Error creating audit log:', auditError);
      }

      // Notify the user about status change
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: targetUserId,
          type: status === 'suspended' ? 'account_suspended' : 'account_activated',
          title: status === 'suspended' ? 'Account Suspended' : 'Account Activated',
          message: status === 'suspended' 
            ? 'Your account has been suspended. Please contact your administrator for more information.'
            : 'Your account has been activated and you can now access the platform.',
          data: {
            changedBy: adminProfile.full_name || user.email,
            previousStatus: targetUser.role_status,
            newStatus: status,
            timestamp: new Date().toISOString()
          },
          created_at: new Date().toISOString()
        });

      if (notificationError) {
        console.error('Error creating notification:', notificationError);
      }

      return NextResponse.json({
        success: true,
        message: `User status changed to ${status} successfully`,
        data: {
          userId: targetUserId,
          previousStatus: targetUser.role_status,
          newStatus: status,
          changedBy: user.id,
          changedAt: new Date().toISOString()
        }
      });

    } catch (processingError) {
      console.error('Status change processing error:', processingError);
      return NextResponse.json(
        { error: processingError instanceof Error ? processingError.message : 'Failed to change user status' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('User status change error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function validateModificationPermission(
  admin: any,
  targetUser: any,
  supabase: any
): Promise<boolean> {
  // System admins can modify any user
  if (admin.primary_role === UserRole.SYSTEM_ADMIN) {
    return true;
  }

  // Institution admins can modify users within their institution
  if (admin.primary_role === UserRole.INSTITUTION_ADMIN) {
    return admin.institution_id === targetUser.institution_id;
  }

  // Department admins can modify users within their department
  if (admin.primary_role === UserRole.DEPARTMENT_ADMIN) {
    return admin.institution_id === targetUser.institution_id &&
           admin.department_id === targetUser.department_id;
  }

  return false;
}

function canModifyUserRole(adminRole: UserRole, targetRole: UserRole): boolean {
  const roleHierarchy = {
    [UserRole.SYSTEM_ADMIN]: 5,
    [UserRole.INSTITUTION_ADMIN]: 4,
    [UserRole.DEPARTMENT_ADMIN]: 3,
    [UserRole.TEACHER]: 2,
    [UserRole.STUDENT]: 1
  };

  return roleHierarchy[adminRole] > roleHierarchy[targetRole];
}