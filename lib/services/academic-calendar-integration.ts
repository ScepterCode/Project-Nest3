/**
 * Academic Calendar Integration Service
 * Manages enrollment periods and academic calendar synchronization
 */

export interface AcademicTerm {
  id: string;
  name: string;
  code: string;
  startDate: Date;
  endDate: Date;
  enrollmentStartDate: Date;
  enrollmentEndDate: Date;
  dropDeadline: Date;
  withdrawDeadline: Date;
  status: 'upcoming' | 'active' | 'completed';
  institutionId: string;
}

export interface EnrollmentPeriod {
  id: string;
  termId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  type: 'early' | 'regular' | 'late' | 'add_drop';
  priority: number;
  eligibleStudentTypes: string[];
  restrictions: string[];
}

export interface AcademicEvent {
  id: string;
  termId: string;
  name: string;
  description: string;
  date: Date;
  type: 'enrollment_start' | 'enrollment_end' | 'drop_deadline' | 'withdraw_deadline' | 'finals_week' | 'break';
  affectsEnrollment: boolean;
  notificationRequired: boolean;
}

export interface CalendarIntegrationConfig {
  baseUrl: string;
  apiKey: string;
  institutionId: string;
  syncInterval: number;
  timezone: string;
  autoEnforceDeadlines: boolean;
}

export class AcademicCalendarIntegrationService {
  private config: CalendarIntegrationConfig;
  private currentTerm: AcademicTerm | null = null;
  private enrollmentPeriods: Map<string, EnrollmentPeriod[]> = new Map();
  private upcomingEvents: AcademicEvent[] = [];

  constructor(config: CalendarIntegrationConfig) {
    this.config = config;
    this.initializeSync();
  }

  /**
   * Get current academic term
   */
  async getCurrentTerm(): Promise<AcademicTerm | null> {
    if (!this.currentTerm || this.isTermExpired(this.currentTerm)) {
      await this.syncCurrentTerm();
    }
    return this.currentTerm;
  }

  /**
   * Check if enrollment is currently allowed for a class
   */
  async isEnrollmentAllowed(classId: string, studentType: string = 'regular'): Promise<{
    allowed: boolean;
    reason?: string;
    deadline?: Date;
  }> {
    const currentTerm = await this.getCurrentTerm();
    if (!currentTerm) {
      return { allowed: false, reason: 'No active academic term' };
    }

    const now = new Date();
    const enrollmentPeriods = await this.getEnrollmentPeriods(currentTerm.id);
    
    // Check if we're in any valid enrollment period
    const activePeriodsForStudent = enrollmentPeriods.filter(period => 
      now >= period.startDate && 
      now <= period.endDate &&
      (period.eligibleStudentTypes.length === 0 || period.eligibleStudentTypes.includes(studentType))
    );

    if (activePeriodsForStudent.length === 0) {
      // Check if enrollment hasn't started yet
      const futurePeriodsForStudent = enrollmentPeriods.filter(period =>
        now < period.startDate &&
        (period.eligibleStudentTypes.length === 0 || period.eligibleStudentTypes.includes(studentType))
      );

      if (futurePeriodsForStudent.length > 0) {
        const nextPeriod = futurePeriodsForStudent.sort((a, b) => 
          a.startDate.getTime() - b.startDate.getTime()
        )[0];
        return {
          allowed: false,
          reason: `Enrollment opens on ${nextPeriod.startDate.toLocaleDateString()}`,
          deadline: nextPeriod.startDate
        };
      }

      return { allowed: false, reason: 'Enrollment period has ended' };
    }

    // Find the most permissive active period
    const activePeriod = activePeriodsForStudent.sort((a, b) => a.priority - b.priority)[0];
    
    return {
      allowed: true,
      deadline: activePeriod.endDate
    };
  }

  /**
   * Check if dropping is allowed
   */
  async isDropAllowed(classId: string): Promise<{
    allowed: boolean;
    reason?: string;
    deadline?: Date;
  }> {
    const currentTerm = await this.getCurrentTerm();
    if (!currentTerm) {
      return { allowed: false, reason: 'No active academic term' };
    }

    const now = new Date();
    
    if (now <= currentTerm.dropDeadline) {
      return {
        allowed: true,
        deadline: currentTerm.dropDeadline
      };
    }

    if (now <= currentTerm.withdrawDeadline) {
      return {
        allowed: true,
        reason: 'Drop period ended, withdrawal available',
        deadline: currentTerm.withdrawDeadline
      };
    }

    return {
      allowed: false,
      reason: 'Drop and withdrawal periods have ended'
    };
  }

  /**
   * Get enrollment periods for a term
   */
  async getEnrollmentPeriods(termId: string): Promise<EnrollmentPeriod[]> {
    if (!this.enrollmentPeriods.has(termId)) {
      await this.syncEnrollmentPeriods(termId);
    }
    return this.enrollmentPeriods.get(termId) || [];
  }

  /**
   * Get upcoming academic events that affect enrollment
   */
  async getUpcomingEnrollmentEvents(daysAhead: number = 30): Promise<AcademicEvent[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

    return this.upcomingEvents.filter(event => 
      event.affectsEnrollment && 
      event.date <= cutoffDate &&
      event.date >= new Date()
    );
  }

