import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { createClient } from '@/lib/supabase/server';
import { EnrollmentManager } from './enrollment-manager';
import { WaitlistManager } from './waitlist-manager';
import {
  EnrollmentStatus,
  WaitlistEntry,
  Enrollment,
  RealtimeEnrollmentEvent,
  RealtimeWaitlistEvent,
  RealtimeEventType
} from '@/lib/types/enrollment';

export class RealtimeEnrollmentService {
  private io: SocketIOServer | null = null;
  private supabase = createClient();
  private enrollmentManager = new EnrollmentManager();
  private waitlistManager = new WaitlistManager();
  private enrollmentLocks = new Map<string, Promise<any>>();

  /**
   * Initialize WebSocket server
   */
  initialize(server: HTTPServer): void {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling']
    });

    this.setupEventHandlers();
    this.setupSupabaseRealtimeSubscriptions();
    console.log('Real-time enrollment service initialized');
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Join class-specific rooms for enrollment updates
      socket.on('join-class', (classId: string) => {
        socket.join(`class-${classId}`);
        console.log(`Client ${socket.id} joined class room: ${classId}`);
      });

      // Join student-specific room for personal notifications
      socket.on('join-student', (studentId: string) => {
        socket.join(`student-${studentId}`);
        console.log(`Client ${socket.id} joined student room: ${studentId}`);
      });

      // Join teacher-specific room for roster updates
      socket.on('join-teacher', (teacherId: string) => {
        socket.join(`teacher-${teacherId}`);
        console.log(`Client ${socket.id} joined teacher room: ${teacherId}`);
      });

      // Handle enrollment requests with race condition prevention
      socket.on('request-enrollment', async (data: {
        studentId: string;
        classId: string;
        justification?: string;
      }) => {
        try {
          const result = await this.handleConcurrentEnrollment(
            data.studentId,
            data.classId,
            data.justification
          );
          
          socket.emit('enrollment-result', result);
          
          // Broadcast updates to relevant rooms
          if (result.success) {
            await this.broadcastEnrollmentUpdate(data.classId, data.studentId, result.status);
          }
        } catch (error) {
          socket.emit('enrollment-error', {
            message: 'Failed to process enrollment request',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Handle waitlist responses
      socket.on('waitlist-response', async (data: {
        studentId: string;
        classId: string;
        response: 'accept' | 'decline';
      }) => {
        try {
          await this.waitlistManager.handleWaitlistResponse(
            data.studentId,
            data.classId,
            data.response
          );

          // Broadcast waitlist updates
          await this.broadcastWaitlistUpdate(data.classId);
          
          socket.emit('waitlist-response-confirmed', {
            success: true,
            response: data.response
          });
        } catch (error) {
          socket.emit('waitlist-response-error', {
            message: 'Failed to process waitlist response',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Setup Supabase real-time subscriptions for database changes
   */
  private setupSupabaseRealtimeSubscriptions(): void {
    // Subscribe to enrollment changes
    this.supabase
      .channel('enrollments')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'enrollments'
      }, async (payload) => {
        await this.handleEnrollmentChange(payload);
      })
      .subscribe();

    // Subscribe to waitlist changes
    this.supabase
      .channel('waitlist_entries')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'waitlist_entries'
      }, async (payload) => {
        await this.handleWaitlistChange(payload);
      })
      .subscribe();

    // Subscribe to class capacity changes
    this.supabase
      .channel('classes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'classes',
        filter: 'capacity=neq.old.capacity'
      }, async (payload) => {
        await this.handleCapacityChange(payload);
      })
      .subscribe();
  }

  /**
   * Handle concurrent enrollment requests with race condition prevention
   */
  private async handleConcurrentEnrollment(
    studentId: string,
    classId: string,
    justification?: string
  ): Promise<any> {
    const lockKey = `${studentId}-${classId}`;
    
    // Check if there's already a pending enrollment for this student/class combination
    if (this.enrollmentLocks.has(lockKey)) {
      throw new Error('Enrollment request already in progress');
    }

    // Create a lock for this enrollment request
    const enrollmentPromise = this.processEnrollmentWithLock(studentId, classId, justification);
    this.enrollmentLocks.set(lockKey, enrollmentPromise);

    try {
      const result = await enrollmentPromise;
      return result;
    } finally {
      // Always remove the lock when done
      this.enrollmentLocks.delete(lockKey);
    }
  }

  /**
   * Process enrollment with database-level locking
   */
  private async processEnrollmentWithLock(
    studentId: string,
    classId: string,
    justification?: string
  ): Promise<any> {
    // Use database transaction with row-level locking
    const { data: db } = await this.supabase.rpc('begin_transaction');
    
    try {
      // Lock the class row to prevent concurrent modifications
      await this.supabase.rpc('lock_class_for_enrollment', { class_id: classId });
      
      // Process the enrollment request
      const result = await this.enrollmentManager.requestEnrollment(
        studentId,
        classId,
        justification
      );

      await this.supabase.rpc('commit_transaction');
      return result;
    } catch (error) {
      await this.supabase.rpc('rollback_transaction');
      throw error;
    }
  }

  /**
   * Handle enrollment database changes
   */
  private async handleEnrollmentChange(payload: any): Promise<void> {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    if (!newRecord?.class_id) return;

    const classId = newRecord.class_id;
    const studentId = newRecord.student_id;

    // Broadcast enrollment count updates
    await this.broadcastEnrollmentCountUpdate(classId);

    // Handle specific enrollment events
    switch (eventType) {
      case 'INSERT':
        if (newRecord.status === EnrollmentStatus.ENROLLED) {
          await this.broadcastEnrollmentUpdate(classId, studentId, EnrollmentStatus.ENROLLED);
          // Process waitlist for newly available spots
          await this.waitlistManager.processWaitlist(classId);
        }
        break;

      case 'UPDATE':
        if (oldRecord.status !== newRecord.status) {
          await this.broadcastEnrollmentUpdate(classId, studentId, newRecord.status);
          
          // If student dropped, process waitlist
          if (newRecord.status === EnrollmentStatus.DROPPED) {
            await this.waitlistManager.processWaitlist(classId);
          }
        }
        break;

      case 'DELETE':
        await this.broadcastEnrollmentUpdate(classId, studentId, EnrollmentStatus.DROPPED);
        await this.waitlistManager.processWaitlist(classId);
        break;
    }
  }

  /**
   * Handle waitlist database changes
   */
  private async handleWaitlistChange(payload: any): Promise<void> {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    if (!newRecord?.class_id && !oldRecord?.class_id) return;

    const classId = newRecord?.class_id || oldRecord?.class_id;
    const studentId = newRecord?.student_id || oldRecord?.student_id;

    // Broadcast waitlist updates
    await this.broadcastWaitlistUpdate(classId);

    // Handle specific waitlist events
    switch (eventType) {
      case 'INSERT':
        await this.notifyWaitlistJoined(studentId, classId, newRecord.position);
        break;

      case 'UPDATE':
        if (oldRecord.position !== newRecord.position) {
          await this.notifyWaitlistPositionChange(studentId, classId, newRecord.position, oldRecord.position);
        }
        
        if (newRecord.notified_at && !oldRecord.notified_at) {
          await this.notifyWaitlistAdvancement(studentId, classId);
        }
        break;

      case 'DELETE':
        await this.notifyWaitlistRemoved(studentId, classId);
        break;
    }
  }

  /**
   * Handle class capacity changes
   */
  private async handleCapacityChange(payload: any): Promise<void> {
    const { new: newRecord, old: oldRecord } = payload;
    
    if (!newRecord?.id) return;

    const classId = newRecord.id;
    const oldCapacity = oldRecord.capacity;
    const newCapacity = newRecord.capacity;

    // If capacity increased, process waitlist
    if (newCapacity > oldCapacity) {
      await this.waitlistManager.processWaitlist(classId);
    }

    // Broadcast capacity update
    await this.broadcastCapacityUpdate(classId, newCapacity, oldCapacity);
  }

  /**
   * Broadcast enrollment count updates to class room
   */
  private async broadcastEnrollmentCountUpdate(classId: string): Promise<void> {
    if (!this.io) return;

    try {
      // Get current enrollment statistics
      const { data: stats } = await this.supabase
        .from('enrollment_statistics')
        .select('*')
        .eq('class_id', classId)
        .single();

      if (stats) {
        const event: RealtimeEnrollmentEvent = {
          type: RealtimeEventType.ENROLLMENT_COUNT_UPDATE,
          classId,
          data: {
            currentEnrollment: stats.total_enrolled,
            capacity: stats.capacity,
            availableSpots: Math.max(0, stats.capacity - stats.total_enrolled),
            waitlistCount: stats.total_waitlisted
          },
          timestamp: new Date()
        };

        this.io.to(`class-${classId}`).emit('enrollment-count-update', event);
      }
    } catch (error) {
      console.error('Failed to broadcast enrollment count update:', error);
    }
  }

  /**
   * Broadcast enrollment status updates
   */
  private async broadcastEnrollmentUpdate(
    classId: string,
    studentId: string,
    status: EnrollmentStatus
  ): Promise<void> {
    if (!this.io) return;

    const event: RealtimeEnrollmentEvent = {
      type: RealtimeEventType.ENROLLMENT_STATUS_CHANGE,
      classId,
      studentId,
      data: { status },
      timestamp: new Date()
    };

    // Broadcast to class room
    this.io.to(`class-${classId}`).emit('enrollment-update', event);
    
    // Send personal notification to student
    this.io.to(`student-${studentId}`).emit('personal-enrollment-update', event);
  }

  /**
   * Broadcast waitlist updates
   */
  private async broadcastWaitlistUpdate(classId: string): Promise<void> {
    if (!this.io) return;

    try {
      const stats = await this.waitlistManager.getWaitlistStats(classId);
      
      const event: RealtimeWaitlistEvent = {
        type: RealtimeEventType.WAITLIST_UPDATE,
        classId,
        data: {
          totalWaitlisted: stats.totalWaitlisted,
          averageWaitTime: stats.averageWaitTime,
          positionDistribution: stats.positionDistribution
        },
        timestamp: new Date()
      };

      this.io.to(`class-${classId}`).emit('waitlist-update', event);
    } catch (error) {
      console.error('Failed to broadcast waitlist update:', error);
    }
  }

  /**
   * Notify student of waitlist position change
   */
  private async notifyWaitlistPositionChange(
    studentId: string,
    classId: string,
    newPosition: number,
    oldPosition: number
  ): Promise<void> {
    if (!this.io) return;

    const event: RealtimeWaitlistEvent = {
      type: RealtimeEventType.WAITLIST_POSITION_CHANGE,
      classId,
      studentId,
      data: {
        newPosition,
        oldPosition,
        positionChange: oldPosition - newPosition
      },
      timestamp: new Date()
    };

    this.io.to(`student-${studentId}`).emit('waitlist-position-change', event);
  }

  /**
   * Notify student of waitlist advancement opportunity
   */
  private async notifyWaitlistAdvancement(studentId: string, classId: string): Promise<void> {
    if (!this.io) return;

    const event: RealtimeWaitlistEvent = {
      type: RealtimeEventType.WAITLIST_ADVANCEMENT,
      classId,
      studentId,
      data: {
        message: 'A spot is now available! You have 24 hours to respond.',
        responseDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000)
      },
      timestamp: new Date()
    };

    this.io.to(`student-${studentId}`).emit('waitlist-advancement', event);
  }

  /**
   * Notify student joined waitlist
   */
  private async notifyWaitlistJoined(
    studentId: string,
    classId: string,
    position: number
  ): Promise<void> {
    if (!this.io) return;

    const event: RealtimeWaitlistEvent = {
      type: RealtimeEventType.WAITLIST_JOINED,
      classId,
      studentId,
      data: { position },
      timestamp: new Date()
    };

    this.io.to(`student-${studentId}`).emit('waitlist-joined', event);
  }

  /**
   * Notify student removed from waitlist
   */
  private async notifyWaitlistRemoved(studentId: string, classId: string): Promise<void> {
    if (!this.io) return;

    const event: RealtimeWaitlistEvent = {
      type: RealtimeEventType.WAITLIST_REMOVED,
      classId,
      studentId,
      data: {},
      timestamp: new Date()
    };

    this.io.to(`student-${studentId}`).emit('waitlist-removed', event);
  }

  /**
   * Broadcast capacity updates
   */
  private async broadcastCapacityUpdate(
    classId: string,
    newCapacity: number,
    oldCapacity: number
  ): Promise<void> {
    if (!this.io) return;

    const event: RealtimeEnrollmentEvent = {
      type: RealtimeEventType.CAPACITY_CHANGE,
      classId,
      data: {
        newCapacity,
        oldCapacity,
        capacityChange: newCapacity - oldCapacity
      },
      timestamp: new Date()
    };

    this.io.to(`class-${classId}`).emit('capacity-update', event);
  }

  /**
   * Get real-time enrollment statistics for a class
   */
  async getRealtimeStats(classId: string): Promise<{
    enrollment: {
      current: number;
      capacity: number;
      available: number;
    };
    waitlist: {
      total: number;
      averageWaitTime: number;
    };
    activity: {
      recentEnrollments: number;
      recentDrops: number;
      waitlistMovement: number;
    };
  }> {
    const { data: enrollmentStats } = await this.supabase
      .from('enrollment_statistics')
      .select('*')
      .eq('class_id', classId)
      .single();

    const waitlistStats = await this.waitlistManager.getWaitlistStats(classId);

    // Get recent activity (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { data: recentActivity } = await this.supabase
      .from('enrollment_audit_log')
      .select('action')
      .eq('class_id', classId)
      .gte('timestamp', yesterday.toISOString());

    const activityCounts = recentActivity?.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    return {
      enrollment: {
        current: enrollmentStats?.total_enrolled || 0,
        capacity: enrollmentStats?.capacity || 0,
        available: Math.max(0, (enrollmentStats?.capacity || 0) - (enrollmentStats?.total_enrolled || 0))
      },
      waitlist: {
        total: waitlistStats.totalWaitlisted,
        averageWaitTime: waitlistStats.averageWaitTime
      },
      activity: {
        recentEnrollments: activityCounts['enrolled'] || 0,
        recentDrops: activityCounts['dropped'] || 0,
        waitlistMovement: activityCounts['waitlisted'] || 0
      }
    };
  }

  /**
   * Force refresh all real-time data for a class
   */
  async refreshClassData(classId: string): Promise<void> {
    await Promise.all([
      this.broadcastEnrollmentCountUpdate(classId),
      this.broadcastWaitlistUpdate(classId)
    ]);
  }

  /**
   * Get connected clients count for monitoring
   */
  getConnectedClientsCount(): number {
    return this.io?.engine.clientsCount || 0;
  }

  /**
   * Get room information for debugging
   */
  getRoomInfo(): Record<string, number> {
    if (!this.io) return {};

    const rooms: Record<string, number> = {};
    this.io.sockets.adapter.rooms.forEach((sockets, room) => {
      if (!room.startsWith('class-') && !room.startsWith('student-') && !room.startsWith('teacher-')) {
        return; // Skip individual socket rooms
      }
      rooms[room] = sockets.size;
    });

    return rooms;
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async cleanup(): Promise<void> {
    if (this.io) {
      this.io.close();
      console.log('Real-time enrollment service shut down');
    }
  }
}

// Singleton instance
export const realtimeEnrollmentService = new RealtimeEnrollmentService();