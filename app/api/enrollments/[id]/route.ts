import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EnrollmentManager } from '@/lib/services/enrollment-manager';

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

    const enrollmentId = params.id;

    // Get enrollment details
    const { data: enrollment, error } = await supabase
      .from('enrollments')
      .select(`
        *,
        users!enrollments_student_id_fkey (
          id,
          first_name,
          last_name,
          email
        ),
        classes (
          id,
          name,
          code,
          teacher_id,
          institution_id,
          users!classes_teacher_id_fkey (
            first_name,
            last_name
          ),
          departments (
            name
          )
        )
      `)
      .eq('id', enrollmentId)
      .single();

    if (error || !enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }

    // Check if user has permission to view this enrollment
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    const isStudent = enrollment.student_id === user.id;
    const isTeacher = enrollment.classes.teacher_id === user.id;
    const isAdmin = userProfile?.role === 'institution_admin' && 
                   userProfile?.institution_id === enrollment.classes.institution_id;

    if (!isStudent && !isTeacher && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ enrollment });

  } catch (error) {
    console.error('Get enrollment error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch enrollment' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const enrollmentId = params.id;
    const body = await request.json();
    const { reason } = body;

    // Get enrollment details
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select(`
        *,
        classes (
          teacher_id,
          institution_id
        )
      `)
      .eq('id', enrollmentId)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }

    // Check if user has permission to drop this enrollment
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    const isStudent = enrollment.student_id === user.id;
    const isTeacher = enrollment.classes.teacher_id === user.id;
    const isAdmin = userProfile?.role === 'institution_admin' && 
                   userProfile?.institution_id === enrollment.classes.institution_id;

    if (!isStudent && !isTeacher && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const enrollmentManager = new EnrollmentManager();
    await enrollmentManager.dropStudent(
      enrollment.student_id, 
      enrollment.class_id, 
      reason,
      user.id
    );

    return NextResponse.json({
      success: true,
      message: 'Student dropped from class successfully'
    });

  } catch (error) {
    console.error('Drop enrollment error:', error);
    return NextResponse.json(
      { error: 'Failed to drop enrollment' },
      { status: 500 }
    );
  }
}