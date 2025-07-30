import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enrollmentConfigService } from '@/lib/services/enrollment-config';
import { EnrollmentType } from '@/lib/types/enrollment';

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
    const config = await enrollmentConfigService.getClassConfig(classId);

    if (!config) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    return NextResponse.json({ config });

  } catch (error) {
    console.error('Get enrollment config error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch enrollment configuration' },
      { status: 500 }
    );
  }
}

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

    const classId = params.id;
    const body = await request.json();

    // Check if user has permission to modify class configuration
    const { data: classData } = await supabase
      .from('classes')
      .select('teacher_id, institution_id')
      .eq('id', classId)
      .single();

    if (!classData) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    const isTeacher = classData.teacher_id === user.id;
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    const isAdmin = userProfile?.role === 'institution_admin' && 
                   userProfile?.institution_id === classData.institution_id;

    if (!isTeacher && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validate and update configuration
    const updates = {
      enrollmentType: body.enrollmentType as EnrollmentType,
      capacity: body.capacity,
      waitlistCapacity: body.waitlistCapacity,
      enrollmentStart: body.enrollmentStart ? new Date(body.enrollmentStart) : null,
      enrollmentEnd: body.enrollmentEnd ? new Date(body.enrollmentEnd) : null,
      dropDeadline: body.dropDeadline ? new Date(body.dropDeadline) : null,
      withdrawDeadline: body.withdrawDeadline ? new Date(body.withdrawDeadline) : null,
      autoApprove: body.autoApprove,
      requiresJustification: body.requiresJustification,
      allowWaitlist: body.allowWaitlist,
      maxWaitlistPosition: body.maxWaitlistPosition,
      notificationSettings: body.notificationSettings
    };

    const updatedConfig = await enrollmentConfigService.updateClassConfig(
      classId,
      updates,
      user.id
    );

    return NextResponse.json({ config: updatedConfig });

  } catch (error) {
    console.error('Error updating enrollment configuration:', error);
    
    if (error instanceof Error && error.message.includes('validation failed')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}