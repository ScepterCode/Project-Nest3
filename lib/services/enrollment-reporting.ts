import { createClient } from '@/lib/supabase/server';
import { EnrollmentReport, EnrollmentAnalytics } from './enrollment-analytics';

export interface ReportParameters {
  institutionId: string;
  timeframe?: {
    startDate: Date;
    endDate: Date;
  };
  departments?: string[];
  includeWaitlist?: boolean;
  includeDropouts?: boolean;
  format?: 'json' | 'csv' | 'pdf';
  groupBy?: 'department' | 'instructor' | 'course_level' | 'term';
}

export interface EnrollmentSummaryReport {
  institutionName: string;
  reportPeriod: string;
  generatedAt: Date;
  summary: {
    totalEnrollments: number;
    totalCapacity: number;
    utilizationRate: number;
    totalWaitlisted: number;
    totalDropouts: number;
  };
  departmentBreakdown: {
    departmentId: string;
    departmentName: string;
    enrollments: number;
    capacity: number;
    utilization: number;
    waitlisted: number;
    dropouts: number;
    averageClassSize: number;
  }[];
  classBreakdown: {
    classId: string;
    className: string;
    instructor: string;
    department: string;
    capacity: number;
    enrolled: number;
    waitlisted: number;
    utilization: number;
  }[];
}

export interface CapacityAnalysisReport {
  institutionName: string;
  reportPeriod: string;
  generatedAt: Date;
  overallUtilization: number;
  underutilizedClasses: {
    classId: string;
    className: string;
    department: string;
    capacity: number;
    enrolled: number;
    utilization: number;
    recommendedAction: string;
  }[];
  overcapacityClasses: {
    classId: string;
    className: string;
    department: string;
    capacity: number;
    enrolled: number;
    overCapacityBy: number;
    recommendedAction: string;
  }[];
  capacityRecommendations: {
    department: string;
    currentCapacity: number;
    recommendedCapacity: number;
    reasoning: string;
  }[];
}

export interface WaitlistReport {
  institutionName: string;
  reportPeriod: string;
  generatedAt: Date;
  totalWaitlisted: number;
  averageWaitTime: number;
  promotionRate: number;
  waitlistByDepartment: {
    departmentId: string;
    departmentName: string;
    totalWaitlisted: number;
    averagePosition: number;
    averageWaitTime: number;
    promotionRate: number;
  }[];
  waitlistByClass: {
    classId: string;
    className: string;
    department: string;
    capacity: number;
    enrolled: number;
    waitlisted: number;
    averageWaitPosition: number;
    estimatedPromotionChance: number;
  }[];
  waitlistTrends: {
    period: string;
    totalWaitlisted: number;
    promoted: number;
    dropped: number;
  }[];
}

export interface TrendAnalysisReport {
  institutionName: string;
  reportPeriod: string;
  generatedAt: Date;
  enrollmentTrends: {
    period: string;
    totalEnrollments: number;
    totalCapacity: number;
    utilization: number;
    growthRate: number;
  }[];
  departmentTrends: {
    departmentId: string;
    departmentName: string;
    trends: {
      period: string;
      enrollments: number;
      capacity: number;
      utilization: number;
      growthRate: number;
    }[];
  }[];
  seasonalPatterns: {
    term: string;
    averageEnrollments: number;
    peakEnrollmentWeek: number;
    dropoutRate: number;
  }[];
  predictions: {
    nextTerm: {
      predictedEnrollments: number;
      confidenceLevel: number;
      recommendedCapacity: number;
    };
    departmentPredictions: {
      departmentId: string;
      departmentName: string;
      predictedEnrollments: number;
      recommendedCapacity: number;
    }[];
  };
}

export class EnrollmentReportingService {
  private supabase = createClient();

