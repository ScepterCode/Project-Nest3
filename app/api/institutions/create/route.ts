import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { InstitutionType, InstitutionStatus, DepartmentStatus } from '@/lib/types/onboarding';

interface CreateInstitutionRequest {
  name: string;
  domain?: string;
  type: InstitutionType;
  contactEmail: string;
  description?: string;
  departments: Array<{
    name: string;
    code?: string;
    description?: string;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateInstitutionRequest = await request.json();
    
    // Validate required fields
    if (!body.name || body.name.trim().length < 2) {
      return NextResponse.json({ 
        success: false, 
        error: 'Institution name is required and must be at least 2 characters long' 
      }, { status: 400 });
    }

    if (!body.contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactEmail)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Valid contact email is required' 
      }, { status: 400 });
    }

    if (!body.departments || body.departments.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'At least one department is required' 
      }, { status: 400 });
    }

    const supabase = await createClient();
    
    // Get the current user to ensure they're authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 });
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

    // Check domain uniqueness if provided
    if (body.domain) {
      const { data: existingDomain } = await supabase
        .from('institutions')
        .select('id, domain')
        .eq('domain', body.domain.trim())
        .single();

      if (existingDomain) {
        return NextResponse.json({ 
          success: false, 
          error: 'An institution with this domain already exists' 
        }, { status: 409 });
      }
    }

    // Start transaction by creating institution
    const institutionData = {
      name: body.name.trim(),
      domain: body.domain?.trim() || null,
      type: body.type,
      status: InstitutionStatus.ACTIVE,
      contact_email: body.contactEmail.trim(),
      description: body.description?.trim() || null,
      settings: {
        allowSelfRegistration: true,
        requireEmailVerification: true,
        defaultUserRole: 'student',
        allowCrossInstitutionCollaboration: false
      },
      branding: {
        primaryColor: '#3B82F6',
        secondaryColor: '#64748B',
        accentColor: '#10B981'
      },
      created_by: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: institution, error: institutionError } = await supabase
      .from('institutions')
      .insert([institutionData])
      .select()
      .single();

    if (institutionError) {
      console.error('Institution creation error:', institutionError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to create institution' 
      }, { status: 500 });
    }

    // Create departments
    const departmentData = body.departments
      .filter(dept => dept.name.trim())
      .map(dept => ({
        institution_id: institution.id,
        name: dept.name.trim(),
        code: dept.code?.trim() || null,
        description: dept.description?.trim() || null,
        status: DepartmentStatus.ACTIVE,
        settings: {
          defaultClassSettings: {},
          customFields: []
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

    const { data: departments, error: departmentError } = await supabase
      .from('departments')
      .insert(departmentData)
      .select();

    if (departmentError) {
      console.error('Department creation error:', departmentError);
      // Try to clean up the institution if department creation fails
      await supabase.from('institutions').delete().eq('id', institution.id);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to create departments' 
      }, { status: 500 });
    }

    // Update user to be institution admin
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        institution_id: institution.id,
        role: 'institution_admin',
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (userUpdateError) {
      console.error('User role update error:', userUpdateError);
      // Don't fail the entire operation for this, but log it
    }

    // Update user metadata in auth
    const { error: authUpdateError } = await supabase.auth.updateUser({
      data: {
        role: 'institution_admin',
        institution_id: institution.id,
        institution_name: institution.name
      }
    });

    if (authUpdateError) {
      console.error('Auth metadata update error:', authUpdateError);
      // Don't fail the entire operation for this, but log it
    }

    return NextResponse.json({
      success: true,
      data: {
        institution: {
          id: institution.id,
          name: institution.name,
          domain: institution.domain,
          type: institution.type,
          status: institution.status
        },
        departments: departments.map(dept => ({
          id: dept.id,
          name: dept.name,
          code: dept.code,
          description: dept.description
        })),
        message: 'Institution and departments created successfully'
      }
    });

  } catch (error) {
    console.error('Institution creation API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}