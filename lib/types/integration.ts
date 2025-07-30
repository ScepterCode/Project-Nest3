export type IntegrationType = 'sso' | 'sis' | 'lms' | 'analytics' | 'storage';

export type IntegrationProvider = 
  // SSO Providers
  | 'saml' | 'oauth2' | 'oidc' | 'google' | 'microsoft' | 'okta' | 'auth0'
  // SIS Providers  
  | 'powerschool' | 'infinite_campus' | 'skyward' | 'clever' | 'classlink'
  // LMS Providers
  | 'canvas' | 'blackboard' | 'moodle' | 'schoology' | 'd2l';

export type IntegrationStatus = 'active' | 'inactive' | 'error' | 'syncing' | 'pending';

export interface IntegrationConfig {
  id: string;
  institutionId: string;
  type: IntegrationType;
  provider: IntegrationProvider;
  name: string;
  description?: string;
  config: Record<string, any>;
  enabled: boolean;
  status: IntegrationStatus;
  lastSync?: Date;
  lastSyncStatus?: 'success' | 'error' | 'partial';
  syncErrors?: string[];
  syncSchedule?: string; // cron expression
  healthCheckUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface SSOConfig {
  entityId: string;
  ssoUrl: string;
  sloUrl?: string;
  certificate: string;
  attributeMapping: {
    email: string;
    firstName: string;
    lastName: string;
    role?: string;
    department?: string;
  };
  nameIdFormat?: string;
  signRequests?: boolean;
  encryptAssertions?: boolean;
}

export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string[];
  redirectUri: string;
  attributeMapping: {
    email: string;
    firstName: string;
    lastName: string;
    role?: string;
    department?: string;
  };
}

export interface SISConfig {
  apiUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
  schoolId?: string;
  syncSettings: {
    syncUsers: boolean;
    syncCourses: boolean;
    syncEnrollments: boolean;
    syncGrades: boolean;
  };
  fieldMapping: {
    studentId: string;
    email: string;
    firstName: string;
    lastName: string;
    grade?: string;
    courseId?: string;
    courseName?: string;
  };
}

export interface LMSConfig {
  apiUrl: string;
  apiKey?: string;
  accessToken?: string;
  syncSettings: {
    syncCourses: boolean;
    syncAssignments: boolean;
    syncGrades: boolean;
    syncSubmissions: boolean;
  };
  fieldMapping: {
    courseId: string;
    courseName: string;
    assignmentId: string;
    assignmentName: string;
    studentId: string;
    grade?: string;
  };
}

export interface IntegrationHealth {
  integrationId: string;
  status: 'healthy' | 'warning' | 'error';
  lastCheck: Date;
  responseTime?: number;
  errorMessage?: string;
  uptime: number; // percentage
  metrics: {
    successfulSyncs: number;
    failedSyncs: number;
    lastSyncDuration?: number;
    avgSyncDuration?: number;
  };
}

export interface DataImportResult {
  success: boolean;
  recordsProcessed: number;
  recordsImported: number;
  recordsSkipped: number;
  recordsFailed: number;
  errors: ImportError[];
  warnings: ImportWarning[];
  duration: number;
}

export interface ImportError {
  row?: number;
  field?: string;
  value?: any;
  message: string;
  code: string;
}

export interface ImportWarning {
  row?: number;
  field?: string;
  value?: any;
  message: string;
  code: string;
}

export interface SyncJob {
  id: string;
  integrationId: string;
  type: 'full' | 'incremental' | 'manual';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: Date;
  completedAt?: Date;
  result?: DataImportResult;
  progress?: {
    current: number;
    total: number;
    stage: string;
  };
}