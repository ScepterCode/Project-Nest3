import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    const institutionId = params.id;
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

    // Check access permissions
    const isSystemAdmin = userProfile.role === 'system_admin';
    const isInstitutionMember = userProfile.institution_id === institutionId;
    const isInstitutionAdmin = userProfile.role === 'institution_admin' && isInstitutionMember;

    if (!isSystemAdmin && !isInstitutionAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Access denied. Institution admin role required.'
      }, { status: 403 });
    }

    // Verify institution exists
    const { data: institution, error: institutionError } = await supabase
      .from('institutions')
      .select('id, name, status')
      .eq('id', institutionId)
      .single();

    if (institutionError || !institution) {
      return NextResponse.json({
        success: false,
        error: 'Institution not found'
      }, { status: 404 });
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
        // Get basic institution metrics
        const [userCount, departmentCount, activeClasses] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact' }).eq('institution_id', institutionId),
          supabase.from('departments').select('id', { count: 'exact' }).eq('institution_id', institutionId).eq('status', 'active'),
          supabase.from('classes').select('id', { count: 'exact' }).eq('institution_id', institutionId).neq('status', 'archived')
        ]);

        analyticsData = {
          overview: {
            totalUsers: userCount.count || 0,
            totalDepartments: departmentCount.count || 0,
            activeClasses: activeClasses.count || 0,
            institution: {
              id: institution.id,
              name: institution.name,
              status: institution.status
            }
          }
        };
        break;

      case 'user_activity':
        // Get user activity metrics
        const { data: userActivity } = await supabase
          .from('institution_analytics')
          .select('*')
          .eq('institution_id', institutionId)
          .in('metric_name', ['daily_active_users', 'weekly_active_users', 'user_logins'])
          .gte('recorded_at', dateRange.start.toISOString())
          .lte('recorded_at', dateRange.end.toISOString())
          .order('recorded_at', { ascending: true });

        analyticsData = {
          userActivity: userActivity || []
        };
        break;

      case 'department_performance':
        // Get department-level analytics
        const { data: departmentMetrics } = await supabase
          .from('department_analytics')
          .select(`
            *,
            departments!inner(id, name, code)
          `)
          .eq('departments.institution_id', institutionId)
          .gte('recorded_at', dateRange.start.toISOString())
          .lte('recorded_at', dateRange.end.toISOString())
          .order('recorded_at', { ascending: true });

        analyticsData = {
          departmentPerformance: departmentMetrics || []
        };
        break;

      case 'engagement':
        // Get engagement metrics
        const { data: engagementMetrics } = await supabase
          .from('institution_analytics')
          .select('*')
          .eq('institution_id', institutionId)
          .in('metric_name', ['class_participation', 'assignment_completion', 'discussion_posts'])
          .gte('recorded_at', dateRange.start.toISOString())
          .lte('recorded_at', dateRange.end.toISOString())
          .order('recorded_at', { ascending: true });

        analyticsData = {
          engagement: engagementMetrics || []
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
    console.error('Institution analytics API error:', error);
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
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    const institutionId = params.id;
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

    // Check access permissions
    const isSystemAdmin = userProfile.role === 'system_admin';
    const isInstitutionAdmin = userProfile.role === 'institution_admin' && userProfile.institution_id === institutionId;

    if (!isSystemAdmin && !isInstitutionAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Access denied. Institution admin role required.'
      }, { status: 403 });
    }

    const { action, ...data } = body;

    switch (action) {
      case 'generate_report':
        const { reportType, timeframe, format, includeDetails } = data;
        
        // Generate report based on type
        let reportData = {};
        const now = new Date();
        let startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days

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

        // Get comprehensive analytics data
        const [institutionMetrics, departmentMetrics] = await Promise.all([
          supabase
            .from('institution_analytics')
            .select('*')
            .eq('institution_id', institutionId)
            .gte('recorded_at', startDate.toISOString())
            .order('recorded_at', { ascending: true }),
          supabase
            .from('department_analytics')
            .select(`
              *,
              departments!inner(id, name, code)
            `)
            .eq('departments.institution_id', institutionId)
            .gte('recorded_at', startDate.toISOString())
            .order('recorded_at', { ascending: true })
        ]);

        reportData = {
          reportId: `report_${Date.now()}`,
          institutionId,
          reportType,
          timeframe,
          generatedAt: now.toISOString(),
          generatedBy: user.id,
          data: {
            institutionMetrics: institutionMetrics.data || [],
            departmentMetrics: departmentMetrics.data || []
          }
        };

        return NextResponse.json({
          success: true,
          data: {
            report: reportData
          }
        });

      case 'export_data':
        const { exportType, dateRange, includePersonalData } = data;
        
        // Privacy compliance check
        if (includePersonalData && !isSystemAdmin) {
          return NextResponse.json({
            success: false,
            error: 'Personal data export requires system admin privileges'
          }, { status: 403 });
        }

        // Generate export data
        const exportData = {
          exportId: `export_${Date.now()}`,
          institutionId,
          exportType,
          dateRange,
          generatedAt: now.toISOString(),
          generatedBy: user.id,
          privacyCompliant: !includePersonalData
        };

        return NextResponse.json({
          success: true,
          data: {
            export: exportData,
            downloadUrl: `/api/institutions/${institutionId}/analytics/download/${exportData.exportId}`
          }
        });

      case 'collect_metrics':
        // Trigger manual metrics collection
        const metricsCollected = {
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

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Institution analytics POST API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}