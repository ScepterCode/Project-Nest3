// Types for bulk role assignment functionality

export type UserRole = 'student' | 'teacher' | 'department_admin' | 'institution_admin';
export type AssignmentStatus = 'processing' | 'completed' | 'failed' | 'cancelled' | 'validating';
export type ItemAssignmentStatus = 'pending' | 'success' | 'failed' | 'skipped' | 'conflict';
export type ConflictResolutionStatus = 'unresolved' | 'resolved' | 'ignored';
export type NotificationDeliveryStatus = 'pending' | 'sent' | 'failed' | 'bounced';
export type PolicyType = 'role_transition' | 'department_restriction' | 'approval_required' | 'temporary_role_limit';

export interface BulkRoleAssignment {
  userIds: string[];
  role: UserRole;
  assignedBy: string;
  institutionId: string;
  departmentId?: string;
  isTemporary: boolean;
  expiresAt?: Date;
  justification: string;
  assignmentName?: string;
  sendNotifications?: boolean;
  validateOnly?: boolean;
}

export interface BulkRoleAssignmentOptions {
  institutionId: string;
  assignmentName: string;
  targetRole: UserRole;
  departmentId?: string;
  isTemporary: boolean;
  expiresAt?: Date;
  justification: string;
  sendNotifications: boolean;
  validateOnly: boolean;
  skipConflicts: boolean;
  requireApproval: boolean;
}

export interface BulkAssignmentResult {
  assignmentId: string;
  totalUsers: number;
  successfulAssignments: number;
  failedAssignments: number;
  skippedAssignments: number;
  conflicts: RoleAssignmentConflict[];
  errors: AssignmentError[];
  warnings: AssignmentWarning[];
  summary: AssignmentSummary;
  duration: number;
  requiresApproval: boolean;
}

export interface RoleAssignmentConflict {
  id: string;
  userId: string;
  conflictType: string;
  conflictDescription: string;
  currentRole: UserRole;
  targetRole: UserRole;
  resolutionStatus: ConflictResolutionStatus;
  resolutionAction?: string;
  resolvedBy?: string;
  resolvedAt?: Date;
  metadata: Record<string, any>;
}

export interface AssignmentError {
  userId: string;
  errorCode: string;
  errorMessage: string;
  errorType: 'validation' | 'policy' | 'system' | 'conflict';
  suggestedFix?: string;
  retryable: boolean;
}

export interface AssignmentWarning {
  userId: string;
  warningType: string;
  warningMessage: string;
  canProceed: boolean;
}

export interface AssignmentSummary {
  totalUsers: number;
  processedUsers: number;
  successfulAssignments: number;
  failedAssignments: number;
  skippedAssignments: number;
  conflictsFound: number;
  warningsGenerated: number;
  duration: number;
  batchSize: number;
}

export interface BulkAssignmentStatus {
   
 assignmentId: string;
  status: AssignmentStatus;
  progress: number;
  currentBatch: number;
  totalBatches: number;
  startedAt: Date;
  estimatedCompletion?: Date;
  lastUpdated: Date;
  errors: AssignmentError[];
  warnings: AssignmentWarning[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  affectedUsers: number;
  estimatedDuration: number;
}

export interface ValidationError {
  userId: string;
  field: string;
  errorCode: string;
  errorMessage: string;
  currentValue: any;
  expectedValue?: any;
}

export interface ValidationWarning {
  userId: string;
  warningType: string;
  warningMessage: string;
  impact: 'low' | 'medium' | 'high';
}

export interface UserSelectionCriteria {
  institutionId: string;
  departmentIds?: string[];
  currentRoles?: UserRole[];
  searchQuery?: string;
  includeInactive?: boolean;
  excludeUserIds?: string[];
  customFilters?: Record<string, any>;
}

export interface UserSelectionResult {
  users: SelectedUser[];
  totalCount: number;
  filteredCount: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface SelectedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  currentRole: UserRole;
  departmentId?: string;
  departmentName?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  conflictRisk: 'low' | 'medium' | 'high';
  conflictReasons?: string[];
}

export interface InstitutionalPolicy {
  id: string;
  institutionId: string;
  policyName: string;
  policyType: PolicyType;
  fromRole?: UserRole;
  toRole?: UserRole;
  departmentId?: string;
  requiresApproval: boolean;
  approvalRole?: UserRole;
  maxTemporaryDuration?: number;
  conditions: Record<string, any>;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyValidationResult {
  isValid: boolean;
  requiresApproval: boolean;
  approvalRole?: UserRole;
  errorMessage?: string;
  warningMessage?: string;
}

export interface NotificationTemplate {
  type: 'role_assigned' | 'role_changed' | 'temporary_role_assigned' | 'role_expired';
  subject: string;
  message: string;
  variables: Record<string, any>;
}

export interface NotificationResult {
  userId: string;
  notificationType: string;
  deliveryStatus: NotificationDeliveryStatus;
  sentAt?: Date;
  errorMessage?: string;
  deliveryAttempts: number;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  institutionId: string;
  bulkAssignmentId?: string;
  action: string;
  previousRole?: UserRole;
  newRole?: UserRole;
  changedBy: string;
  changeReason?: string;
  isTemporary: boolean;
  expiresAt?: Date;
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface RollbackOptions {
  assignmentId: string;
  rollbackReason: string;
  notifyUsers: boolean;
  rollbackBy: string;
}

export interface RollbackResult {
  success: boolean;
  rolledBackUsers: number;
  failedRollbacks: number;
  errors: AssignmentError[];
  auditLogId: string;
}

export interface PerformanceMetrics {
  assignmentId: string;
  totalUsers: number;
  processingTime: number;
  averageTimePerUser: number;
  peakMemoryUsage: number;
  databaseQueries: number;
  cacheHitRate: number;
  errorRate: number;
}