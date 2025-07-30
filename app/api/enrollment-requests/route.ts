import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');
    const status = searchParams.get('status');
    const studentId = searchParams.get('studentId');

    // Get user profile to check permissions
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    let query = supabase
      .from('enrollment_requests')
      .select(`
        *,
        users!enrollment_requests_student_id_fkey (
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
      `);

    // Apply filters based on user role and permissions
    if (userProfile?.role === 'student') {
      // Students can only see their own requests
      query = query.eq('student_id', user.id);
    } else if (userProfile?.role === 'teacher') {
      // Teachers can see requests for their classes
      const { data: teacherClasses } = await supabase
        .from('classes')
        .select('id')
        .eq('teacher_id', user.id);
      
      const classIds = teacherClasses?.map(c => c.id) || [];
      if (classIds.length > 0) {
        query = query.in('class_id', classIds);
      } else {
        // Teacher has no classes, return empty result
        return NextResponse.json({ enrollmentRequests: [] });
      }
    } else if (userProfile?.role === 'institution_admin') {
      // Institution admins can see requests for classes in their institution
      const { data: institutionClasses } = await supabase
        .from('classes')
        .select('id')
        .eq('institution_id', userProfile.institution_id);
      
      const classIds = institutionClasses?.map(c => c.id) || [];
      if (classIds.length > 0) {
        query = query.in('class_id', classIds);
      } else {
        return NextResponse.json({ enrollmentRequests: [] });
      }
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Apply additional filters
    if (classId) {
      query = query.eq('class_id', classId);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (studentId && userProfile?.role !== 'student') {
      query = query.eq('student_id', studentId);
    }

    const { data: enrollmentRequests, error } = await query
      .order('requested_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ enrollmentRequests });

  } catch (error) {
    console.error('Get enrollment requests error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch enrollment requests' },
      { status: 500 }
    );
  }
}