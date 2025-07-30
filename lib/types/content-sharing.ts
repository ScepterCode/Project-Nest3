export type SharingLevel = 'private' | 'department' | 'institution' | 'cross_institution' | 'public';

export type ResourceType = 
  | 'assignment' 
  | 'class' 
  | 'rubric' 
  | 'material' 
  | 'template' 
  | 'assessment';

export type CollaborationPermission = 
  | 'view' 
  | 'comment' 
  | 'edit' 
  | 'copy' 
  | 'share' 
  | 'admin';

export interface ContentSharingPolicy {
  id: string;
  institutionId: string;
  resourceType: ResourceType;
  sharingLevel: SharingLevel;
  conditions: PolicyConditions;
  attributionRequired: boolean;
  allowCrossInstitution: boolean;
  restrictedDomains?: string[];
  allowedDomains?: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface PolicyConditions {
  requireApproval?: boolean;
  maxSharingDepth?: number;
  expirationDays?: number;
  requireAttribution?: boolean;
  allowModification?: boolean;
  allowCommercialUse?: boolean;
  restrictToEducationalUse?: boolean;
}

export interface CollaborationSettings {
  id: string;
  institutionId: string;
  departmentId?: string;
  allowCrossInstitutionCollaboration: boolean;
  allowCrossDepartmentCollaboration: boolean;
  defaultPermissions: CollaborationPermission[];
  approvalRequired: boolean;
  approverRoles: string[];
  maxCollaborators?: number;
  allowExternalCollaborators: boolean;
  externalDomainWhitelist?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentSharingRequest {
  id: string;
  contentId: string;
  contentType: ResourceType;
  requesterId: string;
  targetInstitutionId?: string;
  targetDepartmentId?: string;
  requestedPermissions: CollaborationPermission[];
  justification?: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  approvedBy?: string;
  approvedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentAttribution {
  id: string;
  contentId: string;
  originalAuthorId: string;
  originalInstitutionId: string;
  originalDepartmentId?: string;
  attributionText: string;
  licenseType?: string;
  createdAt: Date;
}

export interface PolicyViolation {
  id: string;
  contentId: string;
  policyId: string;
  violationType: 'unauthorized_sharing' | 'missing_attribution' | 'domain_restriction' | 'permission_exceeded';
  description: string;
  reportedBy?: string;
  status: 'reported' | 'investigating' | 'resolved' | 'dismissed';
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
}