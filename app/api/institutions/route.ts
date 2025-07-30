import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { InstitutionManager } from '@/lib/services/institution-manager';
import { InstitutionCreationData, InstitutionFilters } from '@/lib/types/institution';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    // Check if user is system admin
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

    // Parse query parameters for filtering
    const url = new URL(request.url);
    const filters: InstitutionFilters = {
      type: url.searchParams.get('type') as any,
      status: url.searchParams.get('status') as any,
      domain: url.searchParams.get('domain') || undefined,
      search: url.searchParams.get('search') || undefined,
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 20,
      offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : 0
    };

    // Handle date filters
    if (url.searchParams.get('createdAfter')) {
      filters.createdAfter = new Date(url.searchParams.get('createdAfter')!);
    }
    if (url.searchParams.get('createdBefore')) {
      filters.createdBefore = new Date(url.searchParams.get('createdBefore')!);
    }

    const institutionManager = new InstitutionManager();
    const result = await institutionManager.listInstitutions(filters);

    return NextResponse.json({
      success: true,
      data: {
        institutions: result.institutions,
        total: result.total,
        limit: filters.limit,
        offset: filters.offset
      }
    });

  } catch (error) {
    console.error('Institution list API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    // Check if user is system admin
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

    // Parse request body
    const body = await request.json();
    const institutionData: InstitutionCreationData = {
      name: body.name,
      domain: body.domain,
      subdomain: body.subdomain,
      type: body.type,
      contactInfo: body.contactInfo || {},
      address: body.address || {},
      settings: body.settings,
      branding: body.branding,
      subscription: body.subscription
    };

    const institutionManager = new InstitutionManager();
    const result = await institutionManager.createInstitution(institutionData, user.id);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to create institution',
        errors: result.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        institution: result.institution
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Institution creation API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}