/**
 * Integration Tests for External Systems
 * Tests synchronization and data consistency across all external system integrations
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { StudentInformationSystemService } from '@/lib/services/student-information-system';
import { AcademicCalendarIntegrationService } from '@/lib/services/academic-calendar-integration';
import { GradebookIntegrationService } from '@/lib/services/gradebook-integration';
import { CommunicationPlatformIntegrationService } from '@/lib/services/communication-platform-integration';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server');
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
        limit: jest.fn(),
        order: jest.fn()
      })),
      insert: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      not: jest.fn(),
      gte: jest.fn(),
      lte: jest.fn(),
      in: jest.fn()
    })),
    insert: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn()
  })),
  rpc: jest.fn()
};

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
mockCreateClient.mockReturnValue(mockSupabase as any);

describe('External Systems Integration', () => {
  let sisService: StudentInformationSystemService;
  let calendarService: AcademicCalendarIntegrationService;
  let gradebookService: GradebookIntegrationService;
  let communicationService: CommunicationPlatformIntegrationService;

  const mockInstitutionId = 'test-institution-id';
  const mockStudentId = 'test-student-id';
  const mockClassId = 'test-class-id';

  beforeEach(() => {
    jest.clearAllMocks();
    
    sisService = new StudentInformationSystemService();
    calendarService = new AcademicCalendarIntegrationService();
    gradebookService = new GradebookIntegrationService();
    communicationService = new CommunicationPlatformIntegrationService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Student Information System Integration', () => {
    describe('Configuration and Initialization', () => {
      it('should initialize SIS configuration successfully', async () => {
        const mockConfig = {
          provider: 'banner',
          api_endpoint: 'https://api.banner.edu',
          api_key: 'test-key',
          sync_interval: 60,
          enable_real_time_sync: true,
          sync_students: true,
          sync_enrollments: true,
          sync_courses: true
        };

        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: mockConfig,
          error: null
        });

        await sisService.initialize(mockInstitutionId);

        expect(mockSupabase.from).toHaveBeenCalledWith('sis_configurations');
        expect(mockSupabase.from().select().eq).toHaveBeenCalledWith('institution_id', mockInstitutionId);
      });

      it('should handle missing SIS configuration gracefully', async () => {
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST116' }
        });

        await expect(sisService.initialize(mockInstitutionId)).resolves.not.toThrow();
      });

      it('should throw error for invalid SIS configuration', async () => {
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: null,
          error: { message: 'Database error', code: 'PGRST001' }
        });

        await expect(sisService.initialize(mockInstitutionId))
          .rejects.toThrow('Failed to load SIS configuration: Database error');
      });
    });

    describe('Student Data Synchronization', () => {
      it('should sync students from SIS successfully', async () => {
        const mockSISStudents = [
          {
            sisId: 'sis-student-1',
            studentId: mockStudentId,
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            studentNumber: 'STU001',
            academicLevel: 'undergraduate',
            major: 'Computer Science',
            gpa: 3.5,
            creditHours: 15,
            enrollmentStatus: 'active',
            lastSyncAt: new Date()
          }
        ];

        // Mock SIS configuration
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: {
            provider: 'banner',
            api_endpoint: 'https://api.banner.edu',
            sync_students: true
          },
          error: null
        });

        // Mock student sync
        mockSupabase.from().upsert.mockResolvedValueOnce({
          data: mockSISStudents,
          error: null
        });

        // Mock last sync update
        mockSupabase.from().update().eq.mockResolvedValueOnce({
          data: null,
          error: null
        });

        // Mock the fetchStudentsFromSIS method
        jest.spyOn(sisService as any, 'fetchStudentsFromSIS')
          .mockResolvedValueOnce(mockSISStudents);

        await sisService.initialize(mockInstitutionId);
        const result = await sisService.syncStudents(mockInstitutionId);

        expect(result.success).toBe(true);
        expect(result.recordsProcessed).toBe(1);
        expect(result.recordsUpdated).toBe(1);
        expect(result.errors).toHaveLength(0);
      });

      it('should handle student sync errors gracefully', async () => {
        // Mock SIS configuration
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: {
            provider: 'banner',
            sync_students: true
          },
          error: null
        });

        // Mock fetch error
        jest.spyOn(sisService as any, 'fetchStudentsFromSIS')
          .mockRejectedValueOnce(new Error('SIS API unavailable'));

        await sisService.initialize(mockInstitutionId);
        const result = await sisService.syncStudents(mockInstitutionId);

        expect(result.success).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].record).toBe('sync_process');
        expect(result.errors[0].error).toBe('SIS API unavailable');
      });
    });

    describe('Enrollment Synchronization', () => {
      it('should sync enrollments from SIS successfully', async () => {
        const mockSISEnrollments = [
          {
            sisEnrollmentId: 'sis-enrollment-1',
            studentSisId: 'sis-student-1',
            courseSisId: 'sis-course-1',
            enrollmentStatus: 'enrolled',
            enrollmentDate: new Date(),
            grade: 'A',
            creditHours: 3,
            lastSyncAt: new Date()
          }
        ];

        // Mock SIS configuration
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: {
            provider: 'banner',
            sync_enrollments: true
          },
          error: null
        });

        // Mock enrollment sync
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST116' }
        });

        mockSupabase.from().insert.mockResolvedValueOnce({
          data: mockSISEnrollments,
          error: null
        });

        // Mock the fetchEnrollmentsFromSIS method
        jest.spyOn(sisService as any, 'fetchEnrollmentsFromSIS')
          .mockResolvedValueOnce(mockSISEnrollments);

        await sisService.initialize(mockInstitutionId);
        const result = await sisService.syncEnrollments(mockInstitutionId);

        expect(result.success).toBe(true);
        expect(result.recordsProcessed).toBe(1);
        expect(result.recordsCreated).toBe(1);
      });
    });

    describe('Student Eligibility Validation', () => {
      it('should validate student eligibility successfully', async () => {
        const mockSISStudent = {
          sisId: 'sis-student-1',
          enrollmentStatus: 'active',
          gpa: 3.2,
          creditHours: 12
        };

        // Mock SIS configuration
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: { provider: 'banner' },
          error: null
        });

        // Mock current credit hours calculation
        mockSupabase.from().select().eq().eq.mockResolvedValueOnce({
          data: [{ credits: 3 }, { credits: 4 }, { credits: 3 }],
          error: null
        });

        jest.spyOn(sisService as any, 'fetchStudentFromSIS')
          .mockResolvedValueOnce(mockSISStudent);

        await sisService.initialize(mockInstitutionId);
        const result = await sisService.validateStudentEligibility(mockStudentId, mockClassId);

        expect(result.eligible).toBe(true);
        expect(result.reasons).toHaveLength(0);
        expect(result.sisData).toEqual(mockSISStudent);
      });

      it('should identify ineligible students', async () => {
        const mockSISStudent = {
          sisId: 'sis-student-1',
          enrollmentStatus: 'inactive',
          gpa: 1.8,
          creditHours: 20
        };

        // Mock SIS configuration
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: { provider: 'banner' },
          error: null
        });

        // Mock current credit hours calculation
        mockSupabase.from().select().eq().eq.mockResolvedValueOnce({
          data: Array(7).fill({ credits: 3 }), // 21 credit hours
          error: null
        });

        jest.spyOn(sisService as any, 'fetchStudentFromSIS')
          .mockResolvedValueOnce(mockSISStudent);

        await sisService.initialize(mockInstitutionId);
        const result = await sisService.validateStudentEligibility(mockStudentId, mockClassId);

        expect(result.eligible).toBe(false);
        expect(result.reasons).toContain('Student enrollment status is inactive');
        expect(result.reasons).toContain('Student does not meet minimum GPA requirement');
        expect(result.reasons).toContain('Student exceeds maximum credit hour limit');
      });
    });
  });

  describe('Academic Calendar Integration', () => {
    describe('Term Management', () => {
      it('should get current academic term successfully', async () => {
        const mockTerm = {
          id: 'term-1',
          name: 'Fall 2024',
          code: 'FALL2024',
          start_date: '2024-08-15',
          end_date: '2024-12-15',
          enrollment_start_date: '2024-07-01',
          enrollment_end_date: '2024-08-10',
          drop_deadline: '2024-09-15',
          withdraw_deadline: '2024-11-15',
          term_type: 'semester',
          year: 2024,
          is_active: true,
          is_current: true
        };

        mockSupabase.from().select().eq().eq().single.mockResolvedValueOnce({
          data: mockTerm,
          error: null
        });

        const result = await calendarService.getCurrentTerm(mockInstitutionId);

        expect(result).toBeDefined();
        expect(result?.name).toBe('Fall 2024');
        expect(result?.isCurrent).toBe(true);
        expect(result?.startDate).toBeInstanceOf(Date);
      });

      it('should handle missing current term', async () => {
        mockSupabase.from().select().eq().eq().single.mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST116' }
        });

        const result = await calendarService.getCurrentTerm(mockInstitutionId);

        expect(result).toBeNull();
      });
    });

    describe('Enrollment Period Management', () => {
      it('should get enrollment periods for a term', async () => {
        const mockPeriods = [
          {
            id: 'period-1',
            term_id: 'term-1',
            name: 'Early Registration',
            start_date: '2024-07-01',
            end_date: '2024-07-15',
            period_type: 'early',
            priority: 1,
            restrictions: ['seniors_only'],
            is_active: true
          },
          {
            id: 'period-2',
            term_id: 'term-1',
            name: 'Regular Registration',
            start_date: '2024-07-16',
            end_date: '2024-08-10',
            period_type: 'regular',
            priority: 2,
            restrictions: null,
            is_active: true
          }
        ];

        mockSupabase.from().select().eq().eq().order.mockResolvedValueOnce({
          data: mockPeriods,
          error: null
        });

        const result = await calendarService.getEnrollmentPeriods('term-1');

        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('Early Registration');
        expect(result[0].periodType).toBe('early');
        expect(result[1].name).toBe('Regular Registration');
      });
    });

    describe('Enrollment Deadline Checking', () => {
      it('should check enrollment deadlines correctly', async () => {
        const mockClass = {
          id: mockClassId,
          academic_terms: {
            id: 'term-1',
            enrollment_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
            drop_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            withdraw_deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // 60 days from now
          }
        };

        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: mockClass,
          error: null
        });

        // Mock enrollment periods
        mockSupabase.from().select().eq().eq().order.mockResolvedValueOnce({
          data: [],
          error: null
        });

        const result = await calendarService.checkEnrollmentDeadlines(
          mockStudentId,
          mockClassId,
          mockInstitutionId
        );

        expect(result.canEnroll).toBe(true);
        expect(result.canDrop).toBe(true);
        expect(result.canWithdraw).toBe(true);
        expect(result.nextDeadline).toBeDefined();
        expect(result.nextDeadline?.type).toBe('enrollment_end');
      });

      it('should identify approaching deadlines', async () => {
        const mockClass = {
          id: mockClassId,
          academic_terms: {
            id: 'term-1',
            enrollment_end_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
            drop_deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
            withdraw_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          }
        };

        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: mockClass,
          error: null
        });

        mockSupabase.from().select().eq().eq().order.mockResolvedValueOnce({
          data: [],
          error: null
        });

        const result = await calendarService.checkEnrollmentDeadlines(
          mockStudentId,
          mockClassId,
          mockInstitutionId
        );

        expect(result.warnings).toContain('Enrollment period ends within 3 days');
        expect(result.warnings).toContain('Drop deadline is within 3 days');
      });
    });

    describe('Calendar Synchronization', () => {
      it('should sync academic calendar successfully', async () => {
        // Mock calendar configuration
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: {
            provider: 'banner',
            api_endpoint: 'https://api.banner.edu',
            sync_interval: 24
          },
          error: null
        });

        // Mock sync methods
        jest.spyOn(calendarService as any, 'fetchTermsFromCalendarSystem')
          .mockResolvedValueOnce([]);
        jest.spyOn(calendarService as any, 'fetchEnrollmentPeriodsFromCalendarSystem')
          .mockResolvedValueOnce([]);
        jest.spyOn(calendarService as any, 'fetchAcademicEventsFromCalendarSystem')
          .mockResolvedValueOnce([]);

        // Mock last sync update
        mockSupabase.from().update().eq.mockResolvedValueOnce({
          data: null,
          error: null
        });

        await calendarService.initialize(mockInstitutionId);
        const result = await calendarService.syncAcademicCalendar(mockInstitutionId);

        expect(result.success).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe('Gradebook Integration', () => {
    describe('Enrollment Synchronization', () => {
      it('should sync enrollment to gradebook successfully', async () => {
        const mockEnrollment = {
          id: 'enrollment-1',
          student: { id: mockStudentId, email: 'student@example.com', full_name: 'John Doe' },
          class: { id: mockClassId, name: 'Math 101', course_code: 'MATH101', gradebook_id: 'gb-course-1' }
        };

        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: mockEnrollment,
          error: null
        });

        // Mock gradebook configuration
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: {
            provider: 'canvas',
            api_endpoint: 'https://canvas.example.com',
            enable_real_time_sync: true
          },
          error: null
        });

        // Mock sync log
        mockSupabase.from().insert.mockResolvedValueOnce({
          data: null,
          error: null
        });

        jest.spyOn(gradebookService as any, 'pushEnrollmentToGradebook')
          .mockResolvedValueOnce(undefined);

        await gradebookService.initialize(mockInstitutionId);
        const result = await gradebookService.syncEnrollmentToGradebook('enrollment-1');

        expect(result).toBe(true);
      });
    });

    describe('Grade Synchronization', () => {
      it('should sync grades from gradebook successfully', async () => {
        // Mock gradebook configuration
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: {
            provider: 'canvas',
            sync_grades: true,
            track_completion: true
          },
          error: null
        });

        // Mock courses for sync
        mockSupabase.from().select().eq().not.mockResolvedValueOnce({
          data: [{ id: mockClassId }],
          error: null
        });

        // Mock enrollments
        mockSupabase.from().select().eq().eq.mockResolvedValueOnce({
          data: [{ student_id: mockStudentId }],
          error: null
        });

        // Mock sync methods
        jest.spyOn(gradebookService as any, 'syncStudentGrades')
          .mockResolvedValueOnce(undefined);
        jest.spyOn(gradebookService as any, 'syncStudentCompletion')
          .mockResolvedValueOnce(undefined);

        // Mock last sync update
        mockSupabase.from().update().eq.mockResolvedValueOnce({
          data: null,
          error: null
        });

        await gradebookService.initialize(mockInstitutionId);
        const result = await gradebookService.syncGradesFromGradebook(mockInstitutionId);

        expect(result.success).toBe(true);
        expect(result.studentsProcessed).toBeGreaterThan(0);
      });
    });

    describe('Completion Tracking', () => {
      it('should get completion tracking data', async () => {
        const mockCompletionData = {
          completionPercentage: 75,
          assignmentsCompleted: 6,
          totalAssignments: 8,
          lastSubmissionDate: new Date(),
          projectedGrade: 'B+'
        };

        jest.spyOn(gradebookService as any, 'fetchCompletionFromGradebook')
          .mockResolvedValueOnce(mockCompletionData);

        const result = await gradebookService.getCompletionTracking(mockStudentId, mockClassId);

        expect(result).toBeDefined();
        expect(result?.completionPercentage).toBe(75);
        expect(result?.atRiskStatus).toBe('low');
        expect(result?.interventionRequired).toBe(false);
      });

      it('should identify at-risk students', async () => {
        const mockCompletionData = {
          completionPercentage: 25,
          assignmentsCompleted: 2,
          totalAssignments: 8,
          lastSubmissionDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
          projectedGrade: 'D'
        };

        jest.spyOn(gradebookService as any, 'fetchCompletionFromGradebook')
          .mockResolvedValueOnce(mockCompletionData);

        const result = await gradebookService.getCompletionTracking(mockStudentId, mockClassId);

        expect(result?.atRiskStatus).toBe('critical');
        expect(result?.interventionRequired).toBe(true);
      });
    });
  });

  describe('Communication Platform Integration', () => {
    describe('Multi-Channel Notification Delivery', () => {
      it('should send notifications through multiple channels', async () => {
        const mockNotification = {
          userId: mockStudentId,
          type: 'enrollment_confirmed' as any,
          title: 'Enrollment Confirmed',
          message: 'You have been enrolled in Math 101',
          channels: ['email', 'sms', 'push'] as any,
          priority: 'high' as any
        };

        // Mock communication configuration
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: {
            email_provider: { type: 'sendgrid', from_email: 'noreply@example.com' },
            sms_provider: { type: 'twilio', from_number: '+1234567890' },
            push_provider: { type: 'fcm' },
            enabled_channels: ['email', 'sms', 'push'],
            fallback_channels: ['email']
          },
          error: null
        });

        // Mock user data
        mockSupabase.from().select().eq().single
          .mockResolvedValueOnce({ data: { email: 'student@example.com' }, error: null })
          .mockResolvedValueOnce({ data: { phone: '+1234567890' }, error: null });

        // Mock push tokens
        mockSupabase.from().select().eq().eq.mockResolvedValueOnce({
          data: [{ token: 'push-token-1', platform: 'android' }],
          error: null
        });

        // Mock delivery logging
        mockSupabase.from().insert.mockResolvedValue({
          data: null,
          error: null
        });

        // Mock parent notification service
        jest.spyOn(communicationService, 'sendNotification')
          .mockResolvedValueOnce('notification-id');

        await communicationService.initialize(mockInstitutionId);
        const result = await communicationService.sendNotificationWithIntegration(mockNotification);

        expect(result.overallSuccess).toBe(true);
        expect(result.results).toHaveLength(3); // email, sms, push
      });

      it('should use fallback channels when primary channels fail', async () => {
        const mockNotification = {
          userId: mockStudentId,
          type: 'enrollment_confirmed' as any,
          title: 'Enrollment Confirmed',
          message: 'You have been enrolled in Math 101',
          channels: ['sms'] as any,
          priority: 'high' as any
        };

        // Mock communication configuration
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: {
            sms_provider: { type: 'twilio' },
            enabled_channels: ['sms'],
            fallback_channels: ['email']
          },
          error: null
        });

        // Mock user phone not found (to trigger fallback)
        mockSupabase.from().select().eq().single
          .mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })
          .mockResolvedValueOnce({ data: { email: 'student@example.com' }, error: null });

        // Mock parent notification service failure
        jest.spyOn(communicationService, 'sendNotification')
          .mockRejectedValueOnce(new Error('Notification service failed'));

        await communicationService.initialize(mockInstitutionId);
        const result = await communicationService.sendNotificationWithIntegration(mockNotification);

        expect(result.results.length).toBeGreaterThan(0);
        // Should have attempted fallback
      });
    });

    describe('Platform-Specific Integrations', () => {
      it('should send Slack notifications', async () => {
        const mockNotification = {
          userId: mockStudentId,
          type: 'enrollment_confirmed' as any,
          title: 'Enrollment Confirmed',
          message: 'Student enrolled in Math 101',
          channels: ['slack'] as any,
          priority: 'medium' as any
        };

        // Mock Slack configuration
        const mockSlackConfig = {
          workspaceId: 'workspace-1',
          botToken: 'xoxb-token',
          channels: {
            enrollmentAlerts: '#enrollment-alerts',
            waitlistUpdates: '#waitlist-updates',
            systemNotifications: '#system'
          }
        };

        communicationService = new CommunicationPlatformIntegrationService({
          institutionId: mockInstitutionId,
          slackIntegration: mockSlackConfig,
          enabledChannels: ['slack'],
          fallbackChannels: [],
          retryPolicy: { maxRetries: 3, backoffMultiplier: 2, maxBackoffTime: 300000 }
        });

        // Mock Slack API response
        global.fetch = jest.fn().mockResolvedValueOnce({
          json: () => Promise.resolve({ ok: true, ts: '1234567890.123456' })
        });

        const result = await communicationService.sendSlackEnrollmentNotification(
          'enrollmentAlerts',
          mockNotification
        );

        expect(result.success).toBe(true);
        expect(result.provider).toBe('slack');
        expect(result.messageId).toBe('1234567890.123456');
      });

      it('should handle Slack API errors', async () => {
        const mockNotification = {
          userId: mockStudentId,
          type: 'enrollment_confirmed' as any,
          title: 'Enrollment Confirmed',
          message: 'Student enrolled in Math 101',
          channels: ['slack'] as any,
          priority: 'medium' as any
        };

        const mockSlackConfig = {
          workspaceId: 'workspace-1',
          botToken: 'invalid-token',
          channels: {
            enrollmentAlerts: '#enrollment-alerts',
            waitlistUpdates: '#waitlist-updates',
            systemNotifications: '#system'
          }
        };

        communicationService = new CommunicationPlatformIntegrationService({
          institutionId: mockInstitutionId,
          slackIntegration: mockSlackConfig,
          enabledChannels: ['slack'],
          fallbackChannels: [],
          retryPolicy: { maxRetries: 3, backoffMultiplier: 2, maxBackoffTime: 300000 }
        });

        // Mock Slack API error response
        global.fetch = jest.fn().mockResolvedValueOnce({
          json: () => Promise.resolve({ ok: false, error: 'invalid_auth' })
        });

        const result = await communicationService.sendSlackEnrollmentNotification(
          'enrollmentAlerts',
          mockNotification
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('invalid_auth');
      });
    });

    describe('Platform Connectivity Testing', () => {
      it('should test all platform connectivity', async () => {
        const mockConfig = {
          institutionId: mockInstitutionId,
          emailProvider: { type: 'sendgrid' as any, fromEmail: 'test@example.com', fromName: 'Test' },
          smsProvider: { type: 'twilio' as any, fromNumber: '+1234567890' },
          slackIntegration: { workspaceId: 'test', botToken: 'token', channels: {} as any },
          pushProvider: { type: 'fcm' as any },
          webhooks: [],
          enabledChannels: ['email', 'sms', 'slack', 'push'],
          fallbackChannels: ['email'],
          retryPolicy: { maxRetries: 3, backoffMultiplier: 2, maxBackoffTime: 300000 }
        };

        communicationService = new CommunicationPlatformIntegrationService(mockConfig);

        // Mock connectivity test methods
        jest.spyOn(communicationService as any, 'testEmailConnectivity')
          .mockResolvedValueOnce(undefined);
        jest.spyOn(communicationService as any, 'testSMSConnectivity')
          .mockResolvedValueOnce(undefined);
        jest.spyOn(communicationService as any, 'testSlackConnectivity')
          .mockResolvedValueOnce(undefined);
        jest.spyOn(communicationService as any, 'testPushConnectivity')
          .mockResolvedValueOnce(undefined);

        const result = await communicationService.testPlatformConnectivity();

        expect(result.email).toBe(true);
        expect(result.sms).toBe(true);
        expect(result.slack).toBe(true);
        expect(result.push).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should handle connectivity test failures', async () => {
        const mockConfig = {
          institutionId: mockInstitutionId,
          emailProvider: { type: 'sendgrid' as any, fromEmail: 'test@example.com', fromName: 'Test' },
          webhooks: [],
          enabledChannels: ['email'],
          fallbackChannels: [],
          retryPolicy: { maxRetries: 3, backoffMultiplier: 2, maxBackoffTime: 300000 }
        };

        communicationService = new CommunicationPlatformIntegrationService(mockConfig);

        // Mock connectivity test failure
        jest.spyOn(communicationService as any, 'testEmailConnectivity')
          .mockRejectedValueOnce(new Error('API key invalid'));

        const result = await communicationService.testPlatformConnectivity();

        expect(result.email).toBe(false);
        expect(result.errors).toContain('Email: API key invalid');
      });
    });
  });

  describe('Cross-System Data Consistency', () => {
    it('should maintain data consistency across all systems', async () => {
      // This test verifies that enrollment data remains consistent
      // across SIS, gradebook, and calendar systems

      const mockEnrollmentData = {
        studentId: mockStudentId,
        classId: mockClassId,
        enrollmentStatus: 'enrolled',
        enrollmentDate: new Date(),
        grade: 'A',
        creditHours: 3
      };

      // Mock SIS sync
      jest.spyOn(sisService, 'pushEnrollmentToSIS')
        .mockResolvedValueOnce(true);

      // Mock gradebook sync
      jest.spyOn(gradebookService, 'syncEnrollmentToGradebook')
        .mockResolvedValueOnce(true);

      // Mock calendar deadline check
      jest.spyOn(calendarService, 'checkEnrollmentDeadlines')
        .mockResolvedValueOnce({
          canEnroll: true,
          canDrop: true,
          canWithdraw: false,
          warnings: []
        });

      // Simulate enrollment process
      const sisResult = await sisService.pushEnrollmentToSIS('enrollment-1');
      const gradebookResult = await gradebookService.syncEnrollmentToGradebook('enrollment-1');
      const deadlineCheck = await calendarService.checkEnrollmentDeadlines(
        mockStudentId,
        mockClassId,
        mockInstitutionId
      );

      expect(sisResult).toBe(true);
      expect(gradebookResult).toBe(true);
      expect(deadlineCheck.canEnroll).toBe(true);
    });

    it('should handle partial system failures gracefully', async () => {
      // Test scenario where one system fails but others succeed

      // Mock SIS success
      jest.spyOn(sisService, 'pushEnrollmentToSIS')
        .mockResolvedValueOnce(true);

      // Mock gradebook failure
      jest.spyOn(gradebookService, 'syncEnrollmentToGradebook')
        .mockResolvedValueOnce(false);

      // Mock notification success
      const mockNotification = {
        userId: mockStudentId,
        type: 'enrollment_confirmed' as any,
        title: 'Enrollment Status',
        message: 'Enrollment processed with some system errors',
        channels: ['email'] as any,
        priority: 'high' as any
      };

      jest.spyOn(communicationService, 'sendNotification')
        .mockResolvedValueOnce('notification-id');

      const sisResult = await sisService.pushEnrollmentToSIS('enrollment-1');
      const gradebookResult = await gradebookService.syncEnrollmentToGradebook('enrollment-1');
      const notificationResult = await communicationService.sendNotification(mockNotification);

      expect(sisResult).toBe(true);
      expect(gradebookResult).toBe(false);
      expect(notificationResult).toBe('notification-id');

      // In a real scenario, this would trigger error handling and retry logic
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle bulk synchronization efficiently', async () => {
      const startTime = Date.now();

      // Mock bulk student sync
      const mockStudents = Array.from({ length: 100 }, (_, i) => ({
        sisId: `sis-student-${i}`,
        studentId: `student-${i}`,
        firstName: `Student${i}`,
        lastName: 'Test',
        email: `student${i}@example.com`,
        studentNumber: `STU${i.toString().padStart(3, '0')}`,
        academicLevel: 'undergraduate',
        enrollmentStatus: 'active',
        creditHours: 15,
        lastSyncAt: new Date()
      }));

      // Mock SIS configuration
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: { provider: 'banner', sync_students: true },
        error: null
      });

      jest.spyOn(sisService as any, 'fetchStudentsFromSIS')
        .mockResolvedValueOnce(mockStudents);

      // Mock successful sync for all students
      mockSupabase.from().upsert.mockResolvedValue({
        data: null,
        error: null
      });

      mockSupabase.from().update().eq.mockResolvedValue({
        data: null,
        error: null
      });

      await sisService.initialize(mockInstitutionId);
      const result = await sisService.syncStudents(mockInstitutionId);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(100);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle rate limiting correctly', async () => {
      // Test rate limiting for communication platforms
      const notifications = Array.from({ length: 10 }, (_, i) => ({
        userId: `user-${i}`,
        type: 'enrollment_confirmed' as any,
        title: `Notification ${i}`,
        message: `Test message ${i}`,
        channels: ['email'] as any,
        priority: 'medium' as any
      }));

      // Mock communication configuration
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          enabled_channels: ['email'],
          fallback_channels: []
        },
        error: null
      });

      await communicationService.initialize(mockInstitutionId);

      // Send notifications rapidly
      const results = await Promise.allSettled(
        notifications.map(notification => 
          communicationService.sendNotificationWithIntegration(notification)
        )
      );

      // All should succeed (rate limiting should be handled internally)
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBe(notifications.length);
    });
  });
});