  async generateEnrollmentSummary(parameters: ReportParameters): Promise<EnrollmentSummaryReport> {
    const { data: institution } = await this.supabase
      .from('institutions')
      .select('name')
      .eq('id', parameters.institutionId)
      .single();

    const institutionName = institution?.name || 'Unknown Institution';

    // Get enrollment data
    const { data: enrollmentData } = await this.supabase
      .from('enrollments')
      .select(`
        id,
        status,
        enrolled_at,
        class:classes!inner(
          id,
          name,
          capacity,
          current_enrollment,
          instructor:users!inner(email),
          department:departments!inner(
            id,
            name,
            institution_id
          )
        )
      `)
      .eq('class.department.institution_id', parameters.institutionId);

    // Get waitlist data
    const { data: waitlistData } = await this.supabase
      .from('waitlist_entries')
      .select(`
        id,
        class:classes!inner(
          id,
          department:departments!inner(
            id,
            name,
            institution_id
          )
        )
      `)
      .eq('class.department.institution_id', parameters.institutionId);

    // Calculate summary statistics
    const totalEnrollments = enrollmentData?.filter(e => e.status === 'enrolled').length || 0;
    const totalCapacity = enrollmentData?.reduce((sum, e) => sum + (e.class.capacity || 0), 0) || 0;
    const utilizationRate = totalCapacity > 0 ? (totalEnrollments / totalCapacity) * 100 : 0;
    const totalWaitlisted = waitlistData?.length || 0;
    const totalDropouts = enrollmentData?.filter(e => e.status === 'dropped').length || 0;

    // Calculate department breakdown
    const departmentMap = new Map();
    enrollmentData?.forEach(enrollment => {
      const dept = enrollment.class.department;
      if (!departmentMap.has(dept.id)) {
        departmentMap.set(dept.id, {
          departmentId: dept.id,
          departmentName: dept.name,
          enrollments: 0,
          capacity: 0,
          waitlisted: 0,
          dropouts: 0,
          classCount: 0
        });
      }
      
      const deptData = departmentMap.get(dept.id);
      if (enrollment.status === 'enrolled') deptData.enrollments++;
      if (enrollment.status === 'dropped') deptData.dropouts++;
      deptData.capacity += enrollment.class.capacity || 0;
      deptData.classCount++;
    });

    // Add waitlist data to departments
    waitlistData?.forEach(waitlist => {
      const deptId = waitlist.class.department.id;
      if (departmentMap.has(deptId)) {
        departmentMap.get(deptId).waitlisted++;
      }
    });

    const departmentBreakdown = Array.from(departmentMap.values()).map(dept => ({
      ...dept,
      utilization: dept.capacity > 0 ? (dept.enrollments / dept.capacity) * 100 : 0,
      averageClassSize: dept.classCount > 0 ? dept.enrollments / dept.classCount : 0
    }));

    // Calculate class breakdown
    const classMap = new Map();
    enrollmentData?.forEach(enrollment => {
      const cls = enrollment.class;
      if (!classMap.has(cls.id)) {
        classMap.set(cls.id, {
          classId: cls.id,
          className: cls.name,
          instructor: cls.instructor.email,
          department: cls.department.name,
          capacity: cls.capacity || 0,
          enrolled: 0,
          waitlisted: 0
        });
      }
      
      if (enrollment.status === 'enrolled') {
        classMap.get(cls.id).enrolled++;
      }
    });

    waitlistData?.forEach(waitlist => {
      const classId = waitlist.class.id;
      if (classMap.has(classId)) {
        classMap.get(classId).waitlisted++;
      }
    });

    const classBreakdown = Array.from(classMap.values()).map(cls => ({
      ...cls,
      utilization: cls.capacity > 0 ? (cls.enrolled / cls.capacity) * 100 : 0
    }));

    return {
      institutionName,
      reportPeriod: this.formatReportPeriod(parameters.timeframe),
      generatedAt: new Date(),
      summary: {
        totalEnrollments,
        totalCapacity,
        utilizationRate,
        totalWaitlisted,
        totalDropouts
      },
      departmentBreakdown,
      classBreakdown
    };
  }

