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

    // Check if user has permission to process waitlist
    const { data: classData } = await supabase
      .from('classes')
      .select('teacher_id, institution_id')
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

    const waitlistManager = new WaitlistManager();
    await waitlistManager.processWaitlist(classId);

    return NextResponse.json({
      success: true,
      message: 'Waitlist processed successfully'
    });

  } catch (error) {
    console.error('Process waitlist error:', error);
    return NextResponse.json(
      { error: 'Failed to process waitlist' },
      { status: 500 }
    );
  }
}