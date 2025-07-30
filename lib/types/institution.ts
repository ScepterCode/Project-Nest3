// Institution and Department type definitions for multi-tenant system

export type InstitutionType = 'university' | 'college' | 'school' | 'training_center' | 'other';
export type InstitutionStatus = 'active' | 'inactive' | 'suspended' | 'pending';
export type DepartmentStatus = 'active' | 'inactive' | 'archived';
export type IntegrationType = 'sso' | 'sis' | 'lms' | 'analytics' | 'storage';
export type SharingLevel = 'private' | 'department' | 'institution' | 'public';
export type SubscriptionPlan = 'free' | 'basic' | 'premium' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trial';

// Core data models
export interface ContactInfo {
  email?: string;
  phone?: string;
  website?: string;
  primaryContact?: {
    name: string;
    title: string;
    email: string;
    phone?: string;
  };
}

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface CustomField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'date';
  required?: boolean;
  options?: string[]; // For select type
  defaultValue?: any;
}

// Institution configuration models
export interface BrandingConfig {
  logo?: string;
  favicon?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily?: string;
  customCSS?: string;
  welcomeMessage?: string;
  footerText?: string;
  emailTemplates?: {
    welcome?: string;
    invitation?: string;
    notification?: string;
  };
}

export interface ContentSharingPolicy {
  allowCrossInstitution: boolean;
  allowPublicSharing: boolean;
  requireAttribution: boolean;
  defaultSharingLevel: SharingLevel;
  restrictedResourceTypes?: string[];
}

export interface DataRetentionPolicy {
  retentionPeriodDays: number;
  autoDeleteInactive: boolean;
  backupBeforeDelete: boolean;
  exemptResourceTypes?: string[];
}

export interface IntegrationConfig {
  type: IntegrationType;
  provider: string;
  config: Record<string, any>;
  enabled: boolean;
  lastSync?: Date;
  syncErrors?: string[];
  syncSchedule?: {
    frequency: 'hourly' | 'daily' | 'weekly';
    time?: string; // HH:MM format
  };
}

export interface FeatureFlags {
  allowSelfRegistration: boolean;
  enableAnalytics: boolean;
  enableIntegrations: boolean;
  enableCustomBranding: boolean;
  enableDepartmentHierarchy: boolean;
  enableContentSharing: boolean;
  maxDepartments?: number;
  maxUsersPerDepartment?: number;
}

export interface InstitutionSettings {
  allowSelfRegistration: boolean;
  requireEmailVerification: boolean;
  defaultUserRole: string;
  allowCrossInstitutionCollaboration: boolean;
  contentSharingPolicy: ContentSharingPolicy;
  dataRetentionPolicy: DataRetentionPolicy;
  integrations: IntegrationConfig[];
  customFields: CustomField[];
  featureFlags: FeatureFlags;
  timezone?: string;
  locale?: string;
  academicYearStart?: string; // MM-DD format
}

export interface SubscriptionInfo {
  plan: SubscriptionPlan;
  userLimit: number;
  storageLimit: number; // in GB
  features: string[];
  billingCycle: BillingCycle;
  nextBillingDate: Date;
  status: SubscriptionStatus;
  trialEndsAt?: Date;
  usage?: {
    users: number;
    storage: number;
    apiCalls?: number;
  };
}

// Main Institution interface
export interface Institution {
  id: string;
  name: string;
  domain: string;
  subdomain?: string;
  type: InstitutionType;
  status: InstitutionStatus;
  contactInfo: ContactInfo;
  address: Address;
  settings: InstitutionSettings;
  branding: BrandingConfig;
  subscription: SubscriptionInfo;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// Department configuration models
export interface ClassSettings {
  defaultCapacity: number;
  allowWaitlist: boolean;
  requireApproval: boolean;
  allowSelfEnrollment: boolean;
  gradingScale: 'letter' | 'percentage' | 'points';
  passingGrade: number;
}

export interface GradingPolicy {
  name: string;
  scale: 'letter' | 'percentage' | 'points';
  ranges: {
    min: number;
    max: number;
    grade: string;
  }[];
  allowExtraCredit: boolean;
  roundingRule: 'up' | 'down' | 'nearest';
}

export interface AssignmentDefaults {
  allowLateSubmissions: boolean;
  latePenaltyPercent: number;
  maxLateDays: number;
  allowResubmissions: boolean;
  maxResubmissions: number;
  defaultDueDays: number;
  requireRubric: boolean;
}

export interface CollaborationRules {
  allowPeerReview: boolean;
  allowGroupAssignments: boolean;
  allowCrossClassCollaboration: boolean;
  allowExternalCollaboration: boolean;
  defaultGroupSize: number;
  maxGroupSize: number;
}

export interface DepartmentSettings {
  defaultClassSettings: ClassSettings;
  gradingPolicies: GradingPolicy[];
  assignmentDefaults: AssignmentDefaults;
  collaborationRules: CollaborationRules;
  customFields: CustomField[];
  budgetCode?: string;
  costCenter?: string;
}

// Main Department interface
export interface Department {
  id: string;
  institutionId: string;
  name: string;
  description: string;
  code: string;
  adminId: string;
  settings: DepartmentSettings;
  parentDepartmentId?: string;
  status: DepartmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Analytics models
export interface InstitutionAnalytics {
  id: string;
  institutionId: string;
  metricName: string;
  metricValue: number;
  metadata: Record<string, any>;
  recordedAt: Date;
  dateBucket: Date;
}

export interface DepartmentAnalytics {
  id: string;
  departmentId: string;
  metricName: string;
  metricValue: number;
  metadata: Record<string, any>;
  recordedAt: Date;
  dateBucket: Date;
}

// Invitation models
export interface InstitutionInvitation {
  id: string;
  institutionId: string;
  email: string;
  role: string;
  departmentId?: string;
  invitedBy: string;
  token: string;
  expiresAt: Date;
  acceptedAt?: Date;
  createdAt: Date;
}

// Content sharing models
export interface ContentSharingPolicyRule {
  id: string;
  institutionId: string;
  resourceType: string;
  sharingLevel: SharingLevel;
  conditions: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Creation and update DTOs
export interface InstitutionCreationData {
  name: string;
  domain: string;
  subdomain?: string;
  type: InstitutionType;
  contactInfo: ContactInfo;
  address: Address;
  settings?: Partial<InstitutionSettings>;
  branding?: Partial<BrandingConfig>;
  subscription?: Partial<SubscriptionInfo>;
}

export interface DepartmentCreationData {
  name: string;
  description: string;
  code: string;
  adminId: string;
  parentDepartmentId?: string;
  settings?: Partial<DepartmentSettings>;
}

// Filter and query interfaces
export interface InstitutionFilters {
  type?: InstitutionType;
  status?: InstitutionStatus;
  domain?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface DepartmentFilters {
  institutionId?: string;
  status?: DepartmentStatus;
  adminId?: string;
  parentDepartmentId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// Validation interfaces
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

// Multi-tenant context
export interface TenantContext {
  institutionId: string;
  departmentId?: string;
  userId: string;
  role: string;
  permissions: string[];
}