import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enrollmentConfigService } from '@/lib/services/enrollment-config';
import { RestrictionType } from '@/lib/types/enrollment';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const classId = params.id;
    const restrictions = await enrollmentConfigService.getRestrictions(classId);

    return NextResponse.json({ restrictions });

  } catch (error) {
    console.error('Get restrictions error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch restrictions' },
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
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const classId = params.id;
    const body = await request.json();

    // Check if user has permission to modify restrictions
    const { data: classData } = await supabase
      .from('classes')
      .select('teacher_id, institution_id')
      .eq('id', classId)
      .single();

    if (!classData) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    const isTeacher = classData.teacher_id === user.id;
    const isAdmin = userProfile?.role === 'institution_admin' && 
                   userProfile?.institution_id === classData.institution_id;

    if (!isTeacher && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { type, condition, description, overridable } = body;

    if (!type || !condition) {
      return NextResponse.json(
        { error: 'Type and condition are required' },
        { status: 400 }
      );
    }

    const restriction = await enrollmentConfigService.addRestriction(
      classId,
      {
        type: type as RestrictionType,
        condition,
        description,
        overridable
      },
      user.id
    );

    return NextResponse.json({
      success: true,
      restriction
    });

  } catch (error) {
    console.error('Add restriction error:', error);
    
    if (error instanceof Error && error.message.includes('validation failed')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to add restriction' },
      { status: 500 }
    );
  }
}