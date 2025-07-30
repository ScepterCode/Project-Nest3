// Enrollment Management Type Definitions

export enum EnrollmentStatus {
  ENROLLED = 'enrolled',
  PENDING = 'pending',
  WAITLISTED = 'waitlisted',
  DROPPED = 'dropped',
  WITHDRAWN = 'withdrawn',
  COMPLETED = 'completed'
}

export enum EnrollmentRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DENIED = 'denied',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

export enum EnrollmentType {
  OPEN = 'open',
  RESTRICTED = 'restricted',
  INVITATION_ONLY = 'invitation_only'
}

export enum PrerequisiteType {
  COURSE = 'course',
  GRADE = 'grade',
  YEAR = 'year',
  MAJOR = 'major',
  GPA = 'gpa',
  CUSTOM = 'custom'
}

export enum RestrictionType {
  YEAR_LEVEL = 'year_level',
  MAJOR = 'major',
  DEPARTMENT = 'department',
  GPA = 'gpa',
  INSTITUTION = 'institution',
  CUSTOM = 'custom'
}

export enum AuditAction {
  ENROLLED = 'enrolled',
  DROPPED = 'dropped',
  WITHDRAWN = 'withdrawn',
  WAITLISTED = 'waitlisted',
  APPROVED = 'approved',
  DENIED = 'denied',
  INVITED = 'invited',
  TRANSFERRED = 'transferred'
}

export enum NotificationType {
  // Enrollment status changes
  ENROLLMENT_CONFIRMED = 'enrollment_confirmed',
  ENROLLMENT_APPROVED = 'enrollment_approved',
  ENROLLMENT_DENIED = 'enrollment_denied',
  ENROLLMENT_DROPPED = 'enrollment_dropped',
  ENROLLMENT_WITHDRAWN = 'enrollment_withdrawn',
  
  // Waitlist notifications
  POSITION_CHANGE = 'position_change',
  ENROLLMENT_AVAILABLE = 'enrollment_available',
  WAITLIST_JOINED = 'waitlist_joined',
  WAITLIST_REMOVED = 'waitlist_removed',
  
  // Deadline and reminder notifications
  DEADLINE_REMINDER = 'deadline_reminder',
  FINAL_NOTICE = 'final_notice',
  ENROLLMENT_DEADLINE_APPROACHING = 'enrollment_deadline_approaching',
  DROP_DEADLINE_APPROACHING = 'drop_deadline_approaching',
  WITHDRAW_DEADLINE_APPROACHING = 'withdraw_deadline_approaching',
  
  // Capacity and availability alerts
  CAPACITY_ALERT = 'capacity_alert',
  NEW_SECTION_AVAILABLE = 'new_section_available',
  CLASS_CANCELLED = 'class_cancelled',
  CLASS_RESCHEDULED = 'class_rescheduled',
  
  // Administrative notifications
  ENROLLMENT_REQUEST_RECEIVED = 'enrollment_request_received',
  BULK_ENROLLMENT_COMPLETED = 'bulk_enrollment_completed',
  ROSTER_UPDATED = 'roster_updated',
  
  // System notifications
  SYSTEM_MAINTENANCE = 'system_maintenance',
  POLICY_UPDATE = 'policy_update'
}

// Core enrollment interface
export interface Enrollment {
  id: string;
  studentId: string;
  classId: string;
  status: EnrollmentStatus;
  enrolledAt: Date;
  enrolledBy?: string; // For admin enrollments
  dropDeadline?: Date;
  withdrawDeadline?: Date;
  grade?: string;
  credits: number;
  priority: number; // For priority enrollment
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Enrollment request for restricted classes
export interface EnrollmentRequest {
  id: string;
  studentId: string;
  classId: string;
  requestedAt: Date;
  status: EnrollmentRequestStatus;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewNotes?: string;
  justification?: string;
  priority: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Waitlist entry
export interface WaitlistEntry {
  id: string;
  studentId: string;
  classId: string;
  position: number;
  addedAt: Date;
  notifiedAt?: Date;
  notificationExpiresAt?: Date;
  priority: number;
  estimatedProbability: number; // 0.0 to 1.0
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Waitlist notification
export interface WaitlistNotification {
  id: string;
  waitlistEntryId: string;
  notificationType: NotificationType;
  sentAt: Date;
  responseDeadline?: Date;
  responded: boolean;
  response?: 'accept' | 'decline' | 'no_response';
  responseAt?: Date;
  createdAt: Date;
}

// Class prerequisite
export interface ClassPrerequisite {
  id: string;
  classId: string;
  type: PrerequisiteType;
  requirement: string; // JSON string for complex requirements
  description?: string;
  strict: boolean; // Whether to enforce automatically
  createdAt: Date;
  updatedAt: Date;
}

// Enrollment restriction
export interface EnrollmentRestriction {
  id: string;
  classId: string;
  type: RestrictionType;
  condition: string; // JSON string for complex conditions
  description?: string;
  overridable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Audit log entry
export interface EnrollmentAuditLog {
  id: string;
  studentId: string;
  classId: string;
  action: AuditAction;
  performedBy?: string;
  reason?: string;
  previousStatus?: string;
  newStatus?: string;
  timestamp: Date;
  metadata: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

// Class invitation
export interface ClassInvitation {
  id: string;
  classId: string;
  studentId?: string;
  email?: string;
  invitedBy: string;
  token: string;
  expiresAt: Date;
  acceptedAt?: Date;
  declinedAt?: Date;
  message?: string;
  createdAt: Date;
}

// Enrollment statistics
export interface EnrollmentStatistics {
  id: string;
  classId: string;
  totalEnrolled: number;
  totalWaitlisted: number;
  totalPending: number;
  capacityUtilization: number; // Percentage
  averageWaitTime?: string; // PostgreSQL interval as string
  enrollmentTrend: 'increasing' | 'decreasing' | 'stable';
  lastUpdated: Date;
  createdAt: Date;
}

// Class enrollment configuration
export interface ClassEnrollmentConfig {
  enrollmentType: EnrollmentType;
  capacity: number;
  waitlistCapacity: number;
  enrollmentStart?: Date;
  enrollmentEnd?: Date;
  dropDeadline?: Date;
  withdrawDeadline?: Date;
  autoApprove: boolean;
  requiresJustification: boolean;
  allowWaitlist: boolean;
  maxWaitlistPosition?: number;
  notificationSettings: {
    enrollmentConfirmation: boolean;
    waitlistUpdates: boolean;
    deadlineReminders: boolean;
    capacityAlerts: boolean;
  };
}

// Extended class interface with enrollment data
export interface ClassWithEnrollment {
  id: string;
  name: string;
  description?: string;
  code: string;
  teacherId: string;
  teacherName: string;
  departmentId?: string;
  institutionId?: string;
  semester: string;
  schedule?: string;
  location?: string;
  credits: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Enrollment-specific fields
  enrollmentConfig: ClassEnrollmentConfig;
  capacity: number;
  currentEnrollment: number;
  waitlistCapacity: number;
  enrollmentType: EnrollmentType;
  enrollmentStart?: Date;
  enrollmentEnd?: Date;
  dropDeadline?: Date;
  withdrawDeadline?: Date;
  
  // Computed fields
  availableSpots: number;
  waitlistCount: number;
  isEnrollmentOpen: boolean;
  isWaitlistAvailable: boolean;
  enrollmentStatistics?: EnrollmentStatistics;
}

// Search and filtering interfaces
export interface ClassSearchCriteria {
  query?: string;
  departmentId?: string;
  instructorId?: string;
  semester?: string;
  enrollmentType?: EnrollmentType;
  hasAvailableSpots?: boolean;
  hasWaitlistSpots?: boolean;
  credits?: number;
  schedule?: string;
  location?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'enrollment' | 'availability' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

export interface ClassSearchResult {
  classes: ClassWithEnrollment[];
  total: number;
  hasMore: boolean;
  filters: {
    departments: Array<{ id: string; name: string; count: number }>;
    instructors: Array<{ id: string; name: string; count: number }>;
    semesters: Array<{ value: string; count: number }>;
    enrollmentTypes: Array<{ type: EnrollmentType; count: number }>;
  };
}

// Enrollment eligibility check result
export interface EligibilityResult {
  eligible: boolean;
  reasons: Array<{
    type: 'prerequisite' | 'restriction' | 'capacity' | 'deadline' | 'permission';
    message: string;
    severity: 'error' | 'warning' | 'info';
    overridable: boolean;
  }>;
  recommendedActions: string[];
  alternativeClasses?: string[]; // Class IDs
}

// Enrollment operation results
export interface EnrollmentResult {
  success: boolean;
  enrollmentId?: string;
  status: EnrollmentStatus;
  message: string;
  waitlistPosition?: number;
  estimatedWaitTime?: string;
  nextSteps: string[];
  errors?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}

export interface BulkEnrollmentResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  results: Array<{
    studentId: string;
    result: EnrollmentResult;
  }>;
  summary: {
    enrolled: number;
    waitlisted: number;
    rejected: number;
  };
}

// Student enrollment dashboard data
export interface StudentEnrollmentDashboard {
  currentEnrollments: Array<{
    enrollment: Enrollment;
    class: ClassWithEnrollment;
    upcomingDeadlines: Array<{
      type: 'drop' | 'withdraw' | 'assignment';
      date: Date;
      description: string;
    }>;
  }>;
  pendingRequests: Array<{
    request: EnrollmentRequest;
    class: ClassWithEnrollment;
    estimatedResponseTime: string;
  }>;
  waitlistEntries: Array<{
    entry: WaitlistEntry;
    class: ClassWithEnrollment;
    estimatedEnrollmentDate?: Date;
  }>;
  availableClasses: ClassWithEnrollment[];
  enrollmentHistory: Array<{
    enrollment: Enrollment;
    class: ClassWithEnrollment;
    auditLog: EnrollmentAuditLog[];
  }>;
  statistics: {
    totalCredits: number;
    completedCredits: number;
    currentGPA?: number;
    enrollmentTrend: 'increasing' | 'decreasing' | 'stable';
  };
}

// Teacher roster management data
export interface TeacherRosterData {
  class: ClassWithEnrollment;
  enrolledStudents: Array<{
    enrollment: Enrollment;
    student: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      studentId?: string;
      year?: string;
      major?: string;
    };
    performance?: {
      attendance: number;
      assignments: number;
      participation: number;
    };
  }>;
  pendingRequests: Array<{
    request: EnrollmentRequest;
    student: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      studentId?: string;
      year?: string;
      major?: string;
      gpa?: number;
    };
    eligibility: EligibilityResult;
  }>;
  waitlistStudents: Array<{
    entry: WaitlistEntry;
    student: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      studentId?: string;
      year?: string;
      major?: string;
    };
  }>;
  statistics: {
    enrollmentRate: number;
    dropoutRate: number;
    averageGrade?: number;
    attendanceRate?: number;
  };
}

// Notification preferences
export interface NotificationPreferences {
  userId: string;
  enrollmentConfirmation: {
    email: boolean;
    inApp: boolean;
    sms: boolean;
  };
  waitlistUpdates: {
    email: boolean;
    inApp: boolean;
    sms: boolean;
  };
  deadlineReminders: {
    email: boolean;
    inApp: boolean;
    sms: boolean;
    daysBeforeDeadline: number[];
  };
  capacityAlerts: {
    email: boolean;
    inApp: boolean;
    sms: boolean;
  };
  digestFrequency: 'immediate' | 'daily' | 'weekly' | 'never';
}

// Real-time event types
export enum RealtimeEventType {
  // Enrollment events
  ENROLLMENT_STATUS_CHANGE = 'enrollment_status_change',
  ENROLLMENT_COUNT_UPDATE = 'enrollment_count_update',
  ENROLLMENT_REQUEST_SUBMITTED = 'enrollment_request_submitted',
  ENROLLMENT_REQUEST_APPROVED = 'enrollment_request_approved',
  ENROLLMENT_REQUEST_DENIED = 'enrollment_request_denied',
  
  // Waitlist events
  WAITLIST_UPDATE = 'waitlist_update',
  WAITLIST_POSITION_CHANGE = 'waitlist_position_change',
  WAITLIST_ADVANCEMENT = 'waitlist_advancement',
  WAITLIST_JOINED = 'waitlist_joined',
  WAITLIST_REMOVED = 'waitlist_removed',
  
  // Class events
  CAPACITY_CHANGE = 'capacity_change',
  CLASS_FULL = 'class_full',
  SPOTS_AVAILABLE = 'spots_available',
  
  // System events
  CONNECTION_STATUS = 'connection_status',
  ERROR = 'error'
}

// Real-time enrollment event
export interface RealtimeEnrollmentEvent {
  type: RealtimeEventType;
  classId: string;
  studentId?: string;
  data: Record<string, any>;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Real-time waitlist event
export interface RealtimeWaitlistEvent {
  type: RealtimeEventType;
  classId: string;
  studentId?: string;
  data: {
    position?: number;
    newPosition?: number;
    oldPosition?: number;
    positionChange?: number;
    totalWaitlisted?: number;
    averageWaitTime?: number;
    positionDistribution?: Array<{ position: number; count: number }>;
    message?: string;
    responseDeadline?: Date;
  };
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Real-time connection status
export interface RealtimeConnectionStatus {
  connected: boolean;
  lastConnected?: Date;
  reconnectAttempts: number;
  latency?: number;
  rooms: string[];
}

// Real-time enrollment statistics
export interface RealtimeEnrollmentStats {
  classId: string;
  enrollment: {
    current: number;
    capacity: number;
    available: number;
    utilizationRate: number;
  };
  waitlist: {
    total: number;
    averagePosition: number;
    averageWaitTime: number;
    estimatedProcessingTime: number;
  };
  activity: {
    recentEnrollments: number;
    recentDrops: number;
    waitlistMovement: number;
    lastActivity: Date;
  };
  trends: {
    enrollmentTrend: 'increasing' | 'decreasing' | 'stable';
    waitlistTrend: 'increasing' | 'decreasing' | 'stable';
    activityLevel: 'high' | 'medium' | 'low';
  };
}