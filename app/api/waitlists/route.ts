import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WaitlistManager } from '@/lib/services/waitlist-manager';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { classId, priority = 0 } = body;

    if (!classId) {
      return NextResponse.json(
        { error: 'Class ID is required' },
        { status: 400 }
      );
    }

    const waitlistManager = new WaitlistManager();
    const waitlistEntry = await waitlistManager.addToWaitlist(user.id, classId, priority);

    return NextResponse.json({
      success: true,
      waitlistEntry,
      message: 'Successfully added to waitlist'
    });

  } catch (error) {
    console.error('Waitlist join error:', error);
    
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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId') || user.id;
    const classId = searchParams.get('classId');

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

    let query = supabase
      .from('waitlist_entries')
      .select(`
        *,
        classes (
          id,
          name,
          code,
          users!classes_teacher_id_fkey (
            first_name,
            last_name
          ),
          departments (
            name
          )
        )
      `)
      .eq('student_id', studentId);

    if (classId) {
      query = query.eq('class_id', classId);
    }

    const { data: waitlistEntries, error } = await query.order('added_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ waitlistEntries });

  } catch (error) {
    console.error('Get waitlist entries error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch waitlist entries' },
      { status: 500 }
    );
  }
}