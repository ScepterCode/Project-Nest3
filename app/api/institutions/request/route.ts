import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface InstitutionRequest {
  name: string;
  domain?: string;
  type?: string;
  contactEmail?: string;
  description?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: InstitutionRequest = await request.json();
    
    if (!body.name || body.name.trim().length < 2) {
      return NextResponse.json({ 
        success: false, 
        error: 'Institution name is required and must be at least 2 characters long' 
      }, { status: 400 });
    }

    const supabase = createClient();
    
    // Get the current user to ensure they're authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // Get user profile to check permissions
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json({ 
        success: false, 
        error: 'User profile not found' 
      }, { status: 404 });
    }

    // Check if institution already exists
    const { data: existingInstitution } = await supabase
      .from('institutions')
      .select('id, name')
      .ilike('name', body.name.trim())
      .single();

    if (existingInstitution) {
      return NextResponse.json({ 
        success: false, 
        error: 'An institution with this name already exists' 
      }, { status: 409 });
    }

    // Create institution request record
    const { data: institutionRequest, error } = await supabase
      .from('institution_requests')
      .insert([{
        name: body.name.trim(),
        domain: body.domain?.trim() || null,
        type: body.type || 'other',
        contact_email: body.contactEmail?.trim() || null,
        description: body.description?.trim() || null,
        requested_by: user.id,
        status: 'pending',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Institution request creation error:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to submit institution request' 
      }, { status: 500 });
    }

    // In a real application, you might want to:
    // 1. Send an email notification to admins
    // 2. Create a workflow for approval
    // 3. Log the request for analytics

    return NextResponse.json({
      success: true,
      data: {
        id: institutionRequest.id,
        message: 'Institution request submitted successfully. We will review it and get back to you.'
      }
    });

  } catch (error) {
    console.error('Institution request API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}