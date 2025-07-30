import { createClient } from '@/lib/supabase/server';

export interface EnrollmentAnalytics {
  totalEnrollments: number;
  totalCapacity: number;
  utilizationRate: number;
  totalWaitlisted: number;
  enrollmentTrends: EnrollmentTrend[];
  departmentStats: DepartmentStats[];
  conflictAlerts: EnrollmentConflict[];
  capacityUtilization: CapacityUtilization[];
  waitlistStatistics: WaitlistStatistics;
}

export interface EnrollmentTrend {
  period: string;
  enrollments: number;
  capacity: number;
  utilization: number;
  waitlisted: number;
  dropouts: number;
}

export interface DepartmentStats {
  departmentId: string;
  departmentName: string;
  enrollments: number;
  capacity: number;
  utilization: number;
  waitlisted: number;
  averageClassSize: number;
  totalClasses: number;
}

export interface EnrollmentConflict {
  id: string;
  type: 'capacity_exceeded' | 'prerequisite_violation' | 'schedule_conflict' | 'suspicious_activity' | 'policy_violation';
  severity: 'high' | 'medium' | 'low';
  description: string;
  affectedStudents: number;
  classId?: string;
  className?: string;
  studentId?: string;
  studentName?: string;
  detectedAt: Date;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  resolutionNotes?: string;
  resolvedBy?: string;
  resolvedAt?: Date;
}

export interface CapacityUtilization {
  classId: string;
  className: string;
  departmentName: string;
  capacity: number;
  enrolled: number;
  waitlisted: number;
  utilizationRate: number;
  isOvercapacity: boolean;
}

export interface WaitlistStatistics {
  totalWaitlisted: number;
  averageWaitTime: number; // in days
  promotionRate: number; // percentage
  departmentBreakdown: {
    departmentId: string;
    departmentName: string;
    waitlisted: number;
    averagePosition: number;
  }[];
}

export interface EnrollmentReport {
  id: string;
  name: string;
  type: 'enrollment_summary' | 'capacity_analysis' | 'waitlist_report' | 'trend_analysis' | 'conflict_report';
  description: string;
  parameters: Record<string, any>;
  generatedAt?: Date;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  filePath?: string;
  error?: string;
}

export interface InstitutionPolicy {
  id: string;
  institutionId: string;
  name: string;
  type: 'enrollment_deadline' | 'capacity_limit' | 'prerequisite_enforcement' | 'waitlist_policy' | 'override_policy';
  description: string;
  value: string | number | boolean;
  scope: 'institution' | 'department' | 'course';
  isActive: boolean;
  lastModified: Date;
  modifiedBy: string;
  effectiveDate?: Date;
  expirationDate?: Date;
}

export class EnrollmentAnalyticsService {
  private supabase = createClient();

  async getInstitutionAnalytics(
    institutionId: string, 
    timeframe: 'current_term' | 'last_term' | 'year_to_date' | 'last_year' = 'current_term'
  ): Promise<EnrollmentAnalytics> {
    try {
      const [
        enrollmentData,
        capacityData,
        waitlistData,
        trendsData,
        departmentData,
        conflictsData
      ] = await Promise.all([
        this.getEnrollmentCounts(institutionId, timeframe),
        this.getCapacityUtilization(institutionId, timeframe),
        this.getWaitlistStatistics(institutionId, timeframe),
        this.getEnrollmentTrends(institutionId, timeframe),
        this.getDepartmentStatistics(institutionId, timeframe),
        this.getEnrollmentConflicts(institutionId)
      ]);

      return {
        totalEnrollments: enrollmentData.total,
        totalCapacity: capacityData.total,
        utilizationRate: capacityData.total > 0 ? (enrollmentData.total / capacityData.total) * 100 : 0,
        totalWaitlisted: waitlistData.totalWaitlisted,
        enrollmentTrends: trendsData,
        departmentStats: departmentData,
        conflictAlerts: conflictsData,
        capacityUtilization: capacityData.details,
        waitlistStatistics: waitlistData
      };
    } catch (error) {
      console.error('Error fetching enrollment analytics:', error);
      throw new Error('Failed to fetch enrollment analytics');
    }
  }

