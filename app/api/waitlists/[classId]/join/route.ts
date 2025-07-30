import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WaitlistManager } from '@/lib/services/waitlist-manager';

export async function POST(
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
    const body = await request.json();
    const { priority = 0 } = body;

    // Check if class exists and has waitlist enabled
    const { data: classData } = await supabase
      .from('classes')
      .select('id, name, enrollment_config, waitlist_capacity')
      .eq('id', classId)
      .single();

    if (!classData) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    const config = classData.enrollment_config || {};
    if (!config.allowWaitlist) {
      return NextResponse.json(
        { error: 'Waitlist is not available for this class' },
        { status: 400 }
      );
    }

    const waitlistManager = new WaitlistManager();
    const waitlistEntry = await waitlistManager.addToWaitlist(user.id, classId, priority);

    // Get additional waitlist information
    const position = await waitlistManager.getWaitlistPosition(user.id, classId);
    const probability = await waitlistManager.estimateEnrollmentProbability(user.id, classId);

    return NextResponse.json({
      success: true,
      waitlistEntry,
      position,
      estimatedProbability: probability,
      message: `Successfully added to waitlist at position ${position}`
    });

  } catch (error) {
    console.error('Join waitlist error:', error);
    
    if (error instanceof Error && error.message.includes('already on the waitlist')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to join waitlist' },
      { status: 500 }
    );
  }
}