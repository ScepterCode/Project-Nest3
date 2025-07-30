import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EnrollmentManager } from '@/lib/services/enrollment-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = await createClient();
    
    const token = params.token;

    // Get invitation details
    const { data: invitation } = await supabase
      .from('class_invitations')
      .select(`
        *,
        classes (
          id,
          name,
          code,
          description,
          users!classes_teacher_id_fkey (
            first_name,
            last_name
          ),
          departments (
            name
          )
        )
      `)
      .eq('token', token)
      .single();

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    // Check if invitation is expired
    if (new Date() > new Date(invitation.expires_at)) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 });
    }

    // Check if invitation has already been accepted
    if (invitation.accepted_at) {
      return NextResponse.json({ error: 'Invitation has already been accepted' }, { status: 409 });
    }

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        classId: invitation.class_id,
        className: invitation.classes.name,
        classCode: invitation.classes.code,
        classDescription: invitation.classes.description,
        teacherName: `${invitation.classes.users.first_name} ${invitation.classes.users.last_name}`,
        departmentName: invitation.classes.departments?.name,
        message: invitation.message,
        expiresAt: invitation.expires_at
      }
    });

  } catch (error) {
    console.error('Get invitation error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invitation details' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = params.token;

    // Get invitation details
    const { data: invitation } = await supabase
      .from('class_invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    // Check if invitation is expired
    if (new Date() > new Date(invitation.expires_at)) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 });
    }

    // Check if invitation has already been accepted
    if (invitation.accepted_at) {
      return NextResponse.json({ error: 'Invitation has already been accepted' }, { status: 409 });
    }

    // Verify the invitation is for this user (if student_id is specified)
    if (invitation.student_id && invitation.student_id !== user.id) {
      return NextResponse.json({ error: 'This invitation is not for you' }, { status: 403 });
    }

    // If invitation is by email, verify the user's email matches
    if (invitation.email) {
      const { data: userProfile } = await supabase
        .from('users')
        .select('email')
        .eq('id', user.id)
        .single();

      if (userProfile?.email !== invitation.email) {
        return NextResponse.json({ error: 'This invitation is not for your email address' }, { status: 403 });
      }
    }

    // Mark invitation as accepted
    const { error: updateError } = await supabase
      .from('class_invitations')
      .update({
        accepted_at: new Date().toISOString(),
        student_id: user.id // Set student_id if it was an email invitation
      })
      .eq('id', invitation.id);

    if (updateError) {
      throw updateError;
    }

    // Enroll the student in the class
    const enrollmentManager = new EnrollmentManager();
    const result = await enrollmentManager.requestEnrollment(user.id, invitation.class_id);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        message: 'Invitation accepted but enrollment failed',
        enrollmentResult: result
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Invitation accepted and enrolled successfully',
      enrollmentResult: result
    });

  } catch (error) {
    console.error('Accept invitation error:', error);
    return NextResponse.json(
      { error: 'Failed to accept invitation' },
      { status: 500 }
    );
  }
}