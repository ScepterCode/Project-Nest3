import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    // Check if user has permission to view roster
    const { data: classData } = await supabase
      .from('classes')
      .select('teacher_id, institution_id, name, code')
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
    const isDepartmentAdmin = userProfile?.role === 'department_admin';

    if (!isTeacher && !isAdmin && !isDepartmentAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get enrolled students
    const { data: enrolledStudents } = await supabase
      .from('enrollments')
      .select(`
        *,
        users!enrollments_student_id_fkey (
          id,
          first_name,
          last_name,
          email,
          student_id,
          year,
          major
        )
      `)
      .eq('class_id', classId)
      .eq('status', 'enrolled')
      .order('enrolled_at');

    // Get pending enrollment requests
    const { data: pendingRequests } = await supabase
      .from('enrollment_requests')
      .select(`
        *,
        users!enrollment_requests_student_id_fkey (
          id,
          first_name,
          last_name,
          email,
          student_id,
          year,
          major
        )
      `)
      .eq('class_id', classId)
      .eq('status', 'pending')
      .order('requested_at');

    // Get waitlisted students
    const { data: waitlistedStudents } = await supabase
      .from('waitlist_entries')
      .select(`
        *,
        users!waitlist_entries_student_id_fkey (
          id,
          first_name,
          last_name,
          email,
          student_id,
          year,
          major
        )
      `)
      .eq('class_id', classId)
      .order('position');

    // Get class statistics
    const { data: statistics } = await supabase
      .from('enrollment_statistics')
      .select('*')
      .eq('class_id', classId)
      .single();

    const roster = {
      class: {
        id: classId,
        name: classData.name,
        code: classData.code
      },
      enrolledStudents: enrolledStudents?.map(enrollment => ({
        enrollment,
        student: enrollment.users
      })) || [],
      pendingRequests: pendingRequests?.map(request => ({
        request,
        student: request.users
      })) || [],
      waitlistedStudents: waitlistedStudents?.map(entry => ({
        entry,
        student: entry.users
      })) || [],
      statistics: {
        totalEnrolled: enrolledStudents?.length || 0,
        totalPending: pendingRequests?.length || 0,
        totalWaitlisted: waitlistedStudents?.length || 0,
        capacityUtilization: statistics?.capacity_utilization || 0,
        enrollmentTrend: statistics?.enrollment_trend || 'stable'
      }
    };

    return NextResponse.json({ roster });

  } catch (error) {
    console.error('Get roster error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch class roster' },
      { status: 500 }
    );
  }
}