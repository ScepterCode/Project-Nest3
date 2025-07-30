import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EnrollmentManager } from '@/lib/services/enrollment-manager';

export async function PUT(
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

    const requestId = params.id;

    // Get the enrollment request to check permissions
    const { data: enrollmentRequest } = await supabase
      .from('enrollment_requests')
      .select(`
        *,
        classes (
          teacher_id,
          institution_id
        )
      `)
      .eq('id', requestId)
      .single();

    if (!enrollmentRequest) {
      return NextResponse.json({ error: 'Enrollment request not found' }, { status: 404 });
    }

    // Check if user has permission to approve this request
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    const isTeacher = enrollmentRequest.classes.teacher_id === user.id;
    const isAdmin = userProfile?.role === 'institution_admin' && 
                   userProfile?.institution_id === enrollmentRequest.classes.institution_id;

    if (!isTeacher && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const enrollmentManager = new EnrollmentManager();
    await enrollmentManager.approveEnrollment(requestId, user.id);

    return NextResponse.json({
      success: true,
      message: 'Enrollment request approved successfully'
    });

  } catch (error) {
    console.error('Approve enrollment error:', error);
    return NextResponse.json(
      { error: 'Failed to approve enrollment request' },
      { status: 500 }
    );
  }
}