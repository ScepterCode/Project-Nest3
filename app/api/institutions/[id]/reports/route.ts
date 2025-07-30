import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { InstitutionAnalyticsService } from '@/lib/services/institution-analytics';

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
    const isInstitutionAdmin = userProfile.role === 'institution_admin' && userProfile.institution_id === institutionId;

    if (!isSystemAdmin && !isInstitutionAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Access denied. Institution admin role required.'
      }, { status: 403 });
    }

    // Parse query parameters
    const reportType = searchParams.get('type') || 'summary';
    const format = searchParams.get('format') || 'json';
    const timeframe = searchParams.get('timeframe') || 'last_30_days';
    const includeDetails = searchParams.get('includeDetails') === 'true';

    // Validate institution exists
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

    const analyticsService = new InstitutionAnalytics();
    
    let reportData = {};

    switch (reportType) {
      case 'summary':
        reportData = await analyticsService.generateSummaryReport(institutionId, {
          timeframe,
          includeDetails
        });
        break;

      case 'user_activity':
        reportData = await analyticsService.generateUserActivityReport(institutionId, {
          timeframe,
          includeDetails
        });
        break;

      case 'department_performance':
        reportData = await analyticsService.generateDepartmentPerformanceReport(institutionId, {
          timeframe,
          includeDetails
        });
        break;

      case 'enrollment_trends':
        reportData = await analyticsService.generateEnrollmentTrendsReport(institutionId, {
          timeframe,
          includeDetails
        });
        break;

      case 'compliance':
        // Only system admins can generate compliance reports
        if (!isSystemAdmin) {
          return NextResponse.json({
            success: false,
            error: 'Compliance reports require system admin privileges'
          }, { status: 403 });
        }
        reportData = await analyticsService.generateComplianceReport(institutionId, {
          timeframe,
          includeDetails
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
          id: `report_${Date.now()}`,
          type: reportType,
          institutionId,
          institution: {
            id: institution.id,
            name: institution.name
          },
          timeframe,
          format,
          generatedAt: new Date().toISOString(),
          generatedBy: user.id,
          ...reportData
        }
      }
    };

    // Handle different response formats
    if (format === 'csv') {
      // Convert to CSV format
      const csvData = await analyticsService.convertToCSV(reportData);
      return new NextResponse(csvData, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="institution_${institutionId}_${reportType}_${timeframe}.csv"`
        }
      });
    } else if (format === 'pdf') {
      // Generate PDF report
      const pdfBuffer = await analyticsService.generatePDFReport(reportData, {
        title: `${institution.name} - ${reportType} Report`,
        timeframe
      });
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="institution_${institutionId}_${reportType}_${timeframe}.pdf"`
        }
      });
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Institution reports API error:', error);
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
    const analyticsService = new InstitutionAnalytics();

    switch (action) {
      case 'schedule_report':
        const {
          reportType,
          schedule,
          recipients,
          format,
          includeDetails
        } = data;

        const scheduledReport = await analyticsService.scheduleReport({
          institutionId,
          reportType,
          schedule, // e.g., 'weekly', 'monthly'
          recipients,
          format,
          includeDetails,
          scheduledBy: user.id
        });

        return NextResponse.json({
          success: true,
          data: {
            scheduledReport
          }
        });

      case 'generate_custom_report':
        const {
          metrics,
          filters,
          groupBy,
          timeRange,
          format: customFormat
        } = data;

        const customReport = await analyticsService.generateCustomReport({
          institutionId,
          metrics,
          filters,
          groupBy,
          timeRange,
          format: customFormat,
          generatedBy: user.id
        });

        return NextResponse.json({
          success: true,
          data: {
            report: customReport
          }
        });

      case 'export_raw_data':
        // Only system admins can export raw data
        if (!isSystemAdmin) {
          return NextResponse.json({
            success: false,
            error: 'Raw data export requires system admin privileges'
          }, { status: 403 });
        }

        const {
          tables,
          dateRange,
          anonymize
        } = data;

        const exportResult = await analyticsService.exportRawData({
          institutionId,
          tables,
          dateRange,
          anonymize,
          exportedBy: user.id
        });

        return NextResponse.json({
          success: true,
          data: {
            export: exportResult,
            downloadUrl: `/api/institutions/${institutionId}/reports/download/${exportResult.exportId}`
          }
        });

      case 'compare_institutions':
        // Only system admins can compare institutions
        if (!isSystemAdmin) {
          return NextResponse.json({
            success: false,
            error: 'Institution comparison requires system admin privileges'
          }, { status: 403 });
        }

        const {
          compareWith,
          metrics: compareMetrics,
          timeframe: compareTimeframe
        } = data;

        const comparisonReport = await analyticsService.compareInstitutions({
          baseInstitutionId: institutionId,
          compareWith,
          metrics: compareMetrics,
          timeframe: compareTimeframe,
          generatedBy: user.id
        });

        return NextResponse.json({
          success: true,
          data: {
            comparison: comparisonReport
          }
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Institution reports POST API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}