  /**
   * Schedule enrollment period notifications
   */
  async scheduleEnrollmentNotifications(): Promise<void> {
    const currentTerm = await this.getCurrentTerm();
    if (!currentTerm) return;

    const enrollmentPeriods = await this.getEnrollmentPeriods(currentTerm.id);
    
    for (const period of enrollmentPeriods) {
      // Schedule notification 24 hours before enrollment opens
      const notificationTime = new Date(period.startDate.getTime() - 24 * 60 * 60 * 1000);
      
      if (notificationTime > new Date()) {
        await this.scheduleNotification({
          type: 'enrollment_opening',
          scheduledFor: notificationTime,
          data: {
            periodName: period.name,
            startDate: period.startDate,
            endDate: period.endDate,
            eligibleStudentTypes: period.eligibleStudentTypes
          }
        });
      }

      // Schedule notification 24 hours before enrollment closes
      const closingNotificationTime = new Date(period.endDate.getTime() - 24 * 60 * 60 * 1000);
      
      if (closingNotificationTime > new Date()) {
        await this.scheduleNotification({
          type: 'enrollment_closing',
          scheduledFor: closingNotificationTime,
          data: {
            periodName: period.name,
            endDate: period.endDate
          }
        });
      }
    }
  }

  /**
   * Validate enrollment against academic calendar rules
   */
  async validateEnrollmentTiming(
    studentId: string, 
    classId: string, 
    studentType: string = 'regular'
  ): Promise<{
    valid: boolean;
    violations: string[];
    warnings: string[];
  }> {
    const violations: string[] = [];
    const warnings: string[] = [];

    const enrollmentCheck = await this.isEnrollmentAllowed(classId, studentType);
    if (!enrollmentCheck.allowed) {
      violations.push(enrollmentCheck.reason || 'Enrollment not allowed');
    }

    const currentTerm = await this.getCurrentTerm();
    if (currentTerm) {
      const now = new Date();
      const daysUntilDropDeadline = Math.ceil(
        (currentTerm.dropDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilDropDeadline <= 7 && daysUntilDropDeadline > 0) {
        warnings.push(`Drop deadline is in ${daysUntilDropDeadline} days`);
      }

      const daysUntilWithdrawDeadline = Math.ceil(
        (currentTerm.withdrawDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilWithdrawDeadline <= 14 && daysUntilWithdrawDeadline > 0) {
        warnings.push(`Withdrawal deadline is in ${daysUntilWithdrawDeadline} days`);
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      warnings
    };
  }

  /**
   * Sync academic calendar data
   */
  async syncCalendarData(): Promise<void> {
    try {
      await Promise.all([
        this.syncCurrentTerm(),
        this.syncUpcomingEvents(),
        this.syncAllEnrollmentPeriods()
      ]);
    } catch (error) {
      console.error('Failed to sync calendar data:', error);
      throw error;
    }
  }

  private async syncCurrentTerm(): Promise<void> {
    try {
      const response = await this.makeCalendarRequest('/terms/current');
      this.currentTerm = this.parseAcademicTerm(response.data);
    } catch (error) {
      console.error('Failed to sync current term:', error);
    }
  }

  private async syncEnrollmentPeriods(termId: string): Promise<void> {
    try {
      const response = await this.makeCalendarRequest(`/terms/${termId}/enrollment-periods`);
      const periods = response.data.periods.map(this.parseEnrollmentPeriod);
      this.enrollmentPeriods.set(termId, periods);
    } catch (error) {
      console.error('Failed to sync enrollment periods:', error);
      this.enrollmentPeriods.set(termId, []);
    }
  }

  private async syncAllEnrollmentPeriods(): Promise<void> {
    if (this.currentTerm) {
      await this.syncEnrollmentPeriods(this.currentTerm.id);
    }
  }

  private async syncUpcomingEvents(): Promise<void> {
    try {
      const response = await this.makeCalendarRequest('/events/upcoming?affects_enrollment=true');
      this.upcomingEvents = response.data.events.map(this.parseAcademicEvent);
    } catch (error) {
      console.error('Failed to sync upcoming events:', error);
    }
  }

  private parseAcademicTerm(data: any): AcademicTerm {
    return {
      id: data.id,
      name: data.name,
      code: data.code,
      startDate: new Date(data.start_date),
      endDate: new Date(data.end_date),
      enrollmentStartDate: new Date(data.enrollment_start_date),
      enrollmentEndDate: new Date(data.enrollment_end_date),
      dropDeadline: new Date(data.drop_deadline),
      withdrawDeadline: new Date(data.withdraw_deadline),
      status: data.status,
      institutionId: data.institution_id
    };
  }

  private parseEnrollmentPeriod(data: any): EnrollmentPeriod {
    return {
      id: data.id,
      termId: data.term_id,
      name: data.name,
      startDate: new Date(data.start_date),
      endDate: new Date(data.end_date),
      type: data.type,
      priority: data.priority,
      eligibleStudentTypes: data.eligible_student_types || [],
      restrictions: data.restrictions || []
    };
  }

  private parseAcademicEvent(data: any): AcademicEvent {
    return {
      id: data.id,
      termId: data.term_id,
      name: data.name,
      description: data.description,
      date: new Date(data.date),
      type: data.type,
      affectsEnrollment: data.affects_enrollment,
      notificationRequired: data.notification_required
    };
  }

  private isTermExpired(term: AcademicTerm): boolean {
    return new Date() > term.endDate;
  }

  private async makeCalendarRequest(endpoint: string): Promise<any> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Calendar API request failed: ${response.status}`);
    }

    return response.json();
  }

  private async scheduleNotification(notification: {
    type: string;
    scheduledFor: Date;
    data: any;
  }): Promise<void> {
    // Implementation would integrate with notification scheduling system
    console.log('Scheduling notification:', notification);
  }

  private initializeSync(): void {
    // Set up periodic sync
    setInterval(() => {
      this.syncCalendarData().catch(console.error);
    }, this.config.syncInterval);

    // Initial sync
    this.syncCalendarData().catch(console.error);
  }
}