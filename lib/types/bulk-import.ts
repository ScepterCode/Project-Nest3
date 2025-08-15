// Enhanced types for bulk import system

export type FileFormat = 'csv' | 'excel' | 'json';
export type ImportStatus = 'processing' | 'completed' | 'failed' | 'cancelled' | 'validating';
export type NotificationType = 'started' | 'completed' | 'failed' | 'warning';
export type DeliveryStatus = 'pending' | 'sent' | 'failed';

export interface BulkImportOptions {
  institutionId: string;
  defaultRole?: string;
  sendWelcomeEmails: boolean;
  dryRun: boolean;
  batchSize: number;
  skipDuplicates?: boolean;
  updateExisting?: boolean;
  createSnapshot?: boolean;
  assignToDepartment?: string;
  validateOnly?: boolean;
}

export interface ImportResult {
  importId: string;
  totalRecords: number;
  successfulImports: number;
  failedImports: number;
  skippedImports: number;
  errors: ImportError[];
  warnings: ImportWarning[];
  summary: ImportSummary;
  duration: number;
  snapshotId?: string;
}

export interface ImportError {
  id?: string;
  importId?: string;
  row?: number;
  errorType: string;
  errorMessage: string;
  fieldName?: string;
  fieldValue?: any;
  rawData: Record<string, any>;
  suggestedFix?: string;
  isFixable: boolean;
  code: string;
}

export interface ImportWarning {
  id?: string;
  importId?: string;
  row?: number;
  warningType: string;
  warningMessage: string;
  fieldName?: string;
  fieldValue?: any;
  code: string;
}

export interface ImportSummary {
  totalRecords: number;
  validRecords: number;
  duplicateEmails: number;
  missingRequiredFields: number;
  invalidEmails: number;
  unknownRoles: number;
  departmentMismatches: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ImportError[];
  warnings: ImportWarning[];
  suggestions: string[];
  summary: ImportSummary;
}

export interface ImportStatus {
  importId: string;
  status: ImportStatus;
  progress: ImportProgress;
  startedAt: Date;
  completedAt?: Date;
  estimatedTimeRemaining?: number;
  currentStage: string;
}

export interface ImportProgress {
  currentStep: number;
  totalSteps: number;
  progressPercentage: number;
  statusMessage: string;
  stage: string;
}

export interface BulkImport {
  id: string;
  institutionId: string;
  initiatedBy: string;
  fileName: string;
  fileSize: number;
  fileType: FileFormat;
  totalRecords: number;
  processedRecords: number;
  successfulRecords: number;
  failedRecords: number;
  status: ImportStatus;
  startedAt: Date;
  completedAt?: Date;
  errorReport: Record<string, any>;
  validationReport: Record<string, any>;
  importOptions: BulkImportOptions;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MigrationSnapshot {
  id: string;
  institutionId: string;
  importId?: string;
  snapshotType: 'user_import' | 'course_import' | 'full_migration';
  originalData: any[];
  importedRecords: string[];
  rollbackData: Record<string, any>;
  isRolledBack: boolean;
  rollbackDate?: Date;
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface RollbackResult {
  success: boolean;
  recordsRolledBack: number;
  errors: ImportError[];
  warnings: ImportWarning[];
  duration: number;
  snapshotId: string;
}

export interface ImportNotification {
  id: string;
  importId: string;
  recipientId: string;
  notificationType: NotificationType;
  subject: string;
  message: string;
  sentAt?: Date;
  deliveryStatus: DeliveryStatus;
  createdAt: Date;
}

export interface FileUploadResult {
  success: boolean;
  fileName: string;
  fileSize: number;
  fileType: FileFormat;
  previewData?: any[];
  errors?: string[];
}

export interface ImportTemplate {
  requiredFields: string[];
  optionalFields: string[];
  fieldDescriptions: Record<string, string>;
  fieldValidation: Record<string, FieldValidation>;
  sampleData: Record<string, any>[];
}

export interface FieldValidation {
  type: 'string' | 'email' | 'number' | 'date' | 'enum';
  required: boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  enumValues?: string[];
  customValidator?: string;
}

export interface ParsedFileData {
  headers: string[];
  data: Record<string, any>[];
  totalRows: number;
  errors: ImportError[];
  warnings: ImportWarning[];
}

export interface BatchProcessResult {
  batchNumber: number;
  recordsProcessed: number;
  recordsImported: number;
  recordsSkipped: number;
  recordsFailed: number;
  errors: ImportError[];
  warnings: ImportWarning[];
  importedUserIds: string[];
}

export interface ImportMetrics {
  importId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  throughputPerSecond: number;
  memoryUsage: number;
  errorRate: number;
  successRate: number;
}

export interface UserImportData {
  email: string;
  firstName: string;
  lastName: string;
  role?: string;
  department?: string;
  studentId?: string;
  grade?: string | number;
  phone?: string;
  address?: string;
  dateOfBirth?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  customFields?: Record<string, any>;
}

export interface ImportConfiguration {
  maxFileSize: number; // in bytes
  maxRecordsPerImport: number;
  supportedFormats: FileFormat[];
  defaultBatchSize: number;
  maxBatchSize: number;
  validationRules: Record<string, any>;
  notificationSettings: {
    sendStartNotification: boolean;
    sendCompletionNotification: boolean;
    sendErrorNotification: boolean;
    includeDetailedReport: boolean;
  };
}

// Error codes for consistent error handling
export const ImportErrorCodes = {
  // File errors
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  FILE_CORRUPTED: 'FILE_CORRUPTED',
  EMPTY_FILE: 'EMPTY_FILE',
  
  // Parsing errors
  PARSE_ERROR: 'PARSE_ERROR',
  INVALID_HEADERS: 'INVALID_HEADERS',
  COLUMN_MISMATCH: 'COLUMN_MISMATCH',
  
  // Validation errors
  REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',
  INVALID_EMAIL_FORMAT: 'INVALID_EMAIL_FORMAT',
  DUPLICATE_EMAIL: 'DUPLICATE_EMAIL',
  INVALID_ROLE: 'INVALID_ROLE',
  DEPARTMENT_NOT_FOUND: 'DEPARTMENT_NOT_FOUND',
  INVALID_DATE_FORMAT: 'INVALID_DATE_FORMAT',
  FIELD_TOO_LONG: 'FIELD_TOO_LONG',
  
  // Processing errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  
  // Rollback errors
  SNAPSHOT_NOT_FOUND: 'SNAPSHOT_NOT_FOUND',
  ROLLBACK_FAILED: 'ROLLBACK_FAILED',
  ALREADY_ROLLED_BACK: 'ALREADY_ROLLED_BACK'
} as const;

export type ImportErrorCode = typeof ImportErrorCodes[keyof typeof ImportErrorCodes];

// Warning codes for consistent warning handling
export const ImportWarningCodes = {
  UNKNOWN_ROLE: 'UNKNOWN_ROLE',
  INVALID_GRADE: 'INVALID_GRADE',
  MISSING_OPTIONAL_FIELD: 'MISSING_OPTIONAL_FIELD',
  DATA_TRUNCATED: 'DATA_TRUNCATED',
  DEPARTMENT_MISMATCH: 'DEPARTMENT_MISMATCH',
  DUPLICATE_RECORD: 'DUPLICATE_RECORD',
  PARTIAL_DATA: 'PARTIAL_DATA'
} as const;

export type ImportWarningCode = typeof ImportWarningCodes[keyof typeof ImportWarningCodes];