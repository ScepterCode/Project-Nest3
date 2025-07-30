import { createClient } from '@/lib/supabase/server';
import {
  TeacherRosterData,
  Enrollment,
  EnrollmentRequest,
  WaitlistEntry,
  EnrollmentStatus,
  EnrollmentRequestStatus,
  AuditAction,
  ClassWithEnrollment,
  EligibilityResult
} from '@/lib/types/enrollment';

export class TeacherRosterService {
  private supabase = createClient();

  /**
   * Get comprehensive roster data for a teacher's class
   */
  async getClassRosterData(classId: string, teacherId: string): Promise<TeacherRosterData> {
    try {
      // Verify teacher owns this class
      const { data: classData, error: classError } = await this.supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .eq('teacher_id', teacherId)
        .single();

      if (classError || !classData) {
        throw new Error('Class not found or access denied');
      }

      // Get class with enrollment data
      const classWithEnrollment = await this.getClassWithEnrollmentData(classId);
      
      // Get enrolled students
      const enrolledStudents = await this.getEnrolledStudents(classId);
      
      // Get pending enrollment requests
      const pendingRequests = await this.getPendingRequests(classId);
      
      // Get waitlisted students
      const waitlistStudents = await this.getWaitlistStudents(classId);
      
      // Calculate statistics
      const statistics = await this.calculateRosterStatistics(classId);

      return {
        class: classWithEnrollment,
        enrolledStudents,
        pendingRequests,
        waitlistStudents,
        statistics
      };
    } catch (error) {
      console.error('Error fetching class roster data:', error);
      throw error;
    }
  }

  /**
   * Get enrolled students with their information and performance data
   */
  private async getEnrolledStudents(classId: string) {
    const { data: enrollments, error } = await this.supabase
      .from('enrollments')
      .select(`
        *,
        users!enrollments_student_id_fkey (
          id,
          first_name,
          last_name,
          email,
          student_id,
          year,
          major
        )
      `)
      .eq('class_id', classId)
      .eq('status', EnrollmentStatus.ENROLLED)
      .order('enrolled_at', { ascending: true });

    if (error) throw error;

    return Promise.all(
      (enrollments || []).map(async (enrollment) => {
        // Get performance data (would integrate with gradebook/assignment system)
        const performance = await this.getStudentPerformance(enrollment.student_id, classId);
        
        return {
          enrollment: enrollment as Enrollment,
          student: {
            id: enrollment.users.id,
            firstName: enrollment.users.first_name,
            lastName: enrollment.users.last_name,
            email: enrollment.users.email,
            studentId: enrollment.users.student_id,
            year: enrollment.users.year,
            major: enrollment.users.major
          },
          performance
        };
      })
    );
  }

  /**
   * Get pending enrollment requests with student information and eligibility
   */
  private async getPendingRequests(classId: string) {
    const { data: requests, error } = await this.supabase
      .from('enrollment_requests')
      .select(`
        *,
        users!enrollment_requests_student_id_fkey (
          id,
          first_name,
          last_name,
          email,
          student_id,
          year,
          major,
          gpa
        )
      `)
      .eq('class_id', classId)
      .eq('status', EnrollmentRequestStatus.PENDING)
      .order('requested_at', { ascending: true });

    if (error) throw error;

    return Promise.all(
      (requests || []).map(async (request) => {
        // Check eligibility for each request
        const eligibility = await this.checkStudentEligibility(request.student_id, classId);
        
        return {
          request: request as EnrollmentRequest,
          student: {
            id: request.users.id,
            firstName: request.users.first_name,
            lastName: request.users.last_name,
            email: request.users.email,
            studentId: request.users.student_id,
            year: request.users.year,
            major: request.users.major,
            gpa: request.users.gpa
          },
          eligibility
        };
      })
    );
  }