  async generateCapacityAnalysis(parameters: ReportParameters): Promise<CapacityAnalysisReport> {
    const { data: institution } = await this.supabase
      .from('institutions')
      .select('name')
      .eq('id', parameters.institutionId)
      .single();

    const institutionName = institution?.name || 'Unknown Institution';

    // Get class capacity data
    const { data: classData } = await this.supabase
      .from('classes')
      .select(`
        id,
        name,
        capacity,
        current_enrollment,
        department:departments!inner(
          id,
          name,
          institution_id
        )
      `)
      .eq('department.institution_id', parameters.institutionId);

    const totalCapacity = classData?.reduce((sum, cls) => sum + (cls.capacity || 0), 0) || 0;
    const totalEnrolled = classData?.reduce((sum, cls) => sum + (cls.current_enrollment || 0), 0) || 0;
    const overallUtilization = totalCapacity > 0 ? (totalEnrolled / totalCapacity) * 100 : 0;

    // Identify underutilized classes (< 60% capacity)
    const underutilizedClasses = (classData || [])
      .filter(cls => {
        const utilization = cls.capacity > 0 ? ((cls.current_enrollment || 0) / cls.capacity) * 100 : 0;
        return utilization < 60;
      })
      .map(cls => {
        const utilization = cls.capacity > 0 ? ((cls.current_enrollment || 0) / cls.capacity) * 100 : 0;
        return {
          classId: cls.id,
          className: cls.name,
          department: cls.department.name,
          capacity: cls.capacity || 0,
          enrolled: cls.current_enrollment || 0,
          utilization,
          recommendedAction: utilization < 30 ? 'Consider canceling or combining with other sections' : 'Monitor enrollment trends'
        };
      });

    // Identify overcapacity classes
    const overcapacityClasses = (classData || [])
      .filter(cls => (cls.current_enrollment || 0) > (cls.capacity || 0))
      .map(cls => ({
        classId: cls.id,
        className: cls.name,
        department: cls.department.name,
        capacity: cls.capacity || 0,
        enrolled: cls.current_enrollment || 0,
        overCapacityBy: (cls.current_enrollment || 0) - (cls.capacity || 0),
        recommendedAction: 'Increase capacity or add additional section'
      }));

    // Generate capacity recommendations by department
    const departmentCapacityMap = new Map();
    classData?.forEach(cls => {
      const deptId = cls.department.id;
      if (!departmentCapacityMap.has(deptId)) {
        departmentCapacityMap.set(deptId, {
          department: cls.department.name,
          currentCapacity: 0,
          currentEnrollment: 0,
          classCount: 0
        });
      }
      
      const deptData = departmentCapacityMap.get(deptId);
      deptData.currentCapacity += cls.capacity || 0;
      deptData.currentEnrollment += cls.current_enrollment || 0;
      deptData.classCount++;
    });

    const capacityRecommendations = Array.from(departmentCapacityMap.values()).map(dept => {
      const utilization = dept.currentCapacity > 0 ? (dept.currentEnrollment / dept.currentCapacity) * 100 : 0;
      let recommendedCapacity = dept.currentCapacity;
      let reasoning = 'Current capacity is appropriate';

      if (utilization > 90) {
        recommendedCapacity = Math.ceil(dept.currentCapacity * 1.2);
        reasoning = 'High utilization suggests need for capacity increase';
      } else if (utilization < 60) {
        recommendedCapacity = Math.ceil(dept.currentCapacity * 0.8);
        reasoning = 'Low utilization suggests capacity reduction opportunity';
      }

      return {
        department: dept.department,
        currentCapacity: dept.currentCapacity,
        recommendedCapacity,
        reasoning
      };
    });

    return {
      institutionName,
      reportPeriod: this.formatReportPeriod(parameters.timeframe),
      generatedAt: new Date(),
      overallUtilization,
      underutilizedClasses,
      overcapacityClasses,
      capacityRecommendations
    };
  }

  async generateWaitlistReport(parameters: ReportParameters): Promise<WaitlistReport> {
    const { data: institution } = await this.supabase
      .from('institutions')
      .select('name')
      .eq('id', parameters.institutionId)
      .single();

    const institutionName = institution?.name || 'Unknown Institution';

    // Get waitlist data with class and department information
    const { data: waitlistData } = await this.supabase
      .from('waitlist_entries')
      .select(`
        id,
        position,
        added_at,
        class:classes!inner(
          id,
          name,
          capacity,
          current_enrollment,
          department:departments!inner(
            id,
            name,
            institution_id
          )
        )
      `)
      .eq('class.department.institution_id', parameters.institutionId);

    const totalWaitlisted = waitlistData?.length || 0;
    
    // Calculate average wait time and promotion rate (simplified)
    const averageWaitTime = 7; // This would be calculated from historical data
    const promotionRate = 65; // This would be calculated from historical data

    // Calculate waitlist by department
    const departmentWaitlistMap = new Map();
    waitlistData?.forEach(entry => {
      const dept = entry.class.department;
      if (!departmentWaitlistMap.has(dept.id)) {
        departmentWaitlistMap.set(dept.id, {
          departmentId: dept.id,
          departmentName: dept.name,
          totalWaitlisted: 0,
          totalPosition: 0,
          count: 0
        });
      }
      
      const deptData = departmentWaitlistMap.get(dept.id);
      deptData.totalWaitlisted++;
      deptData.totalPosition += entry.position;
      deptData.count++;
    });

    const waitlistByDepartment = Array.from(departmentWaitlistMap.values()).map(dept => ({
      departmentId: dept.departmentId,
      departmentName: dept.departmentName,
      totalWaitlisted: dept.totalWaitlisted,
      averagePosition: dept.count > 0 ? dept.totalPosition / dept.count : 0,
      averageWaitTime: 7, // Simplified
      promotionRate: 65 // Simplified
    }));

    // Calculate waitlist by class
    const classWaitlistMap = new Map();
    waitlistData?.forEach(entry => {
      const cls = entry.class;
      if (!classWaitlistMap.has(cls.id)) {
        classWaitlistMap.set(cls.id, {
          classId: cls.id,
          className: cls.name,
          department: cls.department.name,
          capacity: cls.capacity || 0,
          enrolled: cls.current_enrollment || 0,
          waitlisted: 0,
          totalPosition: 0,
          count: 0
        });
      }
      
      const classData = classWaitlistMap.get(cls.id);
      classData.waitlisted++;
      classData.totalPosition += entry.position;
      classData.count++;
    });

    const waitlistByClass = Array.from(classWaitlistMap.values()).map(cls => ({
      classId: cls.classId,
      className: cls.className,
      department: cls.department,
      capacity: cls.capacity,
      enrolled: cls.enrolled,
      waitlisted: cls.waitlisted,
      averageWaitPosition: cls.count > 0 ? cls.totalPosition / cls.count : 0,
      estimatedPromotionChance: Math.max(0, Math.min(100, ((cls.capacity - cls.enrolled) / cls.waitlisted) * 100))
    }));

    // Generate waitlist trends (simplified)
    const waitlistTrends = [
      { period: 'Current Term', totalWaitlisted, promoted: Math.floor(totalWaitlisted * 0.65), dropped: Math.floor(totalWaitlisted * 0.1) }
    ];

    return {
      institutionName,
      reportPeriod: this.formatReportPeriod(parameters.timeframe),
      generatedAt: new Date(),
      totalWaitlisted,
      averageWaitTime,
      promotionRate,
      waitlistByDepartment,
      waitlistByClass,
      waitlistTrends
    };
  }

