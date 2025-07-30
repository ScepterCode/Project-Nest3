/**
 * Background Job Processor for enrollment system
 * Handles waitlist management, notifications, and other async operations
 */

import { createClient } from '@/lib/supabase/server';
import { cacheManager } from './cache-manager';

interface Job {
  id: string;
  type: JobType;
  payload: any;
  priority: number;
  scheduledAt: Date;
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  error?: string;
}

enum JobType {
  PROCESS_WAITLIST = 'process_waitlist',
  SEND_NOTIFICATION = 'send_notification',
  CLEANUP_EXPIRED_REQUESTS = 'cleanup_expired_requests',
  UPDATE_ENROLLMENT_STATS = 'update_enrollment_stats',
  SEND_DEADLINE_REMINDERS = 'send_deadline_reminders',
  PROCESS_BULK_ENROLLMENT = 'process_bulk_enrollment',
  GENERATE_REPORTS = 'generate_reports',
  CACHE_WARMUP = 'cache_warmup'
}

export class BackgroundJobProcessor {
  private supabase = createClient();
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private jobHandlers: Map<JobType, (payload: any) => Promise<void>> = new Map();

  constructor() {
    this.initializeJobHandlers();
  }

  private initializeJobHandlers() {
    this.jobHandlers.set(JobType.PROCESS_WAITLIST, this.processWaitlist.bind(this));
    this.jobHandlers.set(JobType.SEND_NOTIFICATION, this.sendNotification.bind(this));
    this.jobHandlers.set(JobType.CLEANUP_EXPIRED_REQUESTS, this.cleanupExpiredRequests.bind(this));
    this.jobHandlers.set(JobType.UPDATE_ENROLLMENT_STATS, this.updateEnrollmentStats.bind(this));
    this.jobHandlers.set(JobType.SEND_DEADLINE_REMINDERS, this.sendDeadlineReminders.bind(this));
    this.jobHandlers.set(JobType.PROCESS_BULK_ENROLLMENT, this.processBulkEnrollment.bind(this));
    this.jobHandlers.set(JobType.GENERATE_REPORTS, this.generateReports.bind(this));
    this.jobHandlers.set(JobType.CACHE_WARMUP, this.cacheWarmup.bind(this));
  }

  /**
   * Start the background job processor
   */
  start(intervalMs: number = 5000): void {
    if (this.processingInterval) {
      return;
    }

    console.log('Starting background job processor...');
    this.processingInterval = setInterval(() => {
      this.processJobs();
    }, intervalMs);

    // Process jobs immediately
    this.processJobs();
  }

  /**
   * Stop the background job processor
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('Background job processor stopped');
    }
  }

  /**
   * Add a job to the queue
   */
  async addJob(
    type: JobType,
    payload: any,
    options: {
      priority?: number;
      scheduledAt?: Date;
      maxAttempts?: number;
    } = {}
  ): Promise<string> {
    const job: Omit<Job, 'id'> = {
      type,
      payload,
      priority: options.priority || 0,
      scheduledAt: options.scheduledAt || new Date(),
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const { data, error } = await this.supabase
      .from('background_jobs')
      .insert(job)
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to add job: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Process pending jobs
   */
  private async processJobs(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get pending jobs ordered by priority and scheduled time
      const { data: jobs, error } = await this.supabase
        .from('background_jobs')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_at', new Date().toISOString())
        .order('priority', { ascending: false })
        .order('scheduled_at', { ascending: true })
        .limit(10);

      if (error) {
        console.error('Failed to fetch jobs:', error);
        return;
      }

      if (!jobs || jobs.length === 0) {
        return;
      }

      console.log(`Processing ${jobs.length} background jobs...`);

      // Process jobs concurrently with limited concurrency
      const concurrency = 3;
      const chunks = this.chunkArray(jobs, concurrency);

      for (const chunk of chunks) {
        await Promise.all(chunk.map(job => this.processJob(job)));
      }
    } catch (error) {
      console.error('Error processing jobs:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job): Promise<void> {
    try {
      // Mark job as processing
      await this.updateJobStatus(job.id, 'processing');

      const handler = this.jobHandlers.get(job.type);
      if (!handler) {
        throw new Error(`No handler found for job type: ${job.type}`);
      }

      // Execute the job
      await handler(job.payload);

      // Mark job as completed
      await this.updateJobStatus(job.id, 'completed');
      console.log(`Job ${job.id} (${job.type}) completed successfully`);

    } catch (error) {
      console.error(`Job ${job.id} (${job.type}) failed:`, error);

      // Increment attempts and handle retry logic
      const newAttempts = job.attempts + 1;
      
      if (newAttempts >= job.maxAttempts) {
        // Mark as failed if max attempts reached
        await this.updateJobStatus(job.id, 'failed', error.message);
      } else {
        // Schedule retry with exponential backoff
        const retryDelay = Math.pow(2, newAttempts) * 1000; // 2s, 4s, 8s, etc.
        const scheduledAt = new Date(Date.now() + retryDelay);
        
        await this.supabase
          .from('background_jobs')
          .update({
            status: 'pending',
            attempts: newAttempts,
            scheduled_at: scheduledAt.toISOString(),
            error: error.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id);
      }
    }
  }

  /**
   * Update job status
   */
  private async updateJobStatus(jobId: string, status: Job['status'], error?: string): Promise<void> {
    const updates: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (error) {
      updates.error = error;
    }

    await this.supabase
      .from('background_jobs')
      .update(updates)
      .eq('id', jobId);
  }

  /**
   * Job Handlers
   */

  private async processWaitlist(payload: { classId: string }): Promise<void> {
    const { classId } = payload;

    // Get class capacity and current enrollment
    const { data: classData } = await this.supabase
      .from('classes')
      .select('capacity, current_enrollment')
      .eq('id', classId)
      .single();

    if (!classData) {
      throw new Error(`Class ${classId} not found`);
    }

    const availableSpots = classData.capacity - classData.current_enrollment;
    if (availableSpots <= 0) {
      return; // No spots available
    }

    // Get waitlisted students in order
    const { data: waitlistEntries } = await this.supabase
      .from('waitlist_entries')
      .select('*')
      .eq('class_id', classId)
      .order('priority', { ascending: false })
      .order('added_at', { ascending: true })
      .limit(availableSpots);

    if (!waitlistEntries || waitlistEntries.length === 0) {
      return;
    }

    // Process each waitlist entry
    for (const entry of waitlistEntries) {
      try {
        // Send enrollment opportunity notification
        await this.addJob(JobType.SEND_NOTIFICATION, {
          type: 'waitlist_enrollment_available',
          studentId: entry.student_id,
          classId: entry.class_id,
          responseDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        });

        // Update waitlist entry with notification timestamp
        await this.supabase
          .from('waitlist_entries')
          .update({
            notified_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          })
          .eq('id', entry.id);

      } catch (error) {
        console.error(`Failed to process waitlist entry ${entry.id}:`, error);
      }
    }

    // Invalidate related caches
    cacheManager.invalidatePattern('waitlist-positions', `.*:${classId}`);
    cacheManager.invalidatePattern('class-discovery', '.*');
  }

  private async sendNotification(payload: {
    type: string;
    studentId: string;
    classId?: string;
    message?: string;
    responseDeadline?: Date;
  }): Promise<void> {
    const { type, studentId, classId, message, responseDeadline } = payload;

    // Get student information
    const { data: student } = await this.supabase
      .from('users')
      .select('email, first_name, notification_preferences')
      .eq('id', studentId)
      .single();

    if (!student) {
      throw new Error(`Student ${studentId} not found`);
    }

    // Get class information if provided
    let classInfo = null;
    if (classId) {
      const { data } = await this.supabase
        .from('classes')
        .select('name, code')
        .eq('id', classId)
        .single();
      classInfo = data;
    }

    // Create notification record
    await this.supabase
      .from('notifications')
      .insert({
        user_id: studentId,
        type,
        title: this.getNotificationTitle(type, classInfo),
        message: message || this.getNotificationMessage(type, classInfo),
        data: {
          classId,
          responseDeadline: responseDeadline?.toISOString()
        },
        created_at: new Date().toISOString()
      });

    // Send email notification if enabled
    const preferences = student.notification_preferences || {};
    if (preferences.email !== false) {
      // In a real implementation, you would integrate with an email service
      console.log(`Email notification sent to ${student.email}: ${type}`);
    }

    // Send push notification if enabled
    if (preferences.push !== false) {
      // In a real implementation, you would integrate with a push notification service
      console.log(`Push notification sent to ${studentId}: ${type}`);
    }
  }

  private async cleanupExpiredRequests(payload: {}): Promise<void> {
    const now = new Date().toISOString();

    // Clean up expired enrollment requests
    const { data: expiredRequests } = await this.supabase
      .from('enrollment_requests')
      .select('id, student_id, class_id')
      .eq('status', 'pending')
      .lt('expires_at', now);

    if (expiredRequests && expiredRequests.length > 0) {
      // Update expired requests
      await this.supabase
        .from('enrollment_requests')
        .update({ status: 'expired' })
        .in('id', expiredRequests.map(r => r.id));

      // Send notifications about expired requests
      for (const request of expiredRequests) {
        await this.addJob(JobType.SEND_NOTIFICATION, {
          type: 'enrollment_request_expired',
          studentId: request.student_id,
          classId: request.class_id
        });
      }
    }

    // Clean up expired waitlist notifications
    const { data: expiredWaitlist } = await this.supabase
      .from('waitlist_entries')
      .select('id, student_id, class_id')
      .not('expires_at', 'is', null)
      .lt('expires_at', now);

    if (expiredWaitlist && expiredWaitlist.length > 0) {
      // Remove expired waitlist entries
      await this.supabase
        .from('waitlist_entries')
        .delete()
        .in('id', expiredWaitlist.map(w => w.id));

      // Update waitlist positions for remaining entries
      for (const entry of expiredWaitlist) {
        await this.addJob(JobType.PROCESS_WAITLIST, {
          classId: entry.class_id
        });
      }
    }
  }

  private async updateEnrollmentStats(payload: { classIds?: string[] }): Promise<void> {
    let classIds = payload.classIds;

    if (!classIds) {
      // Get all active classes if no specific classes provided
      const { data: classes } = await this.supabase
        .from('classes')
        .select('id')
        .eq('status', 'active');
      
      classIds = classes?.map(c => c.id) || [];
    }

    for (const classId of classIds) {
      try {
        // Calculate enrollment statistics
        const { data: stats } = await this.supabase
          .rpc('get_enrollment_statistics_batch', {
            class_ids: [classId]
          });

        if (stats && stats.length > 0) {
          const stat = stats[0];
          
          // Update or insert enrollment statistics
          await this.supabase
            .from('enrollment_statistics')
            .upsert({
              class_id: classId,
              total_enrolled: stat.total_enrolled,
              total_pending: stat.total_pending,
              total_waitlisted: stat.total_waitlisted,
              available_spots: stat.available_spots,
              waitlist_available: stat.waitlist_available,
              updated_at: new Date().toISOString()
            });
        }
      } catch (error) {
        console.error(`Failed to update stats for class ${classId}:`, error);
      }
    }

    // Invalidate enrollment data cache
    cacheManager.invalidate('enrollment-data');
  }

  private async sendDeadlineReminders(payload: {}): Promise<void> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    // Find classes with enrollment deadlines tomorrow
    const { data: classes } = await this.supabase
      .from('classes')
      .select('id, name, code, enrollment_end')
      .not('enrollment_end', 'is', null)
      .gte('enrollment_end', new Date().toISOString())
      .lte('enrollment_end', tomorrow.toISOString());

    if (!classes || classes.length === 0) {
      return;
    }

    for (const classData of classes) {
      // Get students who might be interested (have viewed the class recently)
      const { data: interestedStudents } = await this.supabase
        .from('class_views')
        .select('student_id')
        .eq('class_id', classData.id)
        .gte('viewed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
        .not('student_id', 'in', `(
          SELECT student_id FROM enrollments WHERE class_id = '${classData.id}'
          UNION
          SELECT student_id FROM enrollment_requests WHERE class_id = '${classData.id}' AND status = 'pending'
        )`);

      if (interestedStudents && interestedStudents.length > 0) {
        for (const student of interestedStudents) {
          await this.addJob(JobType.SEND_NOTIFICATION, {
            type: 'enrollment_deadline_reminder',
            studentId: student.student_id,
            classId: classData.id,
            message: `Enrollment for ${classData.name} (${classData.code}) ends tomorrow!`
          });
        }
      }
    }
  }

  private async processBulkEnrollment(payload: {
    studentIds: string[];
    classId: string;
    enrolledBy: string;
  }): Promise<void> {
    const { studentIds, classId, enrolledBy } = payload;

    for (const studentId of studentIds) {
      try {
        // Check if student is already enrolled
        const { data: existingEnrollment } = await this.supabase
          .from('enrollments')
          .select('id')
          .eq('student_id', studentId)
          .eq('class_id', classId)
          .single();

        if (existingEnrollment) {
          continue; // Skip if already enrolled
        }

        // Create enrollment
        await this.supabase
          .from('enrollments')
          .insert({
            student_id: studentId,
            class_id: classId,
            status: 'enrolled',
            enrolled_by: enrolledBy,
            enrolled_at: new Date().toISOString()
          });

        // Send confirmation notification
        await this.addJob(JobType.SEND_NOTIFICATION, {
          type: 'enrollment_confirmed',
          studentId,
          classId
        });

        // Remove from waitlist if present
        await this.supabase
          .from('waitlist_entries')
          .delete()
          .eq('student_id', studentId)
          .eq('class_id', classId);

      } catch (error) {
        console.error(`Failed to enroll student ${studentId}:`, error);
      }
    }

    // Update enrollment statistics
    await this.addJob(JobType.UPDATE_ENROLLMENT_STATS, {
      classIds: [classId]
    });
  }

  private async generateReports(payload: {
    reportType: string;
    parameters: any;
  }): Promise<void> {
    const { reportType, parameters } = payload;

    switch (reportType) {
      case 'enrollment_summary':
        await this.generateEnrollmentSummaryReport(parameters);
        break;
      case 'waitlist_analysis':
        await this.generateWaitlistAnalysisReport(parameters);
        break;
      case 'capacity_utilization':
        await this.generateCapacityUtilizationReport(parameters);
        break;
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }
  }

  private async cacheWarmup(payload: {
    classIds?: string[];
    studentIds?: string[];
  }): Promise<void> {
    const { classIds, studentIds } = payload;

    // Warm up frequently accessed data
    if (classIds) {
      for (const classId of classIds) {
        // Pre-load class details
        const { data: classData } = await this.supabase
          .from('classes')
          .select('*')
          .eq('id', classId)
          .single();

        if (classData) {
          cacheManager.set('class-details', `details:${classId}`, classData);
        }
      }
    }

    if (studentIds && classIds) {
      // Pre-load eligibility checks
      for (const studentId of studentIds) {
        for (const classId of classIds) {
          // This would trigger eligibility check and cache the result
          // In a real implementation, you'd call the eligibility service
        }
      }
    }
  }

  /**
   * Helper methods
   */

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private getNotificationTitle(type: string, classInfo?: any): string {
    switch (type) {
      case 'waitlist_enrollment_available':
        return `Enrollment Available: ${classInfo?.name || 'Class'}`;
      case 'enrollment_confirmed':
        return `Enrollment Confirmed: ${classInfo?.name || 'Class'}`;
      case 'enrollment_deadline_reminder':
        return `Enrollment Deadline Reminder`;
      case 'enrollment_request_expired':
        return `Enrollment Request Expired`;
      default:
        return 'Enrollment Notification';
    }
  }

  private getNotificationMessage(type: string, classInfo?: any): string {
    switch (type) {
      case 'waitlist_enrollment_available':
        return `A spot has opened up in ${classInfo?.name || 'your waitlisted class'}. You have 24 hours to accept this enrollment opportunity.`;
      case 'enrollment_confirmed':
        return `You have been successfully enrolled in ${classInfo?.name || 'the class'}.`;
      case 'enrollment_deadline_reminder':
        return `Enrollment deadline is approaching. Don't miss your chance to enroll!`;
      case 'enrollment_request_expired':
        return `Your enrollment request has expired. Please submit a new request if you're still interested.`;
      default:
        return 'You have a new enrollment notification.';
    }
  }

  private async generateEnrollmentSummaryReport(parameters: any): Promise<void> {
    // Implementation for enrollment summary report
    console.log('Generating enrollment summary report...');
  }

  private async generateWaitlistAnalysisReport(parameters: any): Promise<void> {
    // Implementation for waitlist analysis report
    console.log('Generating waitlist analysis report...');
  }

  private async generateCapacityUtilizationReport(parameters: any): Promise<void> {
    // Implementation for capacity utilization report
    console.log('Generating capacity utilization report...');
  }
}

// Create and export singleton instance
export const backgroundJobProcessor = new BackgroundJobProcessor();

// Auto-start in production
if (process.env.NODE_ENV === 'production') {
  backgroundJobProcessor.start();
}