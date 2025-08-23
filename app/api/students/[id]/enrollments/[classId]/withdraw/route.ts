import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StudentEnrollmentService } from '@/lib/services/student-enrollment';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; classId: string } }
) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const studentId = params.id;
    const classId = params.classId;

    // Verify user can perform this action (either the student themselves or authorized admin)
    if (user.id !== studentId) {
      const { data: userProfile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!userProfile || !['admin', 'institution_admin', 'department_admin', 'teacher'].includes(userProfile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { reason } = await request.json();

    const enrollmentService = new StudentEnrollmentService();
    await enrollmentService.withdrawFromClass(studentId, classId, reason);

    return NextResponse.json({ 
      success: true, 
      message: 'Successfully withdrew from class' 
    });
  } catch (error) {
    console.error('Error withdrawing from class:', error);
    return NextResponse.json(
      { 
        error: 'Failed to withdraw from class',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}