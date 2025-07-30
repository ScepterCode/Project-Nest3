import { createClient } from '@/lib/supabase/server';
import {
  WaitlistEntry,
  WaitlistNotification,
  NotificationType,
  EnrollmentStatus,
  AuditAction
} from '@/lib/types/enrollment';
import { NotificationService } from './notification-service';

export class WaitlistManager {
  private supabase = createClient();
  private notificationService = new NotificationService();

  /**
   * Add student to waitlist
   */
  async addToWaitlist(studentId: string, classId: string, priority: number = 0): Promise<WaitlistEntry> {
    const { data: db } = await this.supabase.rpc('begin_transaction');
    
    try {
      // Check if student is already on waitlist
      const { data: existing } = await this.supabase
        .from('waitlist_entries')
        .select('*')
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .single();

      if (existing) {
        throw new Error('Student is already on the waitlist for this class');
      }

      // Get next position (considering priority)
      const position = await this.calculateNextPosition(classId, priority);

      // Create waitlist entry
      const { data: entry, error } = await this.supabase
        .from('waitlist_entries')
        .insert({
          student_id: studentId,
          class_id: classId,
          position,
          priority,
          estimated_probability: this.calculateEnrollmentProbability(position),
          added_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Log the action
      await this.logWaitlistAction(studentId, classId, AuditAction.WAITLISTED, studentId);

      // Update positions for other entries if needed
      await this.reorderWaitlist(classId);

      await this.supabase.rpc('commit_transaction');
      
      return entry as WaitlistEntry;
    } catch (error) {
      await this.supabase.rpc('rollback_transaction');
      throw error;
    }
  }

  /**
   * Remove student from waitlist
   */
  async removeFromWaitlist(studentId: string, classId: string): Promise<void> {
    const { data: db } = await this.supabase.rpc('begin_transaction');
    
    try {
      // Get the waitlist entry
      const { data: entry } = await this.supabase
        .from('waitlist_entries')
        .select('*')
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .single();

      if (!entry) {
        throw new Error('Student is not on the waitlist for this class');
      }

      // Remove the entry
      const { error } = await this.supabase
        .from('waitlist_entries')
        .delete()
        .eq('student_id', studentId)
        .eq('class_id', classId);

      if (error) throw error;

      // Log the action
      await this.logWaitlistAction(studentId, classId, AuditAction.DROPPED, studentId, 'Removed from waitlist');

      // Reorder remaining entries
      await this.reorderWaitlist(classId);

      await this.supabase.rpc('commit_transaction');
    } catch (error) {
      await this.supabase.rpc('rollback_transaction');
      throw error;
    }
  }

  /**
   * Process waitlist when a spot becomes available
   */
  async processWaitlist(classId: string): Promise<void> {
    const { data: db } = await this.supabase.rpc('begin_transaction');
    
    try {
      // Get class capacity info
      const { data: classData } = await this.supabase
        .from('classes')
        .select('capacity, current_enrollment, waitlist_capacity')
        .eq('id', classId)
        .single();

      if (!classData || classData.current_enrollment >= classData.capacity) {
        // No spots available
        await this.supabase.rpc('rollback_transaction');
        return;
      }

      // Calculate how many spots are available
      const availableSpots = classData.capacity - classData.current_enrollment;
      
      // Get next students on waitlist (highest priority, then earliest added)
      const { data: nextEntries } = await this.supabase
        .from('waitlist_entries')
        .select('*')
        .eq('class_id', classId)
        .is('notified_at', null) // Only get students who haven't been notified yet
        .order('priority', { ascending: false })
        .order('added_at', { ascending: true })
        .limit(Math.min(availableSpots, 5)); // Process up to 5 at once, but not more than available spots

      if (!nextEntries || nextEntries.length === 0) {
        // No one on waitlist or all have been notified
        await this.supabase.rpc('rollback_transaction');
        return;
      }

      // Notify students and set expiration times
      const expirationTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      for (const entry of nextEntries) {
        // Notify the student
        await this.notifyWaitlistAdvancement(entry.student_id, classId);

        // Set notification expiration (24 hours to respond)
        await this.supabase
          .from('waitlist_entries')
          .update({
            notified_at: new Date().toISOString(),
            notification_expires_at: expirationTime.toISOString()
          })
          .eq('id', entry.id);
      }

      await this.supabase.rpc('commit_transaction');
    } catch (error) {
      await this.supabase.rpc('rollback_transaction');
      throw error;
    }
  }

  /**
   * Get waitlist position for a student
   */
  async getWaitlistPosition(studentId: string, classId: string): Promise<number> {
    const { data: entry } = await this.supabase
      .from('waitlist_entries')
      .select('position')
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .single();

    return entry?.position || 0;
  }

  /**
   * Estimate enrollment probability based on position
   */
  estimateEnrollmentProbability(studentId: string, classId: string): Promise<number> {
    return this.getWaitlistPosition(studentId, classId).then(position => {
      return this.calculateEnrollmentProbability(position);
    });
  }

  /**
   * Notify student of waitlist advancement
   */
  async notifyWaitlistAdvancement(studentId: string, classId: string): Promise<void> {
    try {
      // Get waitlist entry and class information
      const { data: entry } = await this.supabase
        .from('waitlist_entries')
        .select(`
          *,
          classes!waitlist_entries_class_id_fkey (
            id,
            name,
            code
          )
        `)
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .single();

      if (!entry) return;

      const responseDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const className = entry.classes?.name || 'Unknown Class';

      // Create notification record
      const { error } = await this.supabase
        .from('waitlist_notifications')
        .insert({
          waitlist_entry_id: entry.id,
          notification_type: NotificationType.ENROLLMENT_AVAILABLE,
          sent_at: new Date().toISOString(),
          response_deadline: responseDeadline.toISOString()
        });

      if (error) throw error;

      // Send notification via notification service
      await this.notificationService.sendWaitlistAdvancementNotification(
        studentId,
        classId,
        className,
        entry.position,
        responseDeadline
      );
      
      // Log the notification
      await this.logWaitlistAction(
        studentId, 
        classId, 
        AuditAction.APPROVED, 
        'system',
        'Waitlist advancement notification sent'
      );
    } catch (error) {
      console.error('Failed to notify student of waitlist advancement:', error);
    }
  }

  /**
   * Handle student response to waitlist notification
   */
  async handleWaitlistResponse(
    studentId: string, 
    classId: string, 
    response: 'accept' | 'decline'
  ): Promise<void> {
    const { data: db } = await this.supabase.rpc('begin_transaction');
    
    try {
      // Get the waitlist entry
      const { data: entry } = await this.supabase
        .from('waitlist_entries')
        .select('*')
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .single();

      if (!entry) {
        throw new Error('Waitlist entry not found');
      }

      // Update notification response
      await this.supabase
        .from('waitlist_notifications')
        .update({
          responded: true,
          response,
          response_at: new Date().toISOString()
        })
        .eq('waitlist_entry_id', entry.id)
        .eq('notification_type', NotificationType.ENROLLMENT_AVAILABLE);

      if (response === 'accept') {
        // Enroll the student
        await this.enrollFromWaitlist(studentId, classId);
      } else {
        // Remove from waitlist and process next student
        await this.removeFromWaitlist(studentId, classId);
        await this.processWaitlist(classId);
      }

      await this.supabase.rpc('commit_transaction');
    } catch (error) {
      await this.supabase.rpc('rollback_transaction');
      throw error;
    }
  }

  /**
   * Process expired waitlist notifications
   */
  async processExpiredNotifications(): Promise<void> {
    const now = new Date().toISOString();
    
    // Get expired notifications
    const { data: expiredEntries } = await this.supabase
      .from('waitlist_entries')
      .select(`
        *,
        waitlist_notifications!inner (*)
      `)
      .lt('notification_expires_at', now)
      .eq('waitlist_notifications.responded', false)
      .eq('waitlist_notifications.notification_type', NotificationType.ENROLLMENT_AVAILABLE);

    if (!expiredEntries || expiredEntries.length === 0) return;

    for (const entry of expiredEntries) {
      try {
        // Mark as no response and remove from waitlist
        await this.supabase
          .from('waitlist_notifications')
          .update({
            responded: true,
            response: 'no_response',
            response_at: new Date().toISOString()
          })
          .eq('waitlist_entry_id', entry.id)
          .eq('notification_type', NotificationType.ENROLLMENT_AVAILABLE);

        // Remove from waitlist
        await this.removeFromWaitlist(entry.student_id, entry.class_id);
        
        // Process next student
        await this.processWaitlist(entry.class_id);
        
        console.log(`Processed expired notification for student ${entry.student_id} in class ${entry.class_id}`);
      } catch (error) {
        console.error(`Failed to process expired notification for entry ${entry.id}:`, error);
      }
    }
  }

  /**
   * Get waitlist statistics for a class
   */
  async getWaitlistStats(classId: string): Promise<{
    totalWaitlisted: number;
    averageWaitTime: number;
    positionDistribution: Array<{ position: number; count: number }>;
    recentActivity: Array<{ action: string; timestamp: Date; count: number }>;
  }> {
    // Get total waitlisted
    const { data: entries } = await this.supabase
      .from('waitlist_entries')
      .select('position, added_at')
      .eq('class_id', classId);

    const totalWaitlisted = entries?.length || 0;

    // Calculate average wait time (simplified)
    const averageWaitTime = entries?.length > 0 
      ? entries.reduce((sum, entry) => {
          const waitTime = Date.now() - new Date(entry.added_at).getTime();
          return sum + waitTime;
        }, 0) / entries.length / (1000 * 60 * 60 * 24) // Convert to days
      : 0;

    // Position distribution
    const positionDistribution = entries?.reduce((acc, entry) => {
      const existing = acc.find(p => p.position === entry.position);
      if (existing) {
        existing.count++;
      } else {
        acc.push({ position: entry.position, count: 1 });
      }
      return acc;
    }, [] as Array<{ position: number; count: number }>) || [];

    // Recent activity (would be more sophisticated in real implementation)
    const recentActivity = [
      { action: 'joined_waitlist', timestamp: new Date(), count: 0 },
      { action: 'left_waitlist', timestamp: new Date(), count: 0 },
      { action: 'enrolled_from_waitlist', timestamp: new Date(), count: 0 }
    ];

    return {
      totalWaitlisted,
      averageWaitTime,
      positionDistribution,
      recentActivity
    };
  }

  // Private helper methods

  private async calculateNextPosition(classId: string, priority: number): Promise<number> {
    // Get current waitlist entries ordered by priority and time
    const { data: entries } = await this.supabase
      .from('waitlist_entries')
      .select('position, priority, added_at')
      .eq('class_id', classId)
      .order('priority', { ascending: false })
      .order('added_at', { ascending: true });

    if (!entries || entries.length === 0) {
      return 1;
    }

    // Find the correct position based on priority
    let insertPosition = entries.length + 1;
    
    for (let i = 0; i < entries.length; i++) {
      if (priority > entries[i].priority) {
        insertPosition = i + 1;
        break;
      }
    }

    return insertPosition;
  }

  private async reorderWaitlist(classId: string): Promise<void> {
    // Get all waitlist entries for the class
    const { data: entries } = await this.supabase
      .from('waitlist_entries')
      .select('id, priority, added_at')
      .eq('class_id', classId)
      .order('priority', { ascending: false })
      .order('added_at', { ascending: true });

    if (!entries || entries.length === 0) return;

    // Update positions
    const updates = entries.map((entry, index) => ({
      id: entry.id,
      position: index + 1,
      estimated_probability: this.calculateEnrollmentProbability(index + 1)
    }));

    // Batch update positions
    for (const update of updates) {
      await this.supabase
        .from('waitlist_entries')
        .update({
          position: update.position,
          estimated_probability: update.estimated_probability,
          updated_at: new Date().toISOString()
        })
        .eq('id', update.id);
    }
  }

  private calculateEnrollmentProbability(position: number): number {
    // Simple probability calculation based on historical data
    // In a real system, this would use machine learning or historical analysis
    if (position <= 3) return 0.8;
    if (position <= 5) return 0.6;
    if (position <= 10) return 0.4;
    if (position <= 15) return 0.2;
    return 0.1;
  }

  private async enrollFromWaitlist(studentId: string, classId: string): Promise<void> {
    // Create enrollment record
    const { error: enrollError } = await this.supabase
      .from('enrollments')
      .insert({
        student_id: studentId,
        class_id: classId,
        status: EnrollmentStatus.ENROLLED,
        enrolled_at: new Date().toISOString(),
        enrolled_by: 'waitlist_system'
      });

    if (enrollError) throw enrollError;

    // Remove from waitlist
    await this.supabase
      .from('waitlist_entries')
      .delete()
      .eq('student_id', studentId)
      .eq('class_id', classId);

    // Log the enrollment
    await this.logWaitlistAction(
      studentId, 
      classId, 
      AuditAction.ENROLLED, 
      'waitlist_system',
      'Enrolled from waitlist'
    );

    // Reorder remaining waitlist
    await this.reorderWaitlist(classId);
  }

  private async logWaitlistAction(
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
        timestamp: new Date().toISOString(),
        metadata: { source: 'waitlist_manager' }
      });
  }

