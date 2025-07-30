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

/**
 * GET /api/roles/verification/status
 * Get verification status for the current user
 */
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
    const status = searchParams.get('status');

    // Initialize verification service
    const verificationService = new RoleVerificationService(verificationConfig);

    // Get user's verification requests
    const filters: any = { userId: user.id };
    if (institutionId) filters.institutionId = institutionId;
    if (status) filters.status = status;

    // Get verification requests using the service's internal method
    const requests = await (verificationService as any).getVerificationRequests(filters);

    // Format response
    const formattedRequests = requests.map((req: any) => ({
      id: req.id,
      requestedRole: req.requestedRole,
      status: req.status,
      verificationMethod: req.verificationMethod,
      justification: req.justification,
      submittedAt: req.submittedAt,
      reviewedAt: req.reviewedAt,
      reviewedBy: req.reviewedBy,
      reviewNotes: req.reviewNotes,
      expiresAt: req.expiresAt,
      evidenceCount: req.evidence?.length || 0,
      institutionId: req.institutionId
    }));

    return NextResponse.json({
      success: true,
      requests: formattedRequests
    });

  } catch (error) {
    console.error('Get verification status error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to get verification status'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/roles/verification/status
 * Withdraw a verification request
 */
export async function DELETE(request: NextRequest) {
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
    const requestId = searchParams.get('requestId');

    if (!requestId) {
      return NextResponse.json(
        { error: 'Request ID is required' },
        { status: 400 }
      );
    }

    // Verify the request belongs to the user and is still pending
    const { data: verificationRequest, error: fetchError } = await supabase
      .from('verification_requests')
      .select('*')
      .eq('id', requestId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single();

    if (fetchError || !verificationRequest) {
      return NextResponse.json(
        { error: 'Verification request not found or cannot be withdrawn' },
        { status: 404 }
      );
    }

    // Update the request status to withdrawn
    const { error: updateError } = await supabase
      .from('verification_requests')
      .update({
        status: 'withdrawn',
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (updateError) {
      throw new Error(`Failed to withdraw request: ${updateError.message}`);
    }

    // Log the status change
    await supabase
      .from('verification_status_log')
      .insert({
        verification_request_id: requestId,
        status: 'withdrawn',
        changed_by: user.id,
        reason: 'Request withdrawn by user',
        timestamp: new Date().toISOString()
      });

    return NextResponse.json({
      success: true,
      message: 'Verification request withdrawn successfully'
    });

  } catch (error) {
    console.error('Withdraw verification request error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to withdraw verification request'
      },
      { status: 500 }
    );
  }
}