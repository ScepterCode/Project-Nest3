/**
 * Role Management Types
 * 
 * Defines the core data models and interfaces for the role assignment flow,
 * including user role assignments, role requests, permissions, and verification.
 */

export enum UserRole {
  STUDENT = 'student',
  TEACHER = 'teacher',
  DEPARTMENT_ADMIN = 'department_admin',
  INSTITUTION_ADMIN = 'institution_admin',
  SYSTEM_ADMIN = 'system_admin'
}

export enum RoleStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  SUSPENDED = 'suspended',
  EXPIRED = 'expired'
}

export enum RoleRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DENIED = 'denied',
  EXPIRED = 'expired'
}

export enum VerificationMethod {
  EMAIL_DOMAIN = 'email_domain',
  MANUAL_REVIEW = 'manual_review',
  ADMIN_APPROVAL = 'admin_approval'
}

export enum PermissionCategory {
  CONTENT = 'content',
  USER_MANAGEMENT = 'user_management',
  ANALYTICS = 'analytics',
  SYSTEM = 'system'
}

export enum PermissionScope {
  SELF = 'self',
  DEPARTMENT = 'department',
  INSTITUTION = 'institution',
  SYSTEM = 'system'
}

export enum AuditAction {
  ASSIGNED = 'assigned',
  REVOKED = 'revoked',
  CHANGED = 'changed',
  EXPIRED = 'expired',
  REQUESTED = 'requested',
  APPROVED = 'approved',
  DENIED = 'denied'
}

/**
 * Represents a user's role assignment within the system
 */
export interface UserRoleAssignment {
  id: string;
  userId: string;
  role: UserRole;
  status: RoleStatus;
  assignedBy: string;
  assignedAt: Date;
  expiresAt?: Date;
  departmentId?: string;
  institutionId: string;
  isTemporary: boolean;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Represents a request for role assignment or change
 */
export interface RoleRequest {
  id: string;
  userId: string;
  requestedRole: UserRole;
  currentRole?: UserRole;
  justification: string;
  status: RoleRequestStatus;
  requestedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewNotes?: string;
  verificationMethod: VerificationMethod;
  institutionId: string;
  departmentId?: string;
  expiresAt: Date;
  metadata: Record<string, any>;
}

/**
 * Represents a permission that can be granted to roles
 */
export interface Permission {
  id: string;
  name: string;
  description: string;
  category: PermissionCategory;
  scope: PermissionScope;
  createdAt: Date;
}

/**
 * Maps roles to their associated permissions
 */
export interface RolePermission {
  id: string;
  role: UserRole;
  permissionId: string;
  conditions: PermissionCondition[];
  createdAt: Date;
}

/**
 * Defines conditions under which a permission is granted
 */
export interface PermissionCondition {
  type: 'department_match' | 'institution_match' | 'resource_owner' | 'time_based';
  parameters: Record<string, any>;
}

/**
 * Result of a permission check operation
 */
export interface PermissionResult {
  permission: string;
  granted: boolean;
  reason?: string;
  conditions?: PermissionCondition[];
}

/**
 * Audit log entry for role-related actions
 */
export interface RoleAuditLog {
  id: string;
  userId: string;
  action: AuditAction;
  oldRole?: UserRole;
  newRole?: UserRole;
  changedBy: string;
  reason?: string;
  timestamp: Date;
  institutionId?: string;
  departmentId?: string;
  metadata: Record<string, any>;
}

/**
 * Institution domain configuration for email verification
 */
export interface InstitutionDomain {
  id: string;
  institutionId: string;
  domain: string;
  verified: boolean;
  autoApproveRoles: UserRole[];
  createdAt: Date;
}

/**
 * Evidence provided for manual role verification
 */
export interface VerificationEvidence {
  type: 'document' | 'email' | 'reference' | 'other';
  description: string;
  fileUrl?: string;
  metadata: Record<string, any>;
}

/**
 * Result of a verification process
 */
export interface VerificationResult {
  verified: boolean;
  method: VerificationMethod;
  reason?: string;
  evidence?: VerificationEvidence[];
  verifiedBy?: string;
  verifiedAt?: Date;
}

/**
 * Request for role assignment with all necessary context
 */
export interface RoleAssignmentRequest {
  userId: string;
  role: UserRole;
  assignedBy: string;
  institutionId: string;
  departmentId?: string;
  isTemporary?: boolean;
  expiresAt?: Date;
  justification?: string;
  metadata?: Record<string, any>;
}

/**
 * Request for role change with validation context
 */
export interface RoleChangeRequest {
  userId: string;
  currentRole: UserRole;
  newRole: UserRole;
  changedBy: string;
  reason: string;
  institutionId: string;
  departmentId?: string;
  requiresApproval: boolean;
  metadata?: Record<string, any>;
}

/**
 * Bulk role assignment operation
 */
export interface BulkRoleAssignment {
  assignments: RoleAssignmentRequest[];
  assignedBy: string;
  institutionId: string;
  validateOnly?: boolean;
}

/**
 * Result of bulk role assignment operation
 */
export interface BulkRoleAssignmentResult {
  successful: number;
  failed: number;
  errors: Array<{
    index: number;
    userId: string;
    error: string;
  }>;
  assignments: UserRoleAssignment[];
}