  async generateTrendAnalysis(parameters: ReportParameters): Promise<TrendAnalysisReport> {
    const { data: institution } = await this.supabase
      .from('institutions')
      .select('name')
      .eq('id', parameters.institutionId)
      .single();

    const institutionName = institution?.name || 'Unknown Institution';

    // This would typically analyze historical data over multiple terms
    // For now, providing a simplified structure with mock trend data
    const enrollmentTrends = [
      { period: 'Fall 2024', totalEnrollments: 15420, totalCapacity: 18500, utilization: 83.4, growthRate: 2.1 },
      { period: 'Spring 2024', totalEnrollments: 14890, totalCapacity: 18200, utilization: 81.8, growthRate: 1.8 },
      { period: 'Fall 2023', totalEnrollments: 14320, totalCapacity: 17800, utilization: 80.4, growthRate: 1.2 }
    ];

    const departmentTrends = [
      {
        departmentId: '1',
        departmentName: 'Computer Science',
        trends: [
          { period: 'Fall 2024', enrollments: 3240, capacity: 3600, utilization: 90.0, growthRate: 5.2 },
          { period: 'Spring 2024', enrollments: 3080, capacity: 3500, utilization: 88.0, growthRate: 4.8 }
        ]
      }
    ];

    const seasonalPatterns = [
      { term: 'Fall', averageEnrollments: 14870, peakEnrollmentWeek: 2, dropoutRate: 8.5 },
      { term: 'Spring', averageEnrollments: 14200, peakEnrollmentWeek: 1, dropoutRate: 7.2 }
    ];

    const predictions = {
      nextTerm: {
        predictedEnrollments: 15800,
        confidenceLevel: 85,
        recommendedCapacity: 19000
      },
      departmentPredictions: [
        {
          departmentId: '1',
          departmentName: 'Computer Science',
          predictedEnrollments: 3400,
          recommendedCapacity: 3800
        }
      ]
    };

    return {
      institutionName,
      reportPeriod: this.formatReportPeriod(parameters.timeframe),
      generatedAt: new Date(),
      enrollmentTrends,
      departmentTrends,
      seasonalPatterns,
      predictions
    };
  }

  async exportReport(report: any, format: 'json' | 'csv' | 'pdf' = 'json'): Promise<string> {
    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2);
      case 'csv':
        return this.convertToCSV(report);
      case 'pdf':
        return this.generatePDF(report);
      default:
        return JSON.stringify(report, null, 2);
    }
  }

  private convertToCSV(report: any): string {
    // This would convert the report data to CSV format
    // Implementation would depend on the specific report structure
    return 'CSV export not implemented yet';
  }

  private generatePDF(report: any): string {
    // This would generate a PDF version of the report
    // Implementation would require a PDF generation library
    return 'PDF export not implemented yet';
  }

  private formatReportPeriod(timeframe?: { startDate: Date; endDate: Date }): string {
    if (!timeframe) {
      return 'Current Term';
    }
    
    const start = timeframe.startDate.toLocaleDateString();
    const end = timeframe.endDate.toLocaleDateString();
    return `${start} - ${end}`;
  }

  async scheduleReport(
    reportType: EnrollmentReport['type'],
    parameters: ReportParameters,
    schedule: {
      frequency: 'daily' | 'weekly' | 'monthly' | 'termly';
      recipients: string[];
      format: 'json' | 'csv' | 'pdf';
    }
  ): Promise<string> {
    const scheduleId = `schedule-${Date.now()}`;
    
    // This would create a scheduled report job
    // Implementation would depend on job scheduling system
    console.log(`Scheduling ${reportType} report with frequency ${schedule.frequency}`);
    
    return scheduleId;
  }
}