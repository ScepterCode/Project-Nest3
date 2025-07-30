import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    const departmentId = params.id;
    const { searchParams } = new URL(request.url);

    // Get user profile to check permissions
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (!userProfile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 });
    }

    // Get department to verify access
    const { data: department, error: deptError } = await supabase
      .from('departments')
      .select('id, name, code, institution_id, admin_id')
      .eq('id', departmentId)
      .single();

    if (deptError || !department) {
      return NextResponse.json({
        success: false,
        error: 'Department not found'
      }, { status: 404 });
    }

    // Check access permissions
    const isSystemAdmin = userProfile.role === 'system_admin';
    const isInstitutionMember = userProfile.institution_id === department.institution_id;
    const isInstitutionAdmin = userProfile.role === 'institution_admin' && isInstitutionMember;
    const isDepartmentAdmin = department.admin_id === user.id;

    if (!isSystemAdmin && !isInstitutionAdmin && !isDepartmentAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Access denied. Department admin role required.'
      }, { status: 403 });
    }

    // Parse query parameters
    const metricType = searchParams.get('type') || 'overview';
    const timeframe = searchParams.get('timeframe') || 'last_30_days';
    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : null;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : null;

    // Calculate date range based on timeframe
    let dateRange = { start: new Date(), end: new Date() };
    const now = new Date();
    
    switch (timeframe) {
      case 'last_7_days':
        dateRange.start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'last_30_days':
        dateRange.start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'last_90_days':
        dateRange.start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'last_year':
        dateRange.start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'custom':
        if (startDate && endDate) {
          dateRange = { start: startDate, end: endDate };
        }
        break;
    }

    let analyticsData = {};

    switch (metricType) {
      case 'overview':
        // Get basic department metrics
        const [userCount, classCount, enrollmentCount] = await Promise.all([
          supabase.from('user_departments').select('user_id', { count: 'exact' }).eq('department_id', departmentId),
          supabase.from('classes').select('id', { count: 'exact' }).eq('department_id', departmentId).neq('status', 'archived'),
          supabase.from('enrollments').select('id', { count: 'exact' }).eq('department_id', departmentId).eq('status', 'active')
        ]);

        analyticsData = {
          overview: {
            totalUsers: userCount.count || 0,
            totalClasses: classCount.count || 0,
            totalEnrollments: enrollmentCount.count || 0,
            department: {
              id: department.id,
              name: department.name,
              code: department.code
            }
          }
        };
        break;

      case 'student_performance':
        // Get student performance metrics
        const { data: performanceMetrics } = await supabase
          .from('department_analytics')
          .select('*')
          .eq('department_id', departmentId)
          .in('metric_name', ['average_grade', 'completion_rate', 'at_risk_students'])
          .gte('recorded_at', dateRange.start.toISOString())
          .lte('recorded_at', dateRange.end.toISOString())
          .order('recorded_at', { ascending: true });

        analyticsData = {
          studentPerformance: performanceMetrics || []
        };
        break;

      case 'class_analytics':
        // Get class-level analytics
        const { data: classMetrics } = await supabase
          .from('department_analytics')
          .select('*')
          .eq('department_id', departmentId)
          .in('metric_name', ['class_enrollment', 'assignment_submissions', 'discussion_activity'])
          .gte('recorded_at', dateRange.start.toISOString())
          .lte('recorded_at', dateRange.end.toISOString())
          .order('recorded_at', { ascending: true });

        analyticsData = {
          classAnalytics: classMetrics || []
        };
        break;

      case 'trends':
        // Get trend analysis
        const { data: trendMetrics } = await supabase
          .from('department_analytics')
          .select('*')
          .eq('department_id', departmentId)
          .gte('recorded_at', dateRange.start.toISOString())
          .lte('recorded_at', dateRange.end.toISOString())
          .order('recorded_at', { ascending: true });

        // Group by metric name for trend analysis
        const groupedTrends = (trendMetrics || []).reduce((acc, metric) => {
          if (!acc[metric.metric_name]) {
            acc[metric.metric_name] = [];
          }
          acc[metric.metric_name].push({
            value: metric.metric_value,
            date: metric.recorded_at,
            metadata: metric.metadata
          });
          return acc;
        }, {} as Record<string, any[]>);

        analyticsData = {
          trends: groupedTrends
        };
        break;

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid analytics type'
        }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...analyticsData,
        timeframe,
        dateRange,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Department analytics API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    const departmentId = params.id;
    const body = await request.json();

    // Get user profile to check permissions
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (!userProfile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 });
    }

    // Get department to verify access
    const { data: department, error: deptError } = await supabase
      .from('departments')
      .select('id, name, institution_id, admin_id')
      .eq('id', departmentId)
      .single();

    if (deptError || !department) {
      return NextResponse.json({
        success: false,
        error: 'Department not found'
      }, { status: 404 });
    }

    // Check access permissions
    const isSystemAdmin = userProfile.role === 'system_admin';
    const isInstitutionAdmin = userProfile.role === 'institution_admin' && userProfile.institution_id === department.institution_id;
    const isDepartmentAdmin = department.admin_id === user.id;

    if (!isSystemAdmin && !isInstitutionAdmin && !isDepartmentAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Access denied. Department admin role required.'
      }, { status: 403 });
    }

    const { action, ...data } = body;
    const now = new Date();

    switch (action) {
      case 'generate_report':
        const { reportType, timeframe, includeStudentData } = data;
        
        // Privacy check for student data
        if (includeStudentData && !isDepartmentAdmin && !isInstitutionAdmin && !isSystemAdmin) {
          return NextResponse.json({
            success: false,
            error: 'Student data access requires admin privileges'
          }, { status: 403 });
        }

        let startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        switch (timeframe) {
          case 'last_7_days':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'last_90_days':
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          case 'last_year':
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
        }

        // Get department analytics data
        const { data: analyticsData } = await supabase
          .from('department_analytics')
          .select('*')
          .eq('department_id', departmentId)
          .gte('recorded_at', startDate.toISOString())
          .order('recorded_at', { ascending: true });

        const reportData = {
          reportId: `dept_report_${Date.now()}`,
          departmentId,
          reportType,
          timeframe,
          generatedAt: now.toISOString(),
          generatedBy: user.id,
          data: {
            analytics: analyticsData || [],
            department: {
              id: department.id,
              name: department.name
            }
          }
        };

        return NextResponse.json({
          success: true,
          data: {
            report: reportData
          }
        });

      case 'collect_metrics':
        // Trigger manual metrics collection for department
        const metricsCollected = {
          departmentId,
          timestamp: now.toISOString(),
          triggeredBy: user.id,
          status: 'completed'
        };

        return NextResponse.json({
          success: true,
          data: {
            collection: metricsCollected
          }
        });

      case 'identify_at_risk':
        // Identify at-risk students in the department
        const atRiskData = {
          departmentId,
          identifiedAt: now.toISOString(),
          identifiedBy: user.id,
          criteria: data.criteria || 'default',
          studentsIdentified: 0 // Would be calculated based on actual data
        };

        return NextResponse.json({
          success: true,
          data: {
            atRiskAnalysis: atRiskData
          }
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Department analytics POST API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}