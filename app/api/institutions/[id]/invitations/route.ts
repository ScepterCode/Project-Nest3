import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { InstitutionInvitationManager } from '@/lib/services/institution-invitation-manager';
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
      status: searchParams.get('status') as 'pending' | 'accepted' | 'declined' | 'expired' | undefined,
      role: searchParams.get('role') as UserRole | undefined,
      departmentId: searchParams.get('departmentId') || undefined,
      invitedBy: searchParams.get('invitedBy') || undefined,
      createdAfter: searchParams.get('createdAfter') ? new Date(searchParams.get('createdAfter')!) : undefined,
      createdBefore: searchParams.get('createdBefore') ? new Date(searchParams.get('createdBefore')!) : undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
    };

    // Validate user has permission to view invitations
    const invitationManager = new InstitutionInvitationManager();
    
    // Check if user has admin role in this institution
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

    // Get invitations
    const result = await invitationManager.getInstitutionInvitations(institutionId, filters);

    return NextResponse.json({
      success: true,
      data: {
        invitations: result.invitations,
        total: result.total,
        filters
      }
    });

  } catch (error) {
    console.error('Error fetching institution invitations:', error);
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

    // Validate user has permission to create invitations
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

    const invitationManager = new InstitutionInvitationManager();
    const { action, ...actionData } = body;

    switch (action) {
      case 'create_single':
        const {
          email,
          role,
          departmentId,
          firstName,
          lastName,
          message,
          expiresAt
        } = actionData;

        const singleResult = await invitationManager.createInvitation({
          institutionId,
          email,
          role,
          departmentId,
          firstName,
          lastName,
          message,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          invitedBy: user.id
        });

        if (!singleResult.success) {
          return NextResponse.json({
            success: false,
            errors: singleResult.errors
          }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          data: { invitation: singleResult.invitation }
        });

      case 'create_bulk':
        const {
          invitations,
          defaultMessage,
          expiresAt: bulkExpiresAt,
          emailTemplate,
          sendImmediately
        } = actionData;

        const bulkResult = await invitationManager.createBulkInvitations({
          institutionId,
          invitations,
          invitedBy: user.id,
          defaultMessage,
          expiresAt: bulkExpiresAt ? new Date(bulkExpiresAt) : undefined,
          emailTemplate,
          sendImmediately
        });

        return NextResponse.json({
          success: true,
          data: bulkResult
        });

      case 'resend':
        const { invitationId } = actionData;
        const resendResult = await invitationManager.resendInvitation(invitationId, user.id);

        if (!resendResult.success) {
          return NextResponse.json({
            success: false,
            errors: resendResult.errors
          }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          message: 'Invitation resent successfully'
        });

      case 'revoke':
        const { invitationId: revokeId, reason } = actionData;
        const revokeResult = await invitationManager.revokeInvitation(revokeId, user.id, reason);

        if (!revokeResult.success) {
          return NextResponse.json({
            success: false,
            errors: revokeResult.errors
          }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          message: 'Invitation revoked successfully'
        });

      default:
        return NextResponse.json({
          error: 'Invalid action'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Error managing institution invitations:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}