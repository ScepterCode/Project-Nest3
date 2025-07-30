import { createClient } from '@/lib/supabase/server';
import {
  StudentEnrollmentDashboard,
  Enrollment,
  EnrollmentRequest,
  WaitlistEntry,
  ClassWithEnrollment,
  EnrollmentStatus,
  EnrollmentRequestStatus,
  EnrollmentAuditLog
} from '@/lib/types/enrollment';

export class StudentEnrollmentService {
  private supabase = createClient();

  /**
   * Get comprehensive enrollment dashboard data for a student
   */
  async getStudentEnrollmentDashboard(studentId: string): Promise<StudentEnrollmentDashboard> {
    try {
      // Fetch current enrollments with class details
      const currentEnrollments = await this.getCurrentEnrollments(studentId);
      
      // Fetch pending enrollment requests
      const pendingRequests = await this.getPendingRequests(studentId);
      
      // Fetch waitlist entries
      const waitlistEntries = await this.getWaitlistEntries(studentId);
      
      // Fetch available classes for enrollment
      const availableClasses = await this.getAvailableClasses(studentId);
      
      // Fetch enrollment history
      const enrollmentHistory = await this.getEnrollmentHistory(studentId);
      
      // Calculate statistics
      const statistics = await this.calculateStudentStatistics(studentId);

      return {
        currentEnrollments,
        pendingRequests,
        waitlistEntries,
        availableClasses,
        enrollmentHistory,
        statistics
      };
    } catch (error) {
      console.error('Error fetching student enrollment dashboard:', error);
      throw error;
    }
  }

  /**
   * Get current enrollments with upcoming deadlines
   */
  private async getCurrentEnrollments(studentId: string) {
    const { data: enrollments, error } = await this.supabase
      .from('enrollments')
      .select(`
        *,
        classes (
          *,
          users!classes_teacher_id_fkey (
            first_name,
            last_name
          )
        )
      `)
      .eq('student_id', studentId)
      .eq('status', EnrollmentStatus.ENROLLED)
      .order('enrolled_at', { ascending: false });

    if (error) throw error;

    return Promise.all(
      (enrollments || []).map(async (enrollment) => {
        const upcomingDeadlines = await this.getUpcomingDeadlines(enrollment.class_id);
        return {
          enrollment: enrollment as Enrollment,
          class: {
            ...enrollment.classes,
            teacherName: `${enrollment.classes.users?.first_name || ''} ${enrollment.classes.users?.last_name || ''}`.trim()
          } as ClassWithEnrollment,
          upcomingDeadlines
        };
      })
    );
  }

  /**
   * Get pending enrollment requests
   */
  private async getPendingRequests(studentId: string) {
    const { data: requests, error } = await this.supabase
      .from('enrollment_requests')
      .select(`
        *,
        classes (
          *,
          users!classes_teacher_id_fkey (
            first_name,
            last_name
          )
        )
      `)
      .eq('student_id', studentId)
      .eq('status', EnrollmentRequestStatus.PENDING)
      .order('requested_at', { ascending: false });

    if (error) throw error;

    return (requests || []).map((request) => ({
      request: request as EnrollmentRequest,
      class: {
        ...request.classes,
        teacherName: `${request.classes.users?.first_name || ''} ${request.classes.users?.last_name || ''}`.trim()
      } as ClassWithEnrollment,
      estimatedResponseTime: this.calculateEstimatedResponseTime(request.requested_at)
    }));
  }

  /**
   * Get waitlist entries
   */
  private async getWaitlistEntries(studentId: string) {
    const { data: entries, error } = await this.supabase
      .from('waitlist_entries')
      .select(`
        *,
        classes (
          *,
          users!classes_teacher_id_fkey (
            first_name,
            last_name
          )
        )
      `)
      .eq('student_id', studentId)
      .order('added_at', { ascending: false });

    if (error) throw error;

    return (entries || []).map((entry) => ({
      entry: entry as WaitlistEntry,
      class: {
        ...entry.classes,
        teacherName: `${entry.classes.users?.first_name || ''} ${entry.classes.users?.last_name || ''}`.trim()
      } as ClassWithEnrollment,
      estimatedEnrollmentDate: this.calculateEstimatedEnrollmentDate(entry.position)
    }));
  }

