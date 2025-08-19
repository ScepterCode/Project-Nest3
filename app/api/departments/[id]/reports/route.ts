import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DepartmentAnalyticsService } from '@/lib/services/department-analytics';

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
    const isInstitutionAdmin = userProfile.role === 'institution_admin' && userProfile.institution_id === department.institution_id;
    const isDepartmentAdmin = department.admin_id === user.id;

    if (!isSystemAdmin && !isInstitutionAdmin && !isDepartmentAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Access denied. Department admin role required.'
      }, { status: 403 });
    }

    // Parse query parameters
    const reportType = searchParams.get('type') || 'summary';
    const format = searchParams.get('format') || 'json';
    const timeframe = searchParams.get('timeframe') || 'last_30_days';
    const includeStudentData = searchParams.get('includeStudentData') === 'true';

    // Privacy check for student data
    if (includeStudentData && !isDepartmentAdmin && !isInstitutionAdmin && !isSystemAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Student data access requires admin privileges'
      }, { status: 403 });
    }

    const analyticsService = new DepartmentAnalytics();
    
    let reportData = {};

    switch (reportType) {
      case 'summary':
        reportData = await analyticsService.generateSummaryReport(departmentId, {
          timeframe,
          includeStudentData
        });
        break;

      case 'student_performance':
        reportData = await analyticsService.generateStudentPerformanceReport(departmentId, {
          timeframe,
          includeStudentData,
          anonymize: !includeStudentData
        });
        break;

      case 'class_analytics':
        reportData = await analyticsService.generateClassAnalyticsReport(departmentId, {
          timeframe,
          includeDetails: true
        });
        break;

      case 'at_risk_students':
        if (!isDepartmentAdmin && !isInstitutionAdmin && !isSystemAdmin) {
          return NextResponse.json({
            success: false,
            error: 'At-risk student reports require admin privileges'
          }, { status: 403 });
        }
        
        reportData = await analyticsService.generateAtRiskStudentsReport(departmentId, {
          timeframe,
          criteria: searchParams.get('criteria') || 'default'
        });
        break;

      case 'instructor_performance':
        reportData = await analyticsService.generateInstructorPerformanceReport(departmentId, {
          timeframe,
          includeDetails: true
        });
        break;

      case 'resource_utilization':
        reportData = await analyticsService.generateResourceUtilizationReport(departmentId, {
          timeframe,
          includeDetails: true
        });
        break;

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid report type'
        }, { status: 400 });
    }

    const response = {
      success: true,
      data: {
        report: {
          id: `dept_report_${Date.now()}`,
          type: reportType,
          departmentId,
          department: {
            id: department.id,
            name: department.name,
            code: department.code
          },
          timeframe,
          format,
          generatedAt: new Date().toISOString(),
          generatedBy: user.id,
          includeStudentData,
          ...reportData
        }
      }
    };

    // Handle different response formats
    if (format === 'csv') {
      const csvData = await analyticsService.convertToCSV(reportData);
      return new NextResponse(csvData, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="department_${departmentId}_${reportType}_${timeframe}.csv"`
        }
      });
    } else if (format === 'pdf') {
      const pdfBuffer = await analyticsService.generatePDFReport(reportData, {
        title: `${department.name} - ${reportType} Report`,
        timeframe
      });
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="department_${departmentId}_${reportType}_${timeframe}.pdf"`
        }
      });
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Department reports API error:', error);
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
    const analyticsService = new DepartmentAnalytics();

    switch (action) {
      case 'schedule_report':
        const {
          reportType,
          schedule,
          recipients,
          format,
          includeStudentData
        } = data;

        const scheduledReport = await analyticsService.scheduleReport({
          departmentId,
          reportType,
          schedule,
          recipients,
          format,
          includeStudentData,
          scheduledBy: user.id
        });

        return NextResponse.json({
          success: true,
          data: {
            scheduledReport
          }
        });

      case 'generate_intervention_report':
        if (!isDepartmentAdmin && !isInstitutionAdmin && !isSystemAdmin) {
          return NextResponse.json({
            success: false,
            error: 'Intervention reports require admin privileges'
          }, { status: 403 });
        }

        const {
          interventionType,
          studentCriteria,
          timeframe
        } = data;

        const interventionReport = await analyticsService.generateInterventionReport({
          departmentId,
          interventionType,
          studentCriteria,
          timeframe,
          generatedBy: user.id
        });

        return NextResponse.json({
          success: true,
          data: {
            report: interventionReport
          }
        });

      case 'analyze_trends':
        const {
          metrics,
          comparisonPeriod,
          granularity
        } = data;

        const trendAnalysis = await analyticsService.analyzeTrends({
          departmentId,
          metrics,
          comparisonPeriod,
          granularity,
          analyzedBy: user.id
        });

        return NextResponse.json({
          success: true,
          data: {
            analysis: trendAnalysis
          }
        });

      case 'benchmark_performance':
        const {
          benchmarkType,
          comparisonGroup,
          metrics: benchmarkMetrics
        } = data;

        const benchmarkReport = await analyticsService.benchmarkPerformance({
          departmentId,
          benchmarkType,
          comparisonGroup,
          metrics: benchmarkMetrics,
          generatedBy: user.id
        });

        return NextResponse.json({
          success: true,
          data: {
            benchmark: benchmarkReport
          }
        });

      case 'export_gradebook_data':
        if (!isDepartmentAdmin && !isInstitutionAdmin && !isSystemAdmin) {
          return NextResponse.json({
            success: false,
            error: 'Gradebook export requires admin privileges'
          }, { status: 403 });
        }

        const {
          classIds,
          includeGrades,
          includeComments,
          format: exportFormat
        } = data;

        const gradebookExport = await analyticsService.exportGradebookData({
          departmentId,
          classIds,
          includeGrades,
          includeComments,
          format: exportFormat,
          exportedBy: user.id
        });

        return NextResponse.json({
          success: true,
          data: {
            export: gradebookExport,
            downloadUrl: `/api/departments/${departmentId}/reports/download/${gradebookExport.exportId}`
          }
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Department reports POST API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}