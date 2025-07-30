import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { TeacherRosterService } from '@/lib/services/teacher-roster';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const classId = params.id;
    const { requestIds } = await request.json();

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return NextResponse.json({ error: 'Request IDs are required' }, { status: 400 });
    }

    // Verify user is the teacher of this class
    const { data: classData } = await supabase
      .from('classes')
      .select('teacher_id')
      .eq('id', classId)
      .single();

    if (!classData || classData.teacher_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rosterService = new TeacherRosterService();
    const result = await rosterService.batchApproveRequests(requestIds, user.id);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error batch approving requests:', error);
    return NextResponse.json(
      { 
        error: 'Failed to batch approve requests',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}