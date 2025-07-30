import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enrollmentConfigService } from '@/lib/services/enrollment-config';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; prerequisiteId: string } }
) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const classId = params.id;
    const prerequisiteId = params.prerequisiteId;
    const body = await request.json();

    // Check if user has permission to modify prerequisites
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

    const prerequisite = await enrollmentConfigService.updatePrerequisite(
      prerequisiteId,
      body,
      user.id
    );

    return NextResponse.json({
      success: true,
      prerequisite
    });

  } catch (error) {
    console.error('Update prerequisite error:', error);
    return NextResponse.json(
      { error: 'Failed to update prerequisite' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; prerequisiteId: string } }
) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const classId = params.id;
    const prerequisiteId = params.prerequisiteId;

    // Check if user has permission to modify prerequisites
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

    await enrollmentConfigService.removePrerequisite(prerequisiteId, user.id);

    return NextResponse.json({
      success: true,
      message: 'Prerequisite removed successfully'
    });

  } catch (error) {
    console.error('Remove prerequisite error:', error);
    return NextResponse.json(
      { error: 'Failed to remove prerequisite' },
      { status: 500 }
    );
  }
}