  private async getEnrollmentCounts(institutionId: string, timeframe: string) {
    const { data, error } = await this.supabase
      .from('enrollments')
      .select(`
        id,
        class:classes!inner(
          id,
          institution_id,
          department:departments!inner(institution_id)
        )
      `)
      .eq('class.department.institution_id', institutionId)
      .eq('status', 'enrolled');

    if (error) throw error;
    return { total: data?.length || 0 };
  }

  private async getCapacityUtilization(institutionId: string, timeframe: string) {
    const { data, error } = await this.supabase
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
        ),
        enrollments!inner(count),
        waitlist_entries!inner(count)
      `)
      .eq('department.institution_id', institutionId);

    if (error) throw error;

    const details: CapacityUtilization[] = (data || []).map(cls => ({
      classId: cls.id,
      className: cls.name,
      departmentName: cls.department.name,
      capacity: cls.capacity || 0,
      enrolled: cls.current_enrollment || 0,
      waitlisted: cls.waitlist_entries?.length || 0,
      utilizationRate: cls.capacity > 0 ? ((cls.current_enrollment || 0) / cls.capacity) * 100 : 0,
      isOvercapacity: (cls.current_enrollment || 0) > (cls.capacity || 0)
    }));

    const totalCapacity = details.reduce((sum, cls) => sum + cls.capacity, 0);

    return {
      total: totalCapacity,
      details
    };
  }

  private async getWaitlistStatistics(institutionId: string, timeframe: string): Promise<WaitlistStatistics> {
    const { data, error } = await this.supabase
      .from('waitlist_entries')
      .select(`
        id,
        position,
        added_at,
        class:classes!inner(
          id,
          department:departments!inner(
            id,
            name,
            institution_id
          )
        )
      `)
      .eq('class.department.institution_id', institutionId);

    if (error) throw error;

    const totalWaitlisted = data?.length || 0;
    
    // Calculate average wait time (simplified)
    const averageWaitTime = 7; // placeholder - would calculate from historical data
    
    // Calculate promotion rate (simplified)
    const promotionRate = 65; // placeholder - would calculate from historical data

    // Department breakdown
    const departmentMap = new Map<string, { name: string; count: number; totalPosition: number }>();
    
    data?.forEach(entry => {
      const deptId = entry.class.department.id;
      const deptName = entry.class.department.name;
      
      if (!departmentMap.has(deptId)) {
        departmentMap.set(deptId, { name: deptName, count: 0, totalPosition: 0 });
      }
      
      const dept = departmentMap.get(deptId)!;
      dept.count++;
      dept.totalPosition += entry.position;
    });

    const departmentBreakdown = Array.from(departmentMap.entries()).map(([id, data]) => ({
      departmentId: id,
      departmentName: data.name,
      waitlisted: data.count,
      averagePosition: data.count > 0 ? data.totalPosition / data.count : 0
    }));

    return {
      totalWaitlisted,
      averageWaitTime,
      promotionRate,
      departmentBreakdown
    };
  }

  private async getEnrollmentTrends(institutionId: string, timeframe: string): Promise<EnrollmentTrend[]> {
    // This would typically query historical enrollment data
    // For now, returning mock data structure
    return [
      {
        period: 'Fall 2024',
        enrollments: 15420,
        capacity: 18500,
        utilization: 83.4,
        waitlisted: 892,
        dropouts: 234
      },
      {
        period: 'Spring 2024',
        enrollments: 14890,
        capacity: 18200,
        utilization: 81.8,
        waitlisted: 756,
        dropouts: 198
      },
      {
        period: 'Fall 2023',
        enrollments: 14320,
        capacity: 17800,
        utilization: 80.4,
        waitlisted: 623,
        dropouts: 187
      }
    ];
  }

  private async getDepartmentStatistics(institutionId: string, timeframe: string): Promise<DepartmentStats[]> {
    const { data, error } = await this.supabase
      .from('departments')
      .select(`
        id,
        name,
        classes(
          id,
          capacity,
          current_enrollment,
          enrollments!inner(count),
          waitlist_entries(count)
        )
      `)
      .eq('institution_id', institutionId);

    if (error) throw error;

    return (data || []).map(dept => {
      const classes = dept.classes || [];
      const totalCapacity = classes.reduce((sum, cls) => sum + (cls.capacity || 0), 0);
      const totalEnrollments = classes.reduce((sum, cls) => sum + (cls.current_enrollment || 0), 0);
      const totalWaitlisted = classes.reduce((sum, cls) => sum + (cls.waitlist_entries?.length || 0), 0);
      const totalClasses = classes.length;
      const averageClassSize = totalClasses > 0 ? totalEnrollments / totalClasses : 0;
      const utilization = totalCapacity > 0 ? (totalEnrollments / totalCapacity) * 100 : 0;

      return {
        departmentId: dept.id,
        departmentName: dept.name,
        enrollments: totalEnrollments,
        capacity: totalCapacity,
        utilization,
        waitlisted: totalWaitlisted,
        averageClassSize,
        totalClasses
      };
    });
  }

  private async getEnrollmentConflicts(institutionId: string): Promise<EnrollmentConflict[]> {
    // This would query for actual conflicts from various sources
    // For now, returning a structure that would be populated by conflict detection
    const conflicts: EnrollmentConflict[] = [];

    // Check for capacity violations
    const { data: overcapacityClasses } = await this.supabase
      .from('classes')
      .select(`
        id,
        name,
        capacity,
        current_enrollment,
        department:departments!inner(institution_id)
      `)
      .eq('department.institution_id', institutionId)
      .gt('current_enrollment', 'capacity');

    overcapacityClasses?.forEach(cls => {
      conflicts.push({
        id: `capacity-${cls.id}`,
        type: 'capacity_exceeded',
        severity: 'high',
        description: `${cls.name} has exceeded capacity by ${(cls.current_enrollment || 0) - (cls.capacity || 0)} students`,
        affectedStudents: (cls.current_enrollment || 0) - (cls.capacity || 0),
        classId: cls.id,
        className: cls.name,
        detectedAt: new Date(),
        status: 'open'
      });
    });

    return conflicts;
  }

  async resolveConflict(conflictId: string, resolution: string, resolvedBy: string): Promise<void> {
    // This would update the conflict status and add resolution notes
    // Implementation would depend on how conflicts are stored
    console.log(`Resolving conflict ${conflictId}: ${resolution} by ${resolvedBy}`);
  }

  async generateReport(
    institutionId: string,
    reportType: EnrollmentReport['type'],
    parameters: Record<string, any>
  ): Promise<string> {
    const reportId = `report-${Date.now()}`;
    
    // This would generate the actual report
    // For now, just returning a report ID
    return reportId;
  }

  async getInstitutionPolicies(institutionId: string): Promise<InstitutionPolicy[]> {
    const { data, error } = await this.supabase
      .from('institution_policies')
      .select('*')
      .eq('institution_id', institutionId)
      .order('name');

    if (error) throw error;

    return (data || []).map(policy => ({
      id: policy.id,
      institutionId: policy.institution_id,
      name: policy.name,
      type: policy.type,
      description: policy.description,
      value: policy.value,
      scope: policy.scope,
      isActive: policy.is_active,
      lastModified: new Date(policy.updated_at),
      modifiedBy: policy.modified_by,
      effectiveDate: policy.effective_date ? new Date(policy.effective_date) : undefined,
      expirationDate: policy.expiration_date ? new Date(policy.expiration_date) : undefined
    }));
  }

  async updateInstitutionPolicy(
    policyId: string,
    updates: Partial<InstitutionPolicy>,
    modifiedBy: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('institution_policies')
      .update({
        ...updates,
        modified_by: modifiedBy,
        updated_at: new Date().toISOString()
      })
      .eq('id', policyId);

    if (error) throw error;
  }
}