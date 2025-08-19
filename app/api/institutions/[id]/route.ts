import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { InstitutionManager } from '@/lib/services/institution-manager';
import { InstitutionCreationData } from '@/lib/types/institution';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const institutionId = params.id;

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    // Get user profile to check permissions
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (!userProfile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 });
    }

    // Check access permissions
    const isSystemAdmin = userProfile.role === 'system_admin';
    const isInstitutionMember = userProfile.institution_id === institutionId;
    const isInstitutionAdmin = userProfile.role === 'institution_admin' && isInstitutionMember;

    if (!isSystemAdmin && !isInstitutionMember) {
      return NextResponse.json({
        success: false,
        error: 'Access denied'
      }, { status: 403 });
    }

    const institutionManager = new InstitutionManager();
    const institution = await institutionManager.getInstitutionById(institutionId);

    if (!institution) {
      return NextResponse.json({
        success: false,
        error: 'Institution not found'
      }, { status: 404 });
    }

    // Filter sensitive data for non-admin users
    let responseData = institution;
    if (!isSystemAdmin && !isInstitutionAdmin) {
      responseData = {
        ...institution,
        subscription: undefined, // Hide subscription details from regular users
        settings: {
          ...institution.settings,
          integrations: [] // Hide integration details
        }
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        institution: responseData
      }
    });

  } catch (error) {
    console.error('Institution get API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const institutionId = params.id;

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    // Get user profile to check permissions
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (!userProfile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 });
    }

    // Check access permissions
    const isSystemAdmin = userProfile.role === 'system_admin';
    const isInstitutionAdmin = userProfile.role === 'institution_admin' && userProfile.institution_id === institutionId;

    if (!isSystemAdmin && !isInstitutionAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Access denied. Institution admin role required.'
      }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const updates: Partial<InstitutionCreationData> = {
      name: body.name,
      domain: body.domain,
      subdomain: body.subdomain,
      type: body.type,
      contactInfo: body.contactInfo,
      address: body.address,
      settings: body.settings,
      branding: body.branding,
      subscription: body.subscription
    };

    // Remove undefined values
    Object.keys(updates).forEach(key => {
      if (updates[key as keyof InstitutionCreationData] === undefined) {
        delete updates[key as keyof InstitutionCreationData];
      }
    });

    const institutionManager = new InstitutionManager();
    const result = await institutionManager.updateInstitution(institutionId, updates);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to update institution',
        errors: result.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        institution: result.institution
      }
    });

  } catch (error) {
    console.error('Institution update API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const institutionId = params.id;

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    // Check if user is system admin (only system admins can delete institutions)
    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || userProfile.role !== 'system_admin') {
      return NextResponse.json({
        success: false,
        error: 'Access denied. System admin role required.'
      }, { status: 403 });
    }

    const institutionManager = new InstitutionManager();
    const result = await institutionManager.deleteInstitution(institutionId);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to delete institution',
        errors: result.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Institution deleted successfully'
    });

  } catch (error) {
    console.error('Institution delete API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}