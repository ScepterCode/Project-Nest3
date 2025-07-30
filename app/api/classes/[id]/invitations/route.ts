import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';

export async function GET(
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

    const classId = params.id;

    // Check if user has permission to view invitations
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

    if (!isTeacher && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get class invitations
    const { data: invitations } = await supabase
      .from('class_invitations')
      .select(`
        *,
        users!class_invitations_student_id_fkey (
          first_name,
          last_name,
          email
        )
      `)
      .eq('class_id', classId)
      .order('created_at', { ascending: false });

    return NextResponse.json({ invitations });

  } catch (error) {
    console.error('Get invitations error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invitations' },
      { status: 500 }
    );
  }
}

export async function POST(
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

    const classId = params.id;
    const body = await request.json();

    // Check if user has permission to send invitations
    const { data: classData } = await supabase
      .from('classes')
      .select('teacher_id, institution_id, name, enrollment_type')
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

    if (!isTeacher && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { studentIds, emails, message, expiresInDays = 7 } = body;

    if ((!studentIds || studentIds.length === 0) && (!emails || emails.length === 0)) {
      return NextResponse.json(
        { error: 'Either student IDs or email addresses are required' },
        { status: 400 }
      );
    }

    const invitations = [];
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    // Create invitations for student IDs
    if (studentIds && studentIds.length > 0) {
      for (const studentId of studentIds) {
        const token = randomBytes(32).toString('hex');
        
        const { data: invitation, error } = await supabase
          .from('class_invitations')
          .insert({
            class_id: classId,
            student_id: studentId,
            invited_by: user.id,
            token,
            expires_at: expiresAt.toISOString(),
            message
          })
          .select()
          .single();

        if (!error && invitation) {
          invitations.push(invitation);
        }
      }
    }

    // Create invitations for email addresses
    if (emails && emails.length > 0) {
      for (const email of emails) {
        const token = randomBytes(32).toString('hex');
        
        const { data: invitation, error } = await supabase
          .from('class_invitations')
          .insert({
            class_id: classId,
            email,
            invited_by: user.id,
            token,
            expires_at: expiresAt.toISOString(),
            message
          })
          .select()
          .single();

        if (!error && invitation) {
          invitations.push(invitation);
        }
      }
    }

    // TODO: Send invitation emails (would integrate with notification service)
    console.log(`Sent ${invitations.length} invitations for class ${classData.name}`);

    return NextResponse.json({
      success: true,
      invitations,
      message: `Successfully sent ${invitations.length} invitations`
    });

  } catch (error) {
    console.error('Send invitations error:', error);
    return NextResponse.json(
      { error: 'Failed to send invitations' },
      { status: 500 }
    );
  }
}