  /**
   * Send position change notifications
   */
  async notifyPositionChanges(classId: string): Promise<void> {
    // Get all waitlist entries that have moved positions
    const { data: entries } = await this.supabase
      .from('waitlist_entries')
      .select('*')
      .eq('class_id', classId)
      .order('position');

    if (!entries) return;

    // In a real implementation, this would compare with previous positions
    // and send notifications for significant changes
    for (const entry of entries) {
      if (entry.position <= 5) { // Notify top 5 positions
        await this.supabase
          .from('waitlist_notifications')
          .insert({
            waitlist_entry_id: entry.id,
            notification_type: NotificationType.POSITION_CHANGE,
            sent_at: new Date().toISOString()
          });
      }
    }
  }

  /**
   * Send deadline reminders
   */
  async sendDeadlineReminders(): Promise<void> {
    const reminderTime = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours before expiry
    
    const { data: entries } = await this.supabase
      .from('waitlist_entries')
      .select('*')
      .not('notification_expires_at', 'is', null)
      .lt('notification_expires_at', reminderTime.toISOString())
      .is('notified_at', null);

    if (!entries) return;

    for (const entry of entries) {
      await this.supabase
        .from('waitlist_notifications')
        .insert({
          waitlist_entry_id: entry.id,
          notification_type: NotificationType.DEADLINE_REMINDER,
          sent_at: new Date().toISOString(),
          response_deadline: entry.notification_expires_at
        });
    }
  }

