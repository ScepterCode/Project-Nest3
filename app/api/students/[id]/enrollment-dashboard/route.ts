import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StudentEnrollmentService } from '@/lib/services/student-enrollment';

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

    // Verify user can access this student's data (either the student themselves or authorized admin)
    const studentId = params.id;
    if (user.id !== studentId) {
      // Check if user has admin privileges
      const { data: userProfile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!userProfile || !['admin', 'institution_admin', 'department_admin'].includes(userProfile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const enrollmentService = new StudentEnrollmentService();
    const dashboardData = await enrollmentService.getStudentEnrollmentDashboard(studentId);

    return NextResponse.json(dashboardData);
  } catch (error) {
    console.error('Error fetching student enrollment dashboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch enrollment dashboard' },
      { status: 500 }
    );
  }
}