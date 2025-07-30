// TypeScript interfaces for User Onboarding Flow

export interface OnboardingData {
  userId: string;
  role: UserRole;
  institutionId?: string;
  departmentId?: string;
  classIds?: string[];
  skippedSteps: string[];
  completedAt?: Date;
  currentStep: number;
  preferences?: Record<string, unknown>;
}

export interface ClassInfo {
  id: string;
  name: string;
  code: string;
  description?: string;
  teacherName: string;
  teacherId: string;
  institutionId: string;
  departmentId?: string;
  studentCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassJoinResult {
  success: boolean;
  class?: ClassInfo;
  error?: string;
  message?: string;
}

export interface OnboardingSession {
  id: string;
  userId: string;
  currentStep: number;
  totalSteps: number;
  data: OnboardingData;
  startedAt: Date;
  completedAt?: Date;
  lastActivity: Date;
}

export interface Institution {
  id: string;
  name: string;
  domain?: string;
  subdomain?: string;
  type: InstitutionType;
  status: InstitutionStatus;
  contactEmail?: string;
  contactPhone?: string;
  address?: Address;
  settings: InstitutionSettings;
  branding: BrandingConfig;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface Department {
  id: string;
  institutionId: string;
  name: string;
  description?: string;
  code?: string;
  adminId?: string;
  parentDepartmentId?: string;
  settings: DepartmentSettings;
  status: DepartmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  STUDENT = 'student',
  TEACHER = 'teacher',
  DEPARTMENT_ADMIN = 'department_admin',
  INSTITUTION_ADMIN = 'institution_admin',
  SYSTEM_ADMIN = 'system_admin'
}

export enum InstitutionType {
  UNIVERSITY = 'university',
  COLLEGE = 'college',
  SCHOOL = 'school',
  TRAINING_CENTER = 'training_center',
  OTHER = 'other'
}

export enum InstitutionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending'
}

export enum DepartmentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived'
}

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface InstitutionSettings {
  allowSelfRegistration: boolean;
  requireEmailVerification: boolean;
  defaultUserRole: UserRole;
  allowCrossInstitutionCollaboration: boolean;
  customFields?: CustomField[];
}

export interface DepartmentSettings {
  defaultClassSettings?: Record<string, unknown>;
  customFields?: CustomField[];
}

export interface BrandingConfig {
  logo?: string;
  favicon?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;
  fontFamily?: string;
  customCSS?: string;
  welcomeMessage?: string;
  footerText?: string;
}

export interface CustomField {
  id: string;
  name: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'multiselect';
  required: boolean;
  options?: string[];
  defaultValue?: unknown;
}

export interface OnboardingStepData {
  stepId: string;
  stepName: string;
  completed: boolean;
  data?: Record<string, unknown>;
  skipped?: boolean;
  completedAt?: Date;
}

export interface OnboardingContextType {
  currentStep: number;
  totalSteps: number;
  onboardingData: OnboardingData;
  session?: OnboardingSession;
  loading: boolean;
  error?: string;
  updateOnboardingData: (data: Partial<OnboardingData>) => Promise<void>;
  nextStep: () => Promise<void>;
  previousStep: () => Promise<void>;
  skipStep: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  restartOnboarding: () => Promise<void>;
}

// API Response types
export interface OnboardingApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface InstitutionSearchResult {
  id: string;
  name: string;
  domain?: string;
  type: InstitutionType;
  departmentCount: number;
  userCount: number;
}

export interface DepartmentSearchResult {
  id: string;
  name: string;
  code?: string;
  description?: string;
  userCount: number;
  adminName?: string;
}

// Validation schemas
export interface OnboardingValidationRules {
  role: {
    required: boolean;
    allowedValues: UserRole[];
  };
  institution: {
    required: boolean;
    validateDomain?: boolean;
  };
  department: {
    required: boolean;
    mustBelongToInstitution?: boolean;
  };
}

// Error types
export class OnboardingError extends Error {
  constructor(
    message: string,
    public code: string,
    public step?: number,
    public field?: string
  ) {
    super(message);
    this.name = 'OnboardingError';
  }
}

export enum OnboardingErrorCode {
  INVALID_STEP = 'INVALID_STEP',
  MISSING_REQUIRED_DATA = 'MISSING_REQUIRED_DATA',
  INVALID_ROLE = 'INVALID_ROLE',
  INSTITUTION_NOT_FOUND = 'INSTITUTION_NOT_FOUND',
  DEPARTMENT_NOT_FOUND = 'DEPARTMENT_NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  VALIDATION_FAILED = 'VALIDATION_FAILED'
}