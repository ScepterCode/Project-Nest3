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

    const waitlistEntryId = params.id;

    const rosterService = new TeacherRosterService();
    await rosterService.promoteFromWaitlist(waitlistEntryId, user.id);

    return NextResponse.json({ 
      success: true, 
      message: 'Student promoted from waitlist successfully' 
    });
  } catch (error) {
    console.error('Error promoting student from waitlist:', error);
    return NextResponse.json(
      { 
        error: 'Failed to promote student from waitlist',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}