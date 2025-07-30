import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EnrollmentManager } from '@/lib/services/enrollment-manager';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { classId, justification } = body;

    if (!classId) {
      return NextResponse.json(
        { error: 'Class ID is required' },
        { status: 400 }
      );
    }

    const enrollmentManager = new EnrollmentManager();
    const result = await enrollmentManager.requestEnrollment(
      user.id,
      classId,
      justification
    );

    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.message,
          details: result.errors,
          nextSteps: result.nextSteps
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      enrollment: result.enrollment,
      status: result.status,
      message: result.message,
      nextSteps: result.nextSteps
    });

  } catch (error) {
    console.error('Enrollment request error:', error);
    return NextResponse.json(
      { error: 'Failed to process enrollment request' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId') || user.id;
    const status = searchParams.get('status');
    const classId = searchParams.get('classId');

    // Check if user can access the requested student's data
    if (studentId !== user.id) {
      const { data: userProfile } = await supabase
        .from('users')
        .select('role, institution_id')
        .eq('id', user.id)
        .single();

      const isAuthorized = userProfile?.role === 'institution_admin' || 
                          userProfile?.role === 'department_admin' ||
                          userProfile?.role === 'teacher';

      if (!isAuthorized) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    let query = supabase
      .from('enrollments')
      .select(`
        *,
        classes (
          id,
          name,
          code,
          description,
          users!classes_teacher_id_fkey (
            first_name,
            last_name
          ),
          departments (
            name
          )
        )
      `)
      .eq('student_id', studentId);

    if (status) {
      query = query.eq('status', status);
    }

    if (classId) {
      query = query.eq('class_id', classId);
    }

    const { data: enrollments, error } = await query.order('enrolled_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ enrollments });

  } catch (error) {
    console.error('Get enrollments error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch enrollments' },
      { status: 500 }
    );
  }
}