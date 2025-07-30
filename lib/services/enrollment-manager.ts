import { createClient } from '@/lib/supabase/server';
import {
  Enrollment,
  EnrollmentRequest,
  EnrollmentResult,
  BulkEnrollmentResult,
  EnrollmentStatus,
  EnrollmentRequestStatus,
  EnrollmentType,
  AuditAction,
  EligibilityResult,
  ClassWithEnrollment
} from '@/lib/types/enrollment';

export class EnrollmentManager {
  private supabase = createClient();

  /**
   * Request enrollment in a class
   */
  async requestEnrollment(
    studentId: string, 
    classId: string, 
    justification?: string
  ): Promise<EnrollmentResult> {
    try {
      // Get class details and enrollment config
      const classData = await this.getClassWithEnrollmentData(classId);
      if (!classData) {
        return {
          success: false,
          status: EnrollmentStatus.DROPPED,
          message: 'Class not found',
          nextSteps: ['Please verify the class ID and try again'],
          errors: [{ field: 'classId', message: 'Class not found', code: 'CLASS_NOT_FOUND' }]
        };
      }

      // Check if student is already enrolled or has pending request
      const existingEnrollment = await this.getStudentEnrollment(studentId, classId);
      if (existingEnrollment) {
        return {
          success: false,
          status: existingEnrollment.status,
          message: `Already ${existingEnrollment.status} in this class`,
          nextSteps: ['Check your enrollment status in your dashboard'],
          errors: [{ field: 'enrollment', message: 'Duplicate enrollment', code: 'ALREADY_ENROLLED' }]
        };
      }

      // Check eligibility
      const eligibility = await this.checkEnrollmentEligibility(studentId, classId);
      if (!eligibility.eligible) {
        const errorReasons = eligibility.reasons.filter(r => r.severity === 'error');
        if (errorReasons.length > 0) {
          return {
            success: false,
            status: EnrollmentStatus.DROPPED,
            message: 'Not eligible for enrollment',
            nextSteps: eligibility.recommendedActions,
            errors: errorReasons.map(r => ({ 
              field: r.type, 
              message: r.message, 
              code: r.type.toUpperCase() 
            }))
          };
        }
      }

      // Handle different enrollment types
      switch (classData.enrollmentType) {
        case EnrollmentType.OPEN:
          return await this.processOpenEnrollment(studentId, classId, classData);
        
        case EnrollmentType.RESTRICTED:
          return await this.processRestrictedEnrollment(studentId, classId, justification);
        
        case EnrollmentType.INVITATION_ONLY:
          return await this.processInvitationOnlyEnrollment(studentId, classId, justification);
        
        default:
          throw new Error(`Unknown enrollment type: ${classData.enrollmentType}`);
      }
    } catch (error) {
      console.error('Error requesting enrollment:', error);
      return {
        success: false,
        status: EnrollmentStatus.DROPPED,
        message: 'Failed to process enrollment request',
        nextSteps: ['Please try again later or contact support'],
        errors: [{ field: 'system', message: 'Internal error', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Process open enrollment (immediate enrollment if space available)
   */
  private async processOpenEnrollment(
    studentId: string, 
    classId: string, 
    classData: ClassWithEnrollment
  ): Promise<EnrollmentResult> {
    const { data: db } = await this.supabase.rpc('begin_transaction');
    
    try {
      // Check current capacity
      if (classData.currentEnrollment >= classData.capacity) {
        // Add to waitlist if available
        if (classData.waitlistCount < classData.waitlistCapacity) {
          const waitlistResult = await this.addToWaitlist(studentId, classId);
          await this.supabase.rpc('commit_transaction');
          
          return {
            success: true,
            status: EnrollmentStatus.WAITLISTED,
            message: 'Added to waitlist',
            waitlistPosition: waitlistResult.position,
            estimatedWaitTime: this.estimateWaitTime(waitlistResult.position),
            nextSteps: [
              'You will be notified when a spot becomes available',
              'Check your waitlist position in your dashboard'
            ]
          };
        } else {
          await this.supabase.rpc('rollback_transaction');
          return {
            success: false,
            status: EnrollmentStatus.DROPPED,
            message: 'Class is full and waitlist is not available',
            nextSteps: ['Look for alternative sections or classes'],
            errors: [{ field: 'capacity', message: 'No spots available', code: 'CAPACITY_FULL' }]
          };
        }
      }

      // Enroll student immediately
      const enrollment = await this.createEnrollment(studentId, classId);
      await this.logEnrollmentAction(studentId, classId, AuditAction.ENROLLED, studentId);
      await this.supabase.rpc('commit_transaction');

      return {
        success: true,
        enrollmentId: enrollment.id,
        status: EnrollmentStatus.ENROLLED,
        message: 'Successfully enrolled in class',
        nextSteps: [
          'Check your class schedule',
          'Review course materials',
          'Note important deadlines'
        ]
      };
    } catch (error) {
      await this.supabase.rpc('rollback_transaction');
      throw error;
    }
  }

  /**
   * Process invitation-only enrollment (requires valid invitation)
   */
  private async processInvitationOnlyEnrollment(
    studentId: string, 
    classId: string, 
    justification?: string
  ): Promise<EnrollmentResult> {
    // Check if student has a valid invitation for this class
    const { data: invitation, error } = await this.supabase
      .from('class_invitations')
      .select('*')
      .eq('class_id', classId)
      .or(`student_id.eq.${studentId},email.eq.(SELECT email FROM users WHERE id = '${studentId}')`)
      .is('accepted_at', null)
      .is('declined_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !invitation) {
      return {
        success: false,
        status: EnrollmentStatus.DROPPED,
        message: 'This class requires a valid invitation',
        nextSteps: [
          'Contact the instructor for an invitation',
          'Check your email for invitation links'
        ],
        errors: [{ field: 'invitation', message: 'Valid invitation required', code: 'INVITATION_REQUIRED' }]
      };
    }

    // If invitation exists, the enrollment should be handled through the invitation acceptance flow
    return {
      success: false,
      status: EnrollmentStatus.DROPPED,
      message: 'Please use your invitation link to enroll in this class',
      nextSteps: [
        'Check your email for the invitation link',
        'Click the invitation link to accept and enroll'
      ],
      errors: [{ field: 'enrollment', message: 'Use invitation link', code: 'USE_INVITATION_LINK' }]
    };
  }

  /**
   * Process restricted enrollment (requires approval)
   */
  private async processRestrictedEnrollment(
    studentId: string, 
    classId: string, 
    justification?: string
  ): Promise<EnrollmentResult> {
    try {
      // Create enrollment request
      const { data: request, error } = await this.supabase
        .from('enrollment_requests')
        .insert({
          student_id: studentId,
          class_id: classId,
          justification,
          status: EnrollmentRequestStatus.PENDING,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        })
        .select()
        .single();

      if (error) throw error;

      await this.logEnrollmentAction(studentId, classId, AuditAction.APPROVED, studentId, 'Enrollment request submitted');

      // Notify instructor (would be implemented with notification service)
      await this.notifyInstructorOfRequest(classId, request.id);

      return {
        success: true,
        status: EnrollmentStatus.PENDING,
        message: 'Enrollment request submitted for approval',
        nextSteps: [
          'Wait for instructor approval',
          'Check your email for updates',
          'Review your pending requests in your dashboard'
        ]
      };
    } catch (error) {
      console.error('Error creating enrollment request:', error);
      throw error;
    }
  }

  /**
   * Approve an enrollment request
   */
  async approveEnrollment(requestId: string, approverId: string): Promise<void> {
    const { data: db } = await this.supabase.rpc('begin_transaction');
    
    try {
      // Get the enrollment request
      const { data: request, error: requestError } = await this.supabase
        .from('enrollment_requests')
        .select('*')
        .eq('id', requestId)
        .eq('status', EnrollmentRequestStatus.PENDING)
        .single();

      if (requestError || !request) {
        throw new Error('Enrollment request not found or already processed');
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
            reviewed_by: approverId,
            review_notes: 'Approved but added to waitlist due to capacity'
          })
          .eq('id', requestId);

        await this.logEnrollmentAction(
          request.student_id, 
          request.class_id, 
          AuditAction.WAITLISTED, 
          approverId,
          'Approved but waitlisted due to capacity'
        );
      } else {
        // Create enrollment
        await this.createEnrollment(request.student_id, request.class_id, approverId);
        
        // Update request status
        await this.supabase
          .from('enrollment_requests')
          .update({
            status: EnrollmentRequestStatus.APPROVED,
            reviewed_at: new Date().toISOString(),
            reviewed_by: approverId,
            review_notes: 'Approved and enrolled'
          })
          .eq('id', requestId);

        await this.logEnrollmentAction(
          request.student_id, 
          request.class_id, 
          AuditAction.ENROLLED, 
          approverId,
          'Enrollment request approved'
        );
      }

      await this.supabase.rpc('commit_transaction');
      
      // Notify student of approval (would be implemented with notification service)
      await this.notifyStudentOfApproval(request.student_id, request.class_id);
    } catch (error) {
      await this.supabase.rpc('rollback_transaction');
      throw error;
    }
  }

  /**
   * Deny an enrollment request
   */
  async denyEnrollment(requestId: string, approverId: string, reason: string): Promise<void> {
    try {
      // Get the enrollment request
      const { data: request, error: requestError } = await this.supabase
        .from('enrollment_requests')
        .select('*')
        .eq('id', requestId)
        .eq('status', EnrollmentRequestStatus.PENDING)
        .single();

      if (requestError || !request) {
        throw new Error('Enrollment request not found or already processed');
      }

      // Update request status
      const { error } = await this.supabase
        .from('enrollment_requests')
        .update({
          status: EnrollmentRequestStatus.DENIED,
          reviewed_at: new Date().toISOString(),
          reviewed_by: approverId,
          review_notes: reason
        })
        .eq('id', requestId);

      if (error) throw error;

      await this.logEnrollmentAction(
        request.student_id, 
        request.class_id, 
        AuditAction.DENIED, 
        approverId,
        reason
      );

      // Notify student of denial (would be implemented with notification service)
      await this.notifyStudentOfDenial(request.student_id, request.class_id, reason);
    } catch (error) {
      console.error('Error denying enrollment request:', error);
      throw error;
    }
  }

  /**
   * Drop a student from a class
   */
  async dropStudent(studentId: string, classId: string, reason?: string, performedBy?: string): Promise<void> {
    const { data: db } = await this.supabase.rpc('begin_transaction');
    
    try {
      // Get current enrollment
      const enrollment = await this.getStudentEnrollment(studentId, classId);
      if (!enrollment || enrollment.status !== EnrollmentStatus.ENROLLED) {
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
        performedBy || studentId,
        reason
      );

      // Process waitlist for the newly available spot
      await this.processWaitlistForClass(classId);

      await this.supabase.rpc('commit_transaction');
    } catch (error) {
      await this.supabase.rpc('rollback_transaction');
      throw error;
    }
  }

  /**
   * Bulk enroll students
   */
  async bulkEnroll(studentIds: string[], classId: string, performedBy: string): Promise<BulkEnrollmentResult> {
    const results: BulkEnrollmentResult['results'] = [];
    let successful = 0;
    let failed = 0;
    const summary = { enrolled: 0, waitlisted: 0, rejected: 0 };

    for (const studentId of studentIds) {
      try {
        const result = await this.requestEnrollment(studentId, classId);
        results.push({ studentId, result });
        
        if (result.success) {
          successful++;
          if (result.status === EnrollmentStatus.ENROLLED) {
            summary.enrolled++;
          } else if (result.status === EnrollmentStatus.WAITLISTED) {
            summary.waitlisted++;
          }
        } else {
          failed++;
          summary.rejected++;
        }
      } catch (error) {
        failed++;
        summary.rejected++;
        results.push({
          studentId,
          result: {
            success: false,
            status: EnrollmentStatus.DROPPED,
            message: 'Failed to process enrollment',
            nextSteps: [],
            errors: [{ field: 'system', message: 'Internal error', code: 'INTERNAL_ERROR' }]
          }
        });
      }
    }

    return {
      totalProcessed: studentIds.length,
      successful,
      failed,
      results,
      summary
    };
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

  private async getStudentEnrollment(studentId: string, classId: string): Promise<Enrollment | null> {
    const { data, error } = await this.supabase
      .from('enrollments')
      .select('*')
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .single();

    return error ? null : data as Enrollment;
  }

  private async checkEnrollmentEligibility(studentId: string, classId: string): Promise<EligibilityResult> {
    // This would implement complex eligibility checking logic
    // For now, return a basic implementation
    return {
      eligible: true,
      reasons: [],
      recommendedActions: []
    };
  }

  private async createEnrollment(studentId: string, classId: string, enrolledBy?: string): Promise<Enrollment> {
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

  private async addToWaitlist(studentId: string, classId: string): Promise<{ position: number }> {
    // Get next position
    const { data: positionData } = await this.supabase
      .from('waitlist_entries')
      .select('position')
      .eq('class_id', classId)
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition = (positionData?.[0]?.position || 0) + 1;

    const { data, error } = await this.supabase
      .from('waitlist_entries')
      .insert({
        student_id: studentId,
        class_id: classId,
        position: nextPosition,
        estimated_probability: this.calculateEnrollmentProbability(nextPosition)
      })
      .select()
      .single();

    if (error) throw error;
    return { position: nextPosition };
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

  private isEnrollmentOpen(classData: any): boolean {
    const now = new Date();
    const enrollmentStart = classData.enrollment_start ? new Date(classData.enrollment_start) : null;
    const enrollmentEnd = classData.enrollment_end ? new Date(classData.enrollment_end) : null;

    if (enrollmentStart && now < enrollmentStart) return false;
    if (enrollmentEnd && now > enrollmentEnd) return false;
    
    return true;
  }

  private calculateEnrollmentProbability(position: number): number {
    // Simple probability calculation - would be more sophisticated in practice
    return Math.max(0.1, Math.min(0.9, 1 - (position * 0.1)));
  }

  private estimateWaitTime(position: number): string {
    // Simple estimation - would use historical data in practice
    const daysPerPosition = 3;
    const estimatedDays = position * daysPerPosition;
    
    if (estimatedDays < 7) {
      return `${estimatedDays} days`;
    } else if (estimatedDays < 30) {
      return `${Math.ceil(estimatedDays / 7)} weeks`;
    } else {
      return `${Math.ceil(estimatedDays / 30)} months`;
    }
  }

  // Notification methods (would integrate with notification service)
  private async notifyInstructorOfRequest(classId: string, requestId: string): Promise<void> {
    // Implementation would send notification to instructor
    console.log(`Notifying instructor of enrollment request ${requestId} for class ${classId}`);
  }

  private async notifyStudentOfApproval(studentId: string, classId: string): Promise<void> {
    // Implementation would send notification to student
    console.log(`Notifying student ${studentId} of enrollment approval for class ${classId}`);
  }

  private async notifyStudentOfDenial(studentId: string, classId: string, reason: string): Promise<void> {
    // Implementation would send notification to student
    console.log(`Notifying student ${studentId} of enrollment denial for class ${classId}: ${reason}`);
  }

  private async notifyWaitlistStudent(studentId: string, classId: string): Promise<void> {
    // Implementation would send notification to waitlisted student
    console.log(`Notifying waitlisted student ${studentId} of available spot in class ${classId}`);
  }
}