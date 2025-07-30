import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WaitlistManager } from '@/lib/services/waitlist-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: { classId: string } }
) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const classId = params.classId;
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId') || user.id;

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

    const waitlistManager = new WaitlistManager();
    const waitlistInfo = await waitlistManager.getStudentWaitlistInfo(studentId, classId);

    if (!waitlistInfo.entry) {
      return NextResponse.json(
        { error: 'Student is not on the waitlist for this class' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      position: waitlistInfo.position,
      estimatedProbability: waitlistInfo.estimatedProbability,
      estimatedWaitTime: waitlistInfo.estimatedWaitTime,
      isNotified: waitlistInfo.isNotified,
      responseDeadline: waitlistInfo.responseDeadline,
      entry: waitlistInfo.entry
    });

  } catch (error) {
    console.error('Get waitlist position error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch waitlist position' },
      { status: 500 }
    );
  }
}