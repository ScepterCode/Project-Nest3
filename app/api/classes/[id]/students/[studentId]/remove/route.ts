import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { TeacherRosterService } from '@/lib/services/teacher-roster';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; studentId: string } }
) {
  try {
    const supabase = createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const classId = params.id;
    const studentId = params.studentId;
    const { reason } = await request.json();

    if (!reason) {
      return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
    }

    const rosterService = new TeacherRosterService();
    await rosterService.removeStudentFromRoster(studentId, classId, user.id, reason);

    return NextResponse.json({ 
      success: true, 
      message: 'Student removed from class successfully' 
    });
  } catch (error) {
    console.error('Error removing student from class:', error);
    return NextResponse.json(
      { 
        error: 'Failed to remove student from class',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}