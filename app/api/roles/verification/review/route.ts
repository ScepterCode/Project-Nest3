import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { RoleVerificationService } from '../../../../../lib/services/role-verification-service';

const verificationConfig = {
  domainVerificationEnabled: true,
  manualVerificationEnabled: true,
  verificationTimeoutDays: 7,
  maxEvidenceFiles: 5,
  allowedFileTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  maxFileSize: 10 * 1024 * 1024 // 10MB
};

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institutionId');
    const status = searchParams.get('status') || 'pending';

    if (!institutionId) {
      return NextResponse.json(
        { error: 'Institution ID is required' },
        { status: 400 }
      );
    }

    // Initialize verification service
    const verificationService = new RoleVerificationService(verificationConfig);

    // Get pending verification requests for the institution
    const requests = await verificationService.getPendingVerifications(
      institutionId,
      user.id // This will validate reviewer permissions
    );

    // Get additional user information for each request
    const requestsWithUserInfo = await Promise.all(
      requests.map(async (req) => {
        const { data: userData } = await supabase
          .from('users')
          .select('email, full_name')
          .eq('id', req.userId)
          .single();

        const { data: institutionData } = await supabase
          .from('institutions')
          .select('name')
          .eq('id', req.institutionId)
          .single();

        return {
          id: req.id,
          userId: req.userId,
          userName: userData?.full_name || userData?.email || 'Unknown User',
          userEmail: userData?.email || '',
          institutionId: req.institutionId,
          institutionName: institutionData?.name || 'Unknown Institution',
          requestedRole: req.requestedRole,
          verificationMethod: req.verificationMethod,
          evidence: req.evidence || [],
          status: req.status,
          justification: req.justification || '',
          submittedAt: req.submittedAt,
          reviewedAt: req.reviewedAt,
          reviewedBy: req.reviewedBy,
          reviewNotes: req.reviewNotes,
          expiresAt: req.expiresAt
        };
      })
    );

    return NextResponse.json({
      success: true,
      requests: requestsWithUserInfo
    });

  } catch (error) {
    console.error('Get verification review requests error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to get verification requests'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { 
      verificationRequestId, 
      action, 
      notes 
    }: {
      verificationRequestId: string;
      action: 'approve' | 'deny';
      notes?: string;
    } = body;

    // Validate required fields
    if (!verificationRequestId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (action === 'deny' && !notes?.trim()) {
      return NextResponse.json(
        { error: 'Notes are required when denying a request' },
        { status: 400 }
      );
    }

    // Initialize verification service
    const verificationService = new RoleVerificationService(verificationConfig);

    // Process the verification result
    const result = await verificationService.processVerificationResult(
      verificationRequestId,
      action === 'approve',
      user.id,
      notes
    );

    // If approved, we need to assign the role
    if (action === 'approve') {
      // Get the verification request details
      const { data: verificationRequest } = await supabase
        .from('verification_requests')
        .select('user_id, requested_role, institution_id')
        .eq('id', verificationRequestId)
        .single();

      if (verificationRequest) {
        // Assign the role to the user
        const { error: roleError } = await supabase
          .from('user_role_assignments')
          .upsert({
            user_id: verificationRequest.user_id,
            role: verificationRequest.requested_role,
            status: 'active',
            assigned_by: user.id,
            assigned_at: new Date().toISOString(),
            institution_id: verificationRequest.institution_id,
            is_temporary: false
          });

        if (roleError) {
          console.error('Failed to assign role:', roleError);
          // Note: We might want to handle this more gracefully
        }

        // Update user's primary role if this is their first role or higher priority
        await supabase
          .from('users')
          .update({
            primary_role: verificationRequest.requested_role,
            role_status: 'active',
            role_verified_at: new Date().toISOString(),
            role_assigned_by: user.id
          })
          .eq('id', verificationRequest.user_id);
      }
    }

    return NextResponse.json({
      success: true,
      result: {
        verified: result.verified,
        method: result.method,
        reason: result.reason
      }
    });

  } catch (error) {
    console.error('Process verification result error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process verification result'
      },
      { status: 500 }
    );
  }
}