  /**
   * Get available classes for enrollment
   */
  private async getAvailableClasses(studentId: string, limit: number = 10): Promise<ClassWithEnrollment[]> {
    // Get classes the student is not already enrolled in or has pending requests for
    const { data: excludedClassIds } = await this.supabase
      .from('enrollments')
      .select('class_id')
      .eq('student_id', studentId)
      .in('status', [EnrollmentStatus.ENROLLED, EnrollmentStatus.PENDING, EnrollmentStatus.WAITLISTED]);

    const excludedIds = excludedClassIds?.map(e => e.class_id) || [];

    const { data: classes, error } = await this.supabase
      .from('classes')
      .select(`
        *,
        users!classes_teacher_id_fkey (
          first_name,
          last_name
        ),
        enrollment_statistics (*)
      `)
      .not('id', 'in', `(${excludedIds.join(',')})`)
      .eq('status', 'active')
      .limit(limit);

    if (error) throw error;

    return (classes || []).map(cls => ({
      ...cls,
      teacherName: `${cls.users?.first_name || ''} ${cls.users?.last_name || ''}`.trim(),
      availableSpots: Math.max(0, cls.capacity - cls.current_enrollment),
      waitlistCount: cls.enrollment_statistics?.[0]?.total_waitlisted || 0,
      isEnrollmentOpen: this.isEnrollmentOpen(cls),
      isWaitlistAvailable: cls.waitlist_capacity > (cls.enrollment_statistics?.[0]?.total_waitlisted || 0)
    })) as ClassWithEnrollment[];
  }

  /**
   * Get enrollment history
   */
  private async getEnrollmentHistory(studentId: string) {
    const { data: enrollments, error } = await this.supabase
      .from('enrollments')
      .select(`
        *,
        classes (
          *,
          users!classes_teacher_id_fkey (
            first_name,
            last_name
          )
        )
      `)
      .eq('student_id', studentId)
      .in('status', [EnrollmentStatus.COMPLETED, EnrollmentStatus.DROPPED, EnrollmentStatus.WITHDRAWN])
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return Promise.all(
      (enrollments || []).map(async (enrollment) => {
        const auditLog = await this.getEnrollmentAuditLog(studentId, enrollment.class_id);
        return {
          enrollment: enrollment as Enrollment,
          class: {
            ...enrollment.classes,
            teacherName: `${enrollment.classes.users?.first_name || ''} ${enrollment.classes.users?.last_name || ''}`.trim()
          } as ClassWithEnrollment,
          auditLog
        };
      })
    );
  }

  /**
   * Calculate student statistics
   */
  private async calculateStudentStatistics(studentId: string) {
    // Get all enrollments for credit calculation
    const { data: allEnrollments } = await this.supabase
      .from('enrollments')
      .select('credits, status, grade')
      .eq('student_id', studentId);

    const enrollments = allEnrollments || [];
    
    const totalCredits = enrollments
      .filter(e => e.status === EnrollmentStatus.ENROLLED)
      .reduce((sum, e) => sum + (e.credits || 0), 0);

    const completedCredits = enrollments
      .filter(e => e.status === EnrollmentStatus.COMPLETED)
      .reduce((sum, e) => sum + (e.credits || 0), 0);

    // Calculate GPA (simplified - would need proper grade point mapping)
    const gradedEnrollments = enrollments.filter(e => e.grade && e.status === EnrollmentStatus.COMPLETED);
    const currentGPA = gradedEnrollments.length > 0 
      ? this.calculateGPA(gradedEnrollments.map(e => e.grade))
      : undefined;

    // Calculate enrollment trend (simplified)
    const enrollmentTrend = await this.calculateEnrollmentTrend(studentId);

    return {
      totalCredits,
      completedCredits,
      currentGPA,
      enrollmentTrend
    };
  }

