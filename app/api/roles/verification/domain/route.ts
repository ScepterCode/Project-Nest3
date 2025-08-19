import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { RoleVerificationService } from '../../../../../lib/services/role-verification-service';
import { UserRole } from '../../../../../lib/types/role-management';

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
 * GET /api/roles/verification/domain
 * Get institution domains and their verification status
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
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

    if (!institutionId) {
      return NextResponse.json(
        { error: 'Institution ID is required' },
        { status: 400 }
      );
    }

    // Verify user has admin permissions for this institution
    const { data: roleAssignment } = await supabase
      .from('user_role_assignments')
      .select('*')
      .eq('user_id', user.id)
      .eq('institution_id', institutionId)
      .in('role', ['institution_admin', 'system_admin'])
      .eq('status', 'active')
      .single();

    if (!roleAssignment) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Get institution domains
    const { data: domains, error: domainsError } = await supabase
      .from('institution_domains')
      .select('*')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (domainsError) {
      throw new Error(`Failed to get domains: ${domainsError.message}`);
    }

    const formattedDomains = domains?.map(domain => ({
      id: domain.id,
      domain: domain.domain,
      verified: domain.verified,
      autoApproveRoles: domain.auto_approve_roles || [],
      verificationToken: domain.verification_token,
      verificationMethod: domain.verification_method,
      createdAt: domain.created_at,
      verifiedAt: domain.verified_at
    })) || [];

    return NextResponse.json({
      success: true,
      domains: formattedDomains
    });

  } catch (error) {
    console.error('Get domain verification error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to get domain verification status'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/roles/verification/domain
 * Configure a new domain for verification
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
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
      domain, 
      autoApproveRoles 
    }: {
      institutionId: string;
      domain: string;
      autoApproveRoles: UserRole[];
    } = body;

    // Validate required fields
    if (!institutionId || !domain) {
      return NextResponse.json(
        { error: 'Institution ID and domain are required' },
        { status: 400 }
      );
    }

    // Initialize verification service
    const verificationService = new RoleVerificationService(verificationConfig);

    // Configure the domain
    const institutionDomain = await verificationService.configureInstitutionDomain(
      institutionId,
      domain,
      autoApproveRoles || [],
      user.id
    );

    return NextResponse.json({
      success: true,
      domain: {
        id: institutionDomain.id,
        domain: institutionDomain.domain,
        verified: institutionDomain.verified,
        autoApproveRoles: institutionDomain.autoApproveRoles,
        createdAt: institutionDomain.createdAt
      }
    });

  } catch (error) {
    console.error('Configure domain verification error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to configure domain verification'
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/roles/verification/domain
 * Verify domain ownership
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    
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
      domainId, 
      verificationToken 
    }: {
      domainId: string;
      verificationToken: string;
    } = body;

    // Validate required fields
    if (!domainId || !verificationToken) {
      return NextResponse.json(
        { error: 'Domain ID and verification token are required' },
        { status: 400 }
      );
    }

    // Initialize verification service
    const verificationService = new RoleVerificationService(verificationConfig);

    // Verify domain ownership
    const isVerified = await verificationService.verifyDomainOwnership(
      domainId,
      verificationToken
    );

    return NextResponse.json({
      success: true,
      verified: isVerified,
      message: isVerified 
        ? 'Domain ownership verified successfully' 
        : 'Domain verification failed'
    });

  } catch (error) {
    console.error('Verify domain ownership error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to verify domain ownership'
      },
      { status: 500 }
    );
  }
}