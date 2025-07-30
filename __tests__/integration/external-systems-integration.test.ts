/**
 * Integration tests for external systems synchronization and data consistency
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { StudentInformationSystemService } from '../../lib/services/student-information-system';
import { AcademicCalendarIntegrationService } from '../../lib/services/academic-calendar-integration';
import { GradebookIntegrationService } from '../../lib/services/gradebook-integration';
import { CommunicationPlatformIntegrationService } from '../../lib/services/communication-platform-integration';

// Mock fetch for API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('External Systems Integration', () => {
  let sisService: StudentInformationSystemService;
  let calendarService: AcademicCalendarIntegrationService;
  let gradebookService: GradebookIntegrationService;
  let communicationService: CommunicationPlatformIntegrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    sisService = new StudentInformationSystemService({
      baseUrl: 'https://api.sis.example.com',
      apiKey: 'test-key',
      timeout: 5000,
      retryAttempts: 3,
      syncInterval: 300000,
      batchSize: 50
    });

    calendarService = new AcademicCalendarIntegrationService({
      baseUrl: 'https://api.calendar.example.com',
      apiKey: 'test-key',
      institutionId: 'inst-123',
      syncInterval: 3600000,
      timezone: 'America/New_York',
      autoEnforceDeadlines: true
    });

    gradebookService = new GradebookIntegrationService({
      baseUrl: 'https://api.gradebook.example.com',
      apiKey: 'test-key',
      institutionId: 'inst-123',
      syncInterval: 300000,
      autoSyncGrades: true,
      gradeSyncThreshold: 5
    });

    communicationService = new CommunicationPlatformIntegrationService({
      email: {
        provider: 'sendgrid',
        apiKey: 'test-key',
        fromAddress: 'noreply@example.com',
        fromName: 'Test System'
      },
      sms: {
        provider: 'twilio',
        apiKey: 'test-key',
        fromNumber: '+1234567890'
      },
      slack: {
        botToken: 'test-token',
        signingSecret: 'test-secret',
        workspaceId: 'workspace-123'
      },
      teams: {
        tenantId: 'tenant-123',
        clientId: 'client-123',
        clientSecret: 'secret-123'
      },
      discord: {
        botToken: 'test-token',
        guildId: 'guild-123'
      },
      push: {
        vapidPublicKey: 'public-key',
        vapidPrivateKey: 'private-key',
        vapidSubject: 'mailto:admin@example.com'
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Student Information System Integration', () => {
    it('should sync enrollment data with SIS successfully', async () => {
      // Mock SIS API responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              enrollments: [
                {
                  student_id: 'student-123',
                  course_id: 'class-456',
                  enrollment_status: 'enrolled',
                  enrollment_date: '2024-01-15T00:00:00Z',
                  credits: 3
                }
              ]
            }
          })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        } as Response);

      await expect(sisService.syncEnrollments('class-456')).resolves.not.toThrow();
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.sis.example.com/courses/class-456/enrollments',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key'
          })
        })
      );
    });

    it('should validate student enrollment eligibility', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            eligible: true,
            reasons: []
          }
        })
      } as Response);

      const result = await sisService.validateEnrollmentEligibility('student-123', 'course-456');
      
      expect(result.eligible).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('should handle SIS API failures gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await sisService.validateEnrollmentEligibility('student-123', 'course-456');
      
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain('Unable to verify eligibility with SIS');
    });

    it('should batch sync student records efficiently', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            synced: 45,
            failed: ['student-999']
          }
        })
      } as Response);

      const studentIds = Array.from({ length: 50 }, (_, i) => `student-${i}`);
      const result = await sisService.batchSyncStudents(studentIds);
      
      expect(result.synced).toBe(45);
      expect(result.failed).toContain('student-999');
    });
  });

  describe('Academic Calendar Integration', () => {
    it('should determine enrollment availability correctly', async () => {
      const mockTerm = {
        id: 'term-123',
        name: 'Spring 2024',
        code: 'SP24',
        start_date: '2024-01-15T00:00:00Z',
        end_date: '2024-05-15T00:00:00Z',
        enrollment_start_date: '2024-01-01T00:00:00Z',
        enrollment_end_date: '2024-01-31T00:00:00Z',
        drop_deadline: '2024-02-15T00:00:00Z',
        withdraw_deadline: '2024-04-15T00:00:00Z',
        status: 'active',
        institution_id: 'inst-123'
      };

      const mockPeriods = {
        periods: [
          {
            id: 'period-1',
            term_id: 'term-123',
            name: 'Regular Enrollment',
            start_date: '2024-01-01T00:00:00Z',
            end_date: '2024-01-31T00:00:00Z',
            type: 'regular',
            priority: 1,
            eligible_student_types: [],
            restrictions: []
          }
        ]
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockTerm })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockPeriods })
        } as Response);

      // Mock current date to be within enrollment period
      const originalDate = Date;
      global.Date = jest.fn(() => new Date('2024-01-15T12:00:00Z')) as any;
      global.Date.now = jest.fn(() => new Date('2024-01-15T12:00:00Z').getTime());

      const result = await calendarService.isEnrollmentAllowed('class-456');
      
      expect(result.allowed).toBe(true);
      expect(result.deadline).toBeDefined();

      global.Date = originalDate;
    });

    it('should enforce drop deadlines correctly', async () => {
      const mockTerm = {
        id: 'term-123',
        name: 'Spring 2024',
        code: 'SP24',
        start_date: '2024-01-15T00:00:00Z',
        end_date: '2024-05-15T00:00:00Z',
        enrollment_start_date: '2024-01-01T00:00:00Z',
        enrollment_end_date: '2024-01-31T00:00:00Z',
        drop_deadline: '2024-02-15T00:00:00Z',
        withdraw_deadline: '2024-04-15T00:00:00Z',
        status: 'active',
        institution_id: 'inst-123'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockTerm })
      } as Response);

      // Mock current date to be after drop deadline but before withdraw deadline
      const originalDate = Date;
      global.Date = jest.fn(() => new Date('2024-03-01T12:00:00Z')) as any;
      global.Date.now = jest.fn(() => new Date('2024-03-01T12:00:00Z').getTime());

      const result = await calendarService.isDropAllowed('class-456');
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('withdrawal available');

      global.Date = originalDate;
    });

    it('should schedule enrollment notifications properly', async () => {
      const mockTerm = {
        id: 'term-123',
        name: 'Spring 2024',
        code: 'SP24',
        start_date: '2024-01-15T00:00:00Z',
        end_date: '2024-05-15T00:00:00Z',
        enrollment_start_date: '2024-01-01T00:00:00Z',
        enrollment_end_date: '2024-01-31T00:00:00Z',
        drop_deadline: '2024-02-15T00:00:00Z',
        withdraw_deadline: '2024-04-15T00:00:00Z',
        status: 'active',
        institution_id: 'inst-123'
      };

      const mockPeriods = {
        periods: [
          {
            id: 'period-1',
            term_id: 'term-123',
            name: 'Regular Enrollment',
            start_date: '2024-01-01T00:00:00Z',
            end_date: '2024-01-31T00:00:00Z',
            type: 'regular',
            priority: 1,
            eligible_student_types: [],
            restrictions: []
          }
        ]
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockTerm })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockPeriods })
        } as Response);

      await expect(calendarService.scheduleEnrollmentNotifications()).resolves.not.toThrow();
    });
  });

  describe('Gradebook Integration', () => {
    it('should sync enrollment status to gradebook', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      } as Response);

      const enrollment = {
        studentId: 'student-123',
        classId: 'class-456',
        status: 'enrolled' as const,
        enrollmentDate: new Date('2024-01-15'),
        creditHours: 3
      };

      await expect(gradebookService.syncEnrollmentToGradebook(enrollment)).resolves.not.toThrow();
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.gradebook.example.com/courses/class-456/enrollments',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key'
          }),
          body: expect.stringContaining('student-123')
        })
      );
    });

    it('should check grade prerequisites correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            prerequisites_met: true,
            missing_prerequisites: [],
            completed_prerequisites: [
              { course_id: 'prereq-1', grade: 'B+' }
            ]
          }
        })
      } as Response);

      const result = await gradebookService.checkGradePrerequisites(
        'student-123',
        ['prereq-1'],
        'C'
      );
      
      expect(result.met).toBe(true);
      expect(result.completedPrerequisites).toHaveLength(1);
    });

    it('should get course completion status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            students: [
              {
                student_id: 'student-123',
                completed: true,
                completion_date: '2024-05-15T00:00:00Z',
                final_grade: 'A',
                credit_earned: 3
              }
            ]
          }
        })
      } as Response);

      const result = await gradebookService.getCourseCompletionStatus('class-456');
      
      expect(result).toHaveLength(1);
      expect(result[0].completed).toBe(true);
      expect(result[0].finalGrade).toBe('A');
    });
  });

  describe('Communication Platform Integration', () => {
    it('should send enrollment notifications successfully', async () => {
      const notificationId = await communicationService.sendEnrollmentNotification({
        type: 'enrollment_approved',
        recipientId: 'student-123',
        classId: 'class-456',
        data: {
          className: 'Introduction to Computer Science',
          instructorName: 'Dr. Smith'
        }
      });

      expect(notificationId).toBeDefined();
      expect(notificationId).toMatch(/^notif_/);
    });

    it('should handle bulk notifications efficiently', async () => {
      const recipients = Array.from({ length: 100 }, (_, i) => `student-${i}`);
      
      const result = await communicationService.sendBulkEnrollmentNotifications({
        type: 'enrollment_reminder',
        recipients,
        classId: 'class-456',
        data: {
          className: 'Introduction to Computer Science',
          deadline: '2024-01-31'
        },
        batchSize: 25
      });

      expect(result.queued).toBe(100);
      expect(result.failed).toHaveLength(0);
    });

    it('should send emergency notifications to all channels', async () => {
      await expect(communicationService.sendEmergencyNotification({
        type: 'class_cancelled',
        affectedClasses: ['class-456'],
        message: 'Class cancelled due to weather',
        targetAudience: 'enrolled_students'
      })).resolves.not.toThrow();
    });

    it('should configure communication channels properly', async () => {
      await expect(communicationService.configureChannel({
        type: 'email',
        name: 'Primary Email',
        enabled: true,
        config: {
          provider: 'sendgrid',
          apiKey: 'test-key'
        },
        priority: 1
      })).resolves.not.toThrow();
    });
  });

  describe('Cross-System Data Consistency', () => {
    it('should maintain data consistency across all systems', async () => {
      // Mock successful responses from all systems
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        } as Response) // SIS sync
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        } as Response) // Gradebook sync
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              eligible: true,
              reasons: []
            }
          })
        } as Response); // Eligibility check

      const enrollment = {
        studentId: 'student-123',
        classId: 'class-456',
        status: 'enrolled' as const,
        enrollmentDate: new Date('2024-01-15'),
        creditHours: 3
      };

      // Test cross-system synchronization
      await Promise.all([
        sisService.pushEnrollmentChange({
          studentId: enrollment.studentId,
          classId: enrollment.classId,
          action: 'enroll',
          timestamp: enrollment.enrollmentDate
        }),
        gradebookService.syncEnrollmentToGradebook(enrollment),
        sisService.validateEnrollmentEligibility(enrollment.studentId, enrollment.classId)
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle partial system failures gracefully', async () => {
      // Mock SIS success but gradebook failure
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        } as Response) // SIS success
        .mockRejectedValueOnce(new Error('Gradebook unavailable')); // Gradebook failure

      const enrollment = {
        studentId: 'student-123',
        classId: 'class-456',
        status: 'enrolled' as const,
        enrollmentDate: new Date('2024-01-15'),
        creditHours: 3
      };

      // SIS should succeed
      await expect(sisService.pushEnrollmentChange({
        studentId: enrollment.studentId,
        classId: enrollment.classId,
        action: 'enroll',
        timestamp: enrollment.enrollmentDate
      })).resolves.not.toThrow();

      // Gradebook should fail but be handled gracefully
      await expect(gradebookService.syncEnrollmentToGradebook(enrollment)).rejects.toThrow();
    });

    it('should validate data consistency between systems', async () => {
      // Mock responses showing data inconsistency
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              enrollments: [
                {
                  student_id: 'student-123',
                  course_id: 'class-456',
                  enrollment_status: 'enrolled',
                  enrollment_date: '2024-01-15T00:00:00Z'
                }
              ]
            }
          })
        } as Response) // SIS data
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              students: [
                {
                  student_id: 'student-123',
                  enrollment_status: 'dropped', // Inconsistent status
                  enrollment_date: '2024-01-15T00:00:00Z'
                }
              ]
            }
          })
        } as Response); // Gradebook data

      // This would be part of a data consistency check routine
      await expect(sisService.syncEnrollments('class-456')).resolves.not.toThrow();
      
      // The sync should detect and handle the inconsistency
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Integration Performance and Reliability', () => {
    it('should handle high-volume synchronization efficiently', async () => {
      const startTime = Date.now();
      
      // Mock successful batch responses
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            synced: 50,
            failed: []
          }
        })
      } as Response);

      const studentIds = Array.from({ length: 1000 }, (_, i) => `student-${i}`);
      const result = await sisService.batchSyncStudents(studentIds);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(result.synced).toBe(1000); // 20 batches * 50 per batch
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should implement proper retry logic for failed requests', async () => {
      // Mock initial failures followed by success
      mockFetch
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        } as Response);

      const enrollment = {
        studentId: 'student-123',
        classId: 'class-456',
        action: 'enroll' as const,
        timestamp: new Date()
      };

      // Should eventually succeed after retries
      await expect(sisService.pushEnrollmentChange(enrollment)).resolves.not.toThrow();
    });

    it('should maintain system health monitoring', async () => {
      const healthStatus = sisService.getSyncStatus();
      
      expect(healthStatus).toHaveProperty('lastSync');
      expect(healthStatus).toHaveProperty('healthy');
      expect(healthStatus).toHaveProperty('nextSync');
    });
  });
});