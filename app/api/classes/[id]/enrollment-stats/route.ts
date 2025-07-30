import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ClassDiscoveryService } from '@/lib/services/class-discovery';

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

    // Check if user has permission to view enrollment statistics
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

    const classDiscoveryService = new ClassDiscoveryService();
    const statistics = await classDiscoveryService.getEnrollmentStatistics(classId);

    return NextResponse.json({ statistics });

  } catch (error) {
    console.error('Enrollment statistics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch enrollment statistics' },
      { status: 500 }
    );
  }
}