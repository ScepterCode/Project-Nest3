import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EnrollmentManager } from '@/lib/services/enrollment-manager';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { studentIds, classId } = body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json(
        { error: 'Student IDs array is required and cannot be empty' },
        { status: 400 }
      );
    }

    if (!classId) {
      return NextResponse.json(
        { error: 'Class ID is required' },
        { status: 400 }
      );
    }

    // Check if user has permission to perform bulk enrollment
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

    const enrollmentManager = new EnrollmentManager();
    const result = await enrollmentManager.bulkEnroll(studentIds, classId, user.id);

    return NextResponse.json({
      success: true,
      result
    });

  } catch (error) {
    console.error('Bulk enrollment error:', error);
    return NextResponse.json(
      { error: 'Failed to process bulk enrollment' },
      { status: 500 }
    );
  }
}