  /**
   * Get waitlisted students
   */
  private async getWaitlistStudents(classId: string) {
    const { data: entries, error } = await this.supabase
      .from('waitlist_entries')
      .select(`
        *,
        users!waitlist_entries_student_id_fkey (
          id,
          first_name,
          last_name,
          email,
          student_id,
          year,
          major
        )
      `)
      .eq('class_id', classId)
      .order('priority', { ascending: false })
      .order('added_at', { ascending: true });

    if (error) throw error;

    return (entries || []).map((entry) => ({
      entry: entry as WaitlistEntry,
      student: {
        id: entry.users.id,
        firstName: entry.users.first_name,
        lastName: entry.users.last_name,
        email: entry.users.email,
        studentId: entry.users.student_id,
        year: entry.users.year,
        major: entry.users.major
      }
    }));
  }

  /**
   * Approve an enrollment request
   */
  async approveEnrollmentRequest(requestId: string, teacherId: string, notes?: string): Promise<void> {
    const { data: db } = await this.supabase.rpc('begin_transaction');
    
    try {
      // Get the enrollment request
      const { data: request, error: requestError } = await this.supabase
        .from('enrollment_requests')
        .select('*, classes!enrollment_requests_class_id_fkey(teacher_id)')
        .eq('id', requestId)
        .eq('status', EnrollmentRequestStatus.PENDING)
        .single();

      if (requestError || !request) {
        throw new Error('Enrollment request not found or already processed');
      }

      // Verify teacher owns this class
      if (request.classes.teacher_id !== teacherId) {
        throw new Error('Access denied');
      }

      // Check if class still has capacity
      const classData = await this.getClassWithEnrollmentData(request.class_id);
      if (!classData) {
        throw new Error('Class not found');
      }

      if (classData.currentEnrollment >= classData.capacity) {
        // Add to waitlist instead
        await this.addToWaitlist(request.student_id, request.class_id);
        
        // Update request status
        await this.supabase
          .from('enrollment_requests')
          .update({
            status: EnrollmentRequestStatus.APPROVED,
            reviewed_at: new Date().toISOString(),
            reviewed_by: teacherId,
            review_notes: notes || 'Approved but added to waitlist due to capacity'
          })
          .eq('id', requestId);

        await this.logEnrollmentAction(
          request.student_id, 
          request.class_id, 
          AuditAction.WAITLISTED, 
          teacherId,
          'Approved but waitlisted due to capacity'
        );
      } else {
        // Create enrollment
        await this.createEnrollment(request.student_id, request.class_id, teacherId);
        
        // Update request status
        await this.supabase
          .from('enrollment_requests')
          .update({
            status: EnrollmentRequestStatus.APPROVED,
            reviewed_at: new Date().toISOString(),
            reviewed_by: teacherId,
            review_notes: notes || 'Approved and enrolled'
          })
          .eq('id', requestId);

        await this.logEnrollmentAction(
          request.student_id, 
          request.class_id, 
          AuditAction.ENROLLED, 
          teacherId,
          'Enrollment request approved'
        );
      }

      await this.supabase.rpc('commit_transaction');
      
      // Notify student of approval (would integrate with notification service)
      await this.notifyStudentOfApproval(request.student_id, request.class_id);
    } catch (error) {
      await this.supabase.rpc('rollback_transaction');
      throw error;
    }
  }

  /**
   * Deny an enrollment request
   */
  async denyEnrollmentRequest(requestId: string, teacherId: string, reason: string): Promise<void> {
    try {
      // Get the enrollment request
      const { data: request, error: requestError } = await this.supabase
        .from('enrollment_requests')
        .select('*, classes!enrollment_requests_class_id_fkey(teacher_id)')
        .eq('id', requestId)
        .eq('status', EnrollmentRequestStatus.PENDING)
        .single();

      if (requestError || !request) {
        throw new Error('Enrollment request not found or already processed');
      }

      // Verify teacher owns this class
      if (request.classes.teacher_id !== teacherId) {
        throw new Error('Access denied');
      }

      // Update request status
      const { error } = await this.supabase
        .from('enrollment_requests')
        .update({
          status: EnrollmentRequestStatus.DENIED,
          reviewed_at: new Date().toISOString(),
          reviewed_by: teacherId,
          review_notes: reason
        })
        .eq('id', requestId);

      if (error) throw error;

      await this.logEnrollmentAction(
        request.student_id, 
        request.class_id, 
        AuditAction.DENIED, 
        teacherId,
        reason
      );

      // Notify student of denial (would integrate with notification service)
      await this.notifyStudentOfDenial(request.student_id, request.class_id, reason);
    } catch (error) {
      console.error('Error denying enrollment request:', error);
      throw error;
    }
  }

  /**
   * Batch approve multiple enrollment requests
   */
  async batchApproveRequests(requestIds: string[], teacherId: string): Promise<{
    successful: number;
    failed: number;
    results: Array<{ requestId: string; success: boolean; message: string }>;
  }> {
    const results = [];
    let successful = 0;
    let failed = 0;

    for (const requestId of requestIds) {
      try {
        await this.approveEnrollmentRequest(requestId, teacherId);
        results.push({ requestId, success: true, message: 'Approved successfully' });
        successful++;
      } catch (error) {
        results.push({ 
          requestId, 
          success: false, 
          message: error instanceof Error ? error.message : 'Unknown error' 
        });
        failed++;
      }
    }

    return { successful, failed, results };
  }

  /**
   * Remove a student from the class roster
   */
  async removeStudentFromRoster(studentId: string, classId: string, teacherId: string, reason: string): Promise<void> {
    const { data: db } = await this.supabase.rpc('begin_transaction');
    
    try {
      // Verify teacher owns this class
      const { data: classData } = await this.supabase
        .from('classes')
        .select('teacher_id')
        .eq('id', classId)
        .single();

      if (!classData || classData.teacher_id !== teacherId) {
        throw new Error('Access denied');
      }

      // Get current enrollment
      const { data: enrollment } = await this.supabase
        .from('enrollments')
        .select('*')
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .eq('status', EnrollmentStatus.ENROLLED)
        .single();

      if (!enrollment) {
        throw new Error('Student is not enrolled in this class');
      }

      // Update enrollment status
      const { error } = await this.supabase
        .from('enrollments')
        .update({
          status: EnrollmentStatus.DROPPED,
          updated_at: new Date().toISOString()
        })
        .eq('student_id', studentId)
        .eq('class_id', classId);

      if (error) throw error;

      await this.logEnrollmentAction(
        studentId, 
        classId, 
        AuditAction.DROPPED, 
        teacherId,
        `Teacher removed student: ${reason}`
      );

      // Process waitlist for the newly available spot
      await this.processWaitlistForClass(classId);

      await this.supabase.rpc('commit_transaction');
      
      // Notify student of removal (would integrate with notification service)
      await this.notifyStudentOfRemoval(studentId, classId, reason);
    } catch (error) {
      await this.supabase.rpc('rollback_transaction');
      throw error;
    }
  }

  /**
   * Manually promote a student from waitlist
   */
  async promoteFromWaitlist(waitlistEntryId: string, teacherId: string): Promise<void> {
    const { data: db } = await this.supabase.rpc('begin_transaction');
    
    try {
      // Get waitlist entry
      const { data: entry, error: entryError } = await this.supabase
        .from('waitlist_entries')
        .select('*, classes!waitlist_entries_class_id_fkey(teacher_id)')
        .eq('id', waitlistEntryId)
        .single();

      if (entryError || !entry) {
        throw new Error('Waitlist entry not found');
      }

      // Verify teacher owns this class
      if (entry.classes.teacher_id !== teacherId) {
        throw new Error('Access denied');
      }

      // Check if class has capacity
      const classData = await this.getClassWithEnrollmentData(entry.class_id);
      if (!classData || classData.currentEnrollment >= classData.capacity) {
        throw new Error('Class is at capacity');
      }

      // Create enrollment
      await this.createEnrollment(entry.student_id, entry.class_id, teacherId);

      // Remove from waitlist
      await this.supabase
        .from('waitlist_entries')
        .delete()
        .eq('id', waitlistEntryId);

      await this.logEnrollmentAction(
        entry.student_id, 
        entry.class_id, 
        AuditAction.ENROLLED, 
        teacherId,
        'Manually promoted from waitlist'
      );

      await this.supabase.rpc('commit_transaction');
      
      // Notify student of enrollment (would integrate with notification service)
      await this.notifyStudentOfEnrollment(entry.student_id, entry.class_id);
    } catch (error) {
      await this.supabase.rpc('rollback_transaction');
      throw error;
    }
  }

  /**
   * Export roster data
   */
  async exportRoster(classId: string, teacherId: string, format: 'csv' | 'json' = 'csv'): Promise<string> {
    try {
      const rosterData = await this.getClassRosterData(classId, teacherId);
      
      if (format === 'json') {
        return JSON.stringify(rosterData, null, 2);
      }

      // Generate CSV
      const csvHeaders = [
        'Student ID',
        'First Name',
        'Last Name',
        'Email',
        'Year',
        'Major',
        'Enrollment Date',
        'Status',
        'Grade'
      ];

      const csvRows = rosterData.enrolledStudents.map(({ enrollment, student }) => [
        student.studentId || '',
        student.firstName,
        student.lastName,
        student.email,
        student.year || '',
        student.major || '',
        enrollment.enrolledAt.toISOString().split('T')[0],
        enrollment.status,
        enrollment.grade || ''
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
      ].join('\n');

      return csvContent;
    } catch (error) {
      console.error('Error exporting roster:', error);
      throw error;
    }
  }

  // Helper methods

  private async getClassWithEnrollmentData(classId: string): Promise<ClassWithEnrollment | null> {
    const { data, error } = await this.supabase
      .from('classes')
      .select(`
        *,
        enrollment_statistics (*)
      `)
      .eq('id', classId)
      .single();

    if (error || !data) return null;

    return {
      ...data,
      availableSpots: Math.max(0, data.capacity - data.current_enrollment),
      waitlistCount: data.enrollment_statistics?.[0]?.total_waitlisted || 0,
      isEnrollmentOpen: this.isEnrollmentOpen(data),
      isWaitlistAvailable: data.waitlist_capacity > (data.enrollment_statistics?.[0]?.total_waitlisted || 0)
    } as ClassWithEnrollment;
  }

  private async getStudentPerformance(studentId: string, classId: string) {
    // This would integrate with gradebook/assignment system
    // For now, return mock data
    return {
      attendance: 95,
      assignments: 88,
      participation: 92
    };
  }

  private async checkStudentEligibility(studentId: string, classId: string): Promise<EligibilityResult> {
    // This would implement complex eligibility checking logic
    // For now, return a basic implementation
    return {
      eligible: true,
      reasons: [],
      recommendedActions: []
    };
  }

  private async createEnrollment(studentId: string, classId: string, enrolledBy: string): Promise<Enrollment> {
    const { data, error } = await this.supabase
      .from('enrollments')
      .insert({
        student_id: studentId,
        class_id: classId,
        status: EnrollmentStatus.ENROLLED,
        enrolled_by: enrolledBy,
        enrolled_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data as Enrollment;
  }

  private async addToWaitlist(studentId: string, classId: string): Promise<void> {
    // Get next position
    const { data: positionData } = await this.supabase
      .from('waitlist_entries')
      .select('position')
      .eq('class_id', classId)
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition = (positionData?.[0]?.position || 0) + 1;

    const { error } = await this.supabase
      .from('waitlist_entries')
      .insert({
        student_id: studentId,
        class_id: classId,
        position: nextPosition,
        estimated_probability: this.calculateEnrollmentProbability(nextPosition)
      });

    if (error) throw error;
  }

  private async processWaitlistForClass(classId: string): Promise<void> {
    // Get next student on waitlist
    const { data: nextStudent } = await this.supabase
      .from('waitlist_entries')
      .select('*')
      .eq('class_id', classId)
      .order('priority', { ascending: false })
      .order('added_at', { ascending: true })
      .limit(1);

    if (nextStudent && nextStudent.length > 0) {
      const entry = nextStudent[0];
      
      // Notify student of available spot
      await this.notifyWaitlistStudent(entry.student_id, classId);
      
      // Set notification expiration (24 hours)
      await this.supabase
        .from('waitlist_entries')
        .update({
          notified_at: new Date().toISOString(),
          notification_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('id', entry.id);
    }
  }

  private async logEnrollmentAction(
    studentId: string, 
    classId: string, 
    action: AuditAction, 
    performedBy: string,
    reason?: string
  ): Promise<void> {
    await this.supabase
      .from('enrollment_audit_log')
      .insert({
        student_id: studentId,
        class_id: classId,
        action,
        performed_by: performedBy,
        reason,
        timestamp: new Date().toISOString()
      });
  }

  private async calculateRosterStatistics(classId: string) {
    // Get enrollment data for statistics
    const { data: enrollments } = await this.supabase
      .from('enrollments')
      .select('status, grade')
      .eq('class_id', classId);

    const total = enrollments?.length || 0;
    const enrolled = enrollments?.filter(e => e.status === EnrollmentStatus.ENROLLED).length || 0;
    const dropped = enrollments?.filter(e => e.status === EnrollmentStatus.DROPPED).length || 0;
    
    const enrollmentRate = total > 0 ? (enrolled / total) * 100 : 0;
    const dropoutRate = total > 0 ? (dropped / total) * 100 : 0;

    // Calculate average grade (simplified)
    const gradedEnrollments = enrollments?.filter(e => e.grade) || [];
    const averageGrade = gradedEnrollments.length > 0 
      ? this.calculateAverageGrade(gradedEnrollments.map(e => e.grade))
      : undefined;

    return {
      enrollmentRate,
      dropoutRate,
      averageGrade,
      attendanceRate: 95 // Mock data - would integrate with attendance system
    };
  }

  private calculateEnrollmentProbability(position: number): number {
    return Math.max(0.1, Math.min(0.9, 1 - (position * 0.1)));
  }

  private calculateAverageGrade(grades: string[]): number {
    // Simplified grade calculation - would need proper grade point mapping
    const gradePoints: { [key: string]: number } = {
      'A+': 4.0, 'A': 4.0, 'A-': 3.7,
      'B+': 3.3, 'B': 3.0, 'B-': 2.7,
      'C+': 2.3, 'C': 2.0, 'C-': 1.7,
      'D+': 1.3, 'D': 1.0, 'F': 0.0
    };

    const totalPoints = grades.reduce((sum, grade) => sum + (gradePoints[grade] || 0), 0);
    return totalPoints / grades.length;
  }

  private isEnrollmentOpen(classData: any): boolean {
    const now = new Date();
    const enrollmentStart = classData.enrollment_start ? new Date(classData.enrollment_start) : null;
    const enrollmentEnd = classData.enrollment_end ? new Date(classData.enrollment_end) : null;

    if (enrollmentStart && now < enrollmentStart) return false;
    if (enrollmentEnd && now > enrollmentEnd) return false;
    
    return true;
  }

  // Notification methods (would integrate with notification service)
  private async notifyStudentOfApproval(studentId: string, classId: string): Promise<void> {
    console.log(`Notifying student ${studentId} of enrollment approval for class ${classId}`);
  }

  private async notifyStudentOfDenial(studentId: string, classId: string, reason: string): Promise<void> {
    console.log(`Notifying student ${studentId} of enrollment denial for class ${classId}: ${reason}`);
  }

  private async notifyStudentOfRemoval(studentId: string, classId: string, reason: string): Promise<void> {
    console.log(`Notifying student ${studentId} of removal from class ${classId}: ${reason}`);
  }

  private async notifyStudentOfEnrollment(studentId: string, classId: string): Promise<void> {
    console.log(`Notifying student ${studentId} of enrollment in class ${classId}`);
  }

  private async notifyWaitlistStudent(studentId: string, classId: string): Promise<void> {
    console.log(`Notifying waitlisted student ${studentId} of available spot in class ${classId}`);
  }
}