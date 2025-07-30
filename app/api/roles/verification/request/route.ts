import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { RoleVerificationService } from '../../../../../lib/services/role-verification-service';
import { UserRole, VerificationEvidence } from '../../../../../lib/types/role-management';

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
      institutionId, 
      requestedRole, 
      evidence, 
      justification 
    }: {
      institutionId: string;
      requestedRole: UserRole;
      evidence: VerificationEvidence[];
      justification: string;
    } = body;

    // Validate required fields
    if (!institutionId || !requestedRole || !justification) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate role
    if (!Object.values(UserRole).includes(requestedRole)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }

    // Check if user already has a pending verification request for this role
    const { data: existingRequest } = await supabase
      .from('verification_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('institution_id', institutionId)
      .eq('requested_role', requestedRole)
      .eq('status', 'pending')
      .single();

    if (existingRequest) {
      return NextResponse.json(
        { error: 'You already have a pending verification request for this role' },
        { status: 409 }
      );
    }

    // Initialize verification service
    const verificationService = new RoleVerificationService(verificationConfig);

    // Submit verification request
    const verificationRequest = await verificationService.requestManualVerification(
      user.id,
      institutionId,
      requestedRole,
      evidence || []
    );

    return NextResponse.json({
      success: true,
      verificationRequest: {
        id: verificationRequest.id,
        status: verificationRequest.status,
        submittedAt: verificationRequest.submittedAt,
        expiresAt: verificationRequest.expiresAt
      }
    });

  } catch (error) {
    console.error('Verification request error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to submit verification request'
      },
      { status: 500 }
    );
  }
}

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

    const requests = await verificationService.getPendingVerifications(
      institutionId || '',
      user.id
    );

    // Transform for client
    const transformedRequests = requests.map(req => ({
      id: req.id,
      requestedRole: req.requestedRole,
      status: req.status,
      verificationMethod: req.verificationMethod,
      submittedAt: req.submittedAt,
      expiresAt: req.expiresAt,
      reviewedAt: req.reviewedAt,
      reviewNotes: req.reviewNotes,
      evidenceCount: req.evidence?.length || 0,
      justification: req.justification || ''
    }));

    return NextResponse.json({
      success: true,
      requests: transformedRequests
    });

  } catch (error) {
    console.error('Get verification requests error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to get verification requests'
      },
      { status: 500 }
    );
  }
}