  /**
   * Drop a student from a class
   */
  async dropFromClass(studentId: string, classId: string, reason?: string): Promise<void> {
    const { data: db } = await this.supabase.rpc('begin_transaction');
    
    try {
      // Check if student can drop (deadline enforcement)
      const canDrop = await this.canDropClass(studentId, classId);
      if (!canDrop.allowed) {
        throw new Error(canDrop.reason);
      }

      // Update enrollment status
      const { error: updateError } = await this.supabase
        .from('enrollments')
        .update({
          status: EnrollmentStatus.DROPPED,
          updated_at: new Date().toISOString()
        })
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .eq('status', EnrollmentStatus.ENROLLED);

      if (updateError) throw updateError;

      // Log the action
      await this.supabase
        .from('enrollment_audit_log')
        .insert({
          student_id: studentId,
          class_id: classId,
          action: 'dropped',
          performed_by: studentId,
          reason: reason || 'Student initiated drop',
          timestamp: new Date().toISOString()
        });

      // Update class enrollment count
      await this.supabase.rpc('decrement_class_enrollment', { class_id: classId });

      // Process waitlist for newly available spot
      await this.processWaitlistForClass(classId);

      await this.supabase.rpc('commit_transaction');
    } catch (error) {
      await this.supabase.rpc('rollback_transaction');
      throw error;
    }
  }

  /**
   * Withdraw from a class
   */
  async withdrawFromClass(studentId: string, classId: string, reason?: string): Promise<void> {
    const { data: db } = await this.supabase.rpc('begin_transaction');
    
    try {
      // Check if student can withdraw (deadline enforcement)
      const canWithdraw = await this.canWithdrawFromClass(studentId, classId);
      if (!canWithdraw.allowed) {
        throw new Error(canWithdraw.reason);
      }

      // Update enrollment status
      const { error: updateError } = await this.supabase
        .from('enrollments')
        .update({
          status: EnrollmentStatus.WITHDRAWN,
          updated_at: new Date().toISOString()
        })
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .eq('status', EnrollmentStatus.ENROLLED);

      if (updateError) throw updateError;

      // Log the action
      await this.supabase
        .from('enrollment_audit_log')
        .insert({
          student_id: studentId,
          class_id: classId,
          action: 'withdrawn',
          performed_by: studentId,
          reason: reason || 'Student initiated withdrawal',
          timestamp: new Date().toISOString()
        });

      // Update class enrollment count
      await this.supabase.rpc('decrement_class_enrollment', { class_id: classId });

      // Process waitlist for newly available spot
      await this.processWaitlistForClass(classId);

      await this.supabase.rpc('commit_transaction');
    } catch (error) {
      await this.supabase.rpc('rollback_transaction');
      throw error;
    }
  }

  // Helper methods

  private async getUpcomingDeadlines(classId: string) {
    // This would integrate with assignment/deadline system
    // For now, return enrollment-related deadlines
    const { data: classData } = await this.supabase
      .from('classes')
      .select('drop_deadline, withdraw_deadline')
      .eq('id', classId)
      .single();

    const deadlines = [];
    const now = new Date();

    if (classData?.drop_deadline && new Date(classData.drop_deadline) > now) {
      deadlines.push({
        type: 'drop' as const,
        date: new Date(classData.drop_deadline),
        description: 'Last day to drop without penalty'
      });
    }

    if (classData?.withdraw_deadline && new Date(classData.withdraw_deadline) > now) {
      deadlines.push({
        type: 'withdraw' as const,
        date: new Date(classData.withdraw_deadline),
        description: 'Last day to withdraw'
      });
    }

    return deadlines;
  }

  private calculateEstimatedResponseTime(requestedAt: string): string {
    const daysSinceRequest = Math.floor((Date.now() - new Date(requestedAt).getTime()) / (1000 * 60 * 60 * 24));
    const averageResponseTime = 3; // days
    
    if (daysSinceRequest >= averageResponseTime) {
      return 'Response overdue';
    } else {
      return `${averageResponseTime - daysSinceRequest} days remaining`;
    }
  }

  private calculateEstimatedEnrollmentDate(position: number): Date | undefined {
    // Simple estimation - would use historical data in practice
    const daysPerPosition = 3;
    const estimatedDays = position * daysPerPosition;
    
    return new Date(Date.now() + estimatedDays * 24 * 60 * 60 * 1000);
  }

  private async getEnrollmentAuditLog(studentId: string, classId: string): Promise<EnrollmentAuditLog[]> {
    const { data, error } = await this.supabase
      .from('enrollment_audit_log')
      .select('*')
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .order('timestamp', { ascending: false });

    if (error) throw error;
    return data as EnrollmentAuditLog[];
  }

  private isEnrollmentOpen(classData: any): boolean {
    const now = new Date();
    const enrollmentStart = classData.enrollment_start ? new Date(classData.enrollment_start) : null;
    const enrollmentEnd = classData.enrollment_end ? new Date(classData.enrollment_end) : null;

    if (enrollmentStart && now < enrollmentStart) return false;
    if (enrollmentEnd && now > enrollmentEnd) return false;
    
    return true;
  }

  private calculateGPA(grades: string[]): number {
    // Simplified GPA calculation - would need proper grade point mapping
    const gradePoints: { [key: string]: number } = {
      'A+': 4.0, 'A': 4.0, 'A-': 3.7,
      'B+': 3.3, 'B': 3.0, 'B-': 2.7,
      'C+': 2.3, 'C': 2.0, 'C-': 1.7,
      'D+': 1.3, 'D': 1.0, 'F': 0.0
    };

    const totalPoints = grades.reduce((sum, grade) => sum + (gradePoints[grade] || 0), 0);
    return totalPoints / grades.length;
  }

  private async calculateEnrollmentTrend(studentId: string): Promise<'increasing' | 'decreasing' | 'stable'> {
    // Simplified trend calculation
    const { data: recentEnrollments } = await this.supabase
      .from('enrollments')
      .select('enrolled_at')
      .eq('student_id', studentId)
      .eq('status', EnrollmentStatus.ENROLLED)
      .order('enrolled_at', { ascending: false })
      .limit(6);

    if (!recentEnrollments || recentEnrollments.length < 2) {
      return 'stable';
    }

    const recent = recentEnrollments.slice(0, 3).length;
    const older = recentEnrollments.slice(3).length;

    if (recent > older) return 'increasing';
    if (recent < older) return 'decreasing';
    return 'stable';
  }

  private async canDropClass(studentId: string, classId: string): Promise<{ allowed: boolean; reason?: string }> {
    const { data: enrollment } = await this.supabase
      .from('enrollments')
      .select('*, classes(drop_deadline)')
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .eq('status', EnrollmentStatus.ENROLLED)
      .single();

    if (!enrollment) {
      return { allowed: false, reason: 'Not enrolled in this class' };
    }

    if (enrollment.classes?.drop_deadline) {
      const dropDeadline = new Date(enrollment.classes.drop_deadline);
      if (new Date() > dropDeadline) {
        return { allowed: false, reason: 'Drop deadline has passed' };
      }
    }

    return { allowed: true };
  }

  private async canWithdrawFromClass(studentId: string, classId: string): Promise<{ allowed: boolean; reason?: string }> {
    const { data: enrollment } = await this.supabase
      .from('enrollments')
      .select('*, classes(withdraw_deadline)')
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .eq('status', EnrollmentStatus.ENROLLED)
      .single();

    if (!enrollment) {
      return { allowed: false, reason: 'Not enrolled in this class' };
    }

    if (enrollment.classes?.withdraw_deadline) {
      const withdrawDeadline = new Date(enrollment.classes.withdraw_deadline);
      if (new Date() > withdrawDeadline) {
        return { allowed: false, reason: 'Withdrawal deadline has passed' };
      }
    }

    return { allowed: true };
  }

  private async processWaitlistForClass(classId: string): Promise<void> {
    // This would integrate with the WaitlistManager
    // For now, just a placeholder
    console.log(`Processing waitlist for class ${classId}`);
  }
}