  /**
   * Get detailed waitlist information for a student
   */
  async getStudentWaitlistInfo(studentId: string, classId: string): Promise<{
    entry: WaitlistEntry | null;
    position: number;
    estimatedProbability: number;
    estimatedWaitTime: string;
    isNotified: boolean;
    responseDeadline?: Date;
  }> {
    const { data: entry } = await this.supabase
      .from('waitlist_entries')
      .select('*')
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .single();

    if (!entry) {
      return {
        entry: null,
        position: 0,
        estimatedProbability: 0,
        estimatedWaitTime: 'Not on waitlist',
        isNotified: false
      };
    }

    const estimatedWaitTime = this.calculateEstimatedWaitTime(entry.position);
    
    return {
      entry: entry as WaitlistEntry,
      position: entry.position,
      estimatedProbability: entry.estimated_probability,
      estimatedWaitTime,
      isNotified: !!entry.notified_at,
      responseDeadline: entry.notification_expires_at ? new Date(entry.notification_expires_at) : undefined
    };
  }

  /**
   * Bulk process multiple waitlists (useful for system maintenance)
   */
  async bulkProcessWaitlists(classIds: string[]): Promise<{
    processed: number;
    errors: Array<{ classId: string; error: string }>;
  }> {
    let processed = 0;
    const errors: Array<{ classId: string; error: string }> = [];

    for (const classId of classIds) {
      try {
        await this.processWaitlist(classId);
        processed++;
      } catch (error) {
        errors.push({
          classId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { processed, errors };
  }

  /**
   * Calculate estimated wait time based on position and historical data
   */
  private calculateEstimatedWaitTime(position: number): string {
    // Simple estimation - in practice would use historical enrollment data
    const daysPerPosition = 2.5; // Average days per position movement
    const estimatedDays = Math.ceil(position * daysPerPosition);
    
    if (estimatedDays <= 1) {
      return 'Less than 1 day';
    } else if (estimatedDays <= 7) {
      return `${estimatedDays} days`;
    } else if (estimatedDays <= 30) {
      const weeks = Math.ceil(estimatedDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''}`;
    } else {
      const months = Math.ceil(estimatedDays / 30);
      return `${months} month${months > 1 ? 's' : ''}`;
    }
  }

  /**
   * Get waitlist entries for a class with detailed information
   */
  async getClassWaitlist(classId: string): Promise<Array<{
    entry: WaitlistEntry;
    student: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
    estimatedWaitTime: string;
    isNotified: boolean;
    responseDeadline?: Date;
  }>> {
    const { data: entries } = await this.supabase
      .from('waitlist_entries')
      .select(`
        *,
        users!waitlist_entries_student_id_fkey (
          id,
          first_name,
          last_name,
          email
        )
      `)
      .eq('class_id', classId)
      .order('position');

    if (!entries) return [];

    return entries.map(entry => ({
      entry: entry as WaitlistEntry,
      student: {
        id: entry.users.id,
        firstName: entry.users.first_name,
        lastName: entry.users.last_name,
        email: entry.users.email
      },
      estimatedWaitTime: this.calculateEstimatedWaitTime(entry.position),
      isNotified: !!entry.notified_at,
      responseDeadline: entry.notification_expires_at ? new Date(entry.notification_expires_at) : undefined
    }));
  }

  /**
   * Update waitlist position priority (for admin use)
   */
  async updateWaitlistPriority(studentId: string, classId: string, newPriority: number): Promise<void> {
    const { data: db } = await this.supabase.rpc('begin_transaction');
    
    try {
      // Update the priority
      const { error } = await this.supabase
        .from('waitlist_entries')
        .update({
          priority: newPriority,
          updated_at: new Date().toISOString()
        })
        .eq('student_id', studentId)
        .eq('class_id', classId);

      if (error) throw error;

      // Reorder the waitlist
      await this.reorderWaitlist(classId);

      // Log the action
      await this.logWaitlistAction(
        studentId,
        classId,
        AuditAction.APPROVED,
        'admin',
        `Priority updated to ${newPriority}`
      );

      await this.supabase.rpc('commit_transaction');
    } catch (error) {
      await this.supabase.rpc('rollback_transaction');
      throw error;
    }
  }
}