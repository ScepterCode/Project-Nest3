import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');
    const institutionId = searchParams.get('institutionId');
    const departmentId = searchParams.get('departmentId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Check user permissions
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    const isAdmin = userProfile?.role === 'institution_admin';
    const isDepartmentAdmin = userProfile?.role === 'department_admin';
    const isTeacher = userProfile?.role === 'teacher';

    if (!isAdmin && !isDepartmentAdmin && !isTeacher) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Build analytics query based on user permissions and filters
    let analyticsData: any = {};

    if (classId) {
      // Class-specific analytics
      const { data: classAnalytics } = await supabase
        .from('enrollment_statistics')
        .select('*')
        .eq('class_id', classId)
        .single();

      const { data: enrollmentTrends } = await supabase
        .from('enrollment_audit_log')
        .select('action, timestamp')
        .eq('class_id', classId)
        .gte('timestamp', startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .lte('timestamp', endDate || new Date().toISOString())
        .order('timestamp');

      analyticsData = {
        classId,
        statistics: classAnalytics,
        trends: enrollmentTrends,
        summary: {
          totalEnrollments: enrollmentTrends?.filter(e => e.action === 'enrolled').length || 0,
          totalDrops: enrollmentTrends?.filter(e => e.action === 'dropped').length || 0,
          totalWaitlisted: enrollmentTrends?.filter(e => e.action === 'waitlisted').length || 0
        }
      };
    } else {
      // Institution or department-wide analytics
      let query = supabase
        .from('classes')
        .select(`
          id,
          name,
          capacity,
          current_enrollment,
          enrollment_statistics (*)
        `);

      if (institutionId && isAdmin) {
        query = query.eq('institution_id', institutionId);
      } else if (userProfile?.institution_id) {
        query = query.eq('institution_id', userProfile.institution_id);
      }

      if (departmentId) {
        query = query.eq('department_id', departmentId);
      }

      if (isTeacher) {
        query = query.eq('teacher_id', user.id);
      }

      const { data: classes } = await query;

      // Calculate aggregate statistics
      const totalClasses = classes?.length || 0;
      const totalCapacity = classes?.reduce((sum, c) => sum + (c.capacity || 0), 0) || 0;
      const totalEnrolled = classes?.reduce((sum, c) => sum + (c.current_enrollment || 0), 0) || 0;
      const totalWaitlisted = classes?.reduce((sum, c) => {
        const stats = c.enrollment_statistics?.[0];
        return sum + (stats?.total_waitlisted || 0);
      }, 0) || 0;

      analyticsData = {
        summary: {
          totalClasses,
          totalCapacity,
          totalEnrolled,
          totalWaitlisted,
          utilizationRate: totalCapacity > 0 ? (totalEnrolled / totalCapacity) * 100 : 0,
          averageClassSize: totalClasses > 0 ? totalEnrolled / totalClasses : 0
        },
        classes: classes?.map(c => ({
          id: c.id,
          name: c.name,
          capacity: c.capacity,
          enrolled: c.current_enrollment,
          utilizationRate: c.capacity > 0 ? (c.current_enrollment / c.capacity) * 100 : 0,
          waitlisted: c.enrollment_statistics?.[0]?.total_waitlisted || 0
        }))
      };
    }

    return NextResponse.json({ analytics: analyticsData });

  } catch (error) {
    console.error('Enrollment analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch enrollment analytics' },
      { status: 500 }
    );
  }
}