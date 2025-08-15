import { createClient } from '@/lib/supabase/server';
import { 
  BulkImportOptions,
  ImportResult,
  ImportError,
  ImportWarning,
  ValidationResult,
  ImportStatus as ImportStatusType,
  ImportProgress,
  BulkImport,
  MigrationSnapshot,
  RollbackResult,
  ImportTemplate,
  ParsedFileData,
  BatchProcessResult,
  UserImportData,
  ImportErrorCodes,
  ImportWarningCodes,
  FileFormat,
  ImportNotification,
  NotificationType,
  ImportSummary
} from '@/lib/types/bulk-import';
import { NotificationService } from './notification-service';
import { AuditLogger } from './audit-logger';

export class EnhancedBulkUserImportService {
  private supabase = createClient();
  private notificationService = new NotificationService();
  private auditLogger = new AuditLogger();
  
  private readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly MAX_RECORDS_PER_IMPORT = 10000;
  private readonly DEFAULT_BATCH_SIZE = 100;

  /**
   * Get comprehensive import template with validation rules
   */
  getImportTemplate(): ImportTemplate {
    return {
      requiredFields: ['email', 'firstName', 'lastName'],
      optionalFields: [
        'role', 'department', 'studentId', 'grade', 'phone', 
        'address', 'dateOfBirth', 'emergencyContact', 'emergencyPhone'
      ],
      fieldDescriptions: {
        email: 'User email address (must be unique and valid format)',
        firstName: 'User first name (required, max 50 characters)',
        lastName: 'User last name (required, max 50 characters)',
        role: 'User role: student, teacher, department_admin, or institution_admin',
        department: 'Department name (must exist in institution)',
        studentId: 'Student ID number (optional, must be unique if provided)',
        grade: 'Grade level (1-12 for students)',
        phone: 'Phone number (optional)',
        address: 'Mailing address (optional)',
        dateOfBirth: 'Date of birth in YYYY-MM-DD format',
        emergencyContact: 'Emergency contact name',
        emergencyPhone: 'Emergency contact phone number'
      },
      fieldValidation: {
        email: { type: 'email', required: true, maxLength: 255 },
        firstName: { type: 'string', required: true, maxLength: 50, minLength: 1 },
        lastName: { type: 'string', required: true, maxLength: 50, minLength: 1 },
        role: { 
          type: 'enum', 
          required: false, 
          enumValues: ['student', 'teacher', 'department_admin', 'institution_admin'] 
        },
        department: { type: 'string', required: false, maxLength: 100 },
        studentId: { type: 'string', required: false, maxLength: 50 },
        grade: { type: 'number', required: false },
        phone: { type: 'string', required: false, maxLength: 20 },
        address: { type: 'string', required: false, maxLength: 255 },
        dateOfBirth: { type: 'date', required: false },
        emergencyContact: { type: 'string', required: false, maxLength: 100 },
        emergencyPhone: { type: 'string', required: false, maxLength: 20 }
      },
      sampleData: [
        {
          email: 'john.doe@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'student',
          department: 'Computer Science',
          studentId: 'CS2024001',
          grade: '10',
          phone: '555-0123',
          dateOfBirth: '2008-05-15'
        },
        {
          email: 'jane.smith@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          role: 'teacher',
          department: 'Mathematics',
          phone: '555-0456',
          emergencyContact: 'John Smith',
          emergencyPhone: '555-0789'
        }
      ]
    };
  }

  /**
   * Generate CSV template file content
   */
  generateCSVTemplate(): string {
    const template = this.getImportTemplate();
    const headers = [...template.requiredFields, ...template.optionalFields];
    const csvRows = [headers.join(',')];
    
    // Add sample data
    template.sampleData.forEach(sample => {
      const values = headers.map(header => {
        const value = sample[header] || '';
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
      });
      csvRows.push(values.join(','));
    });

    return csvRows.join('\n');
  }

  /**
   * Parse and validate file content
   */
  async parseFile(
    fileContent: string | Buffer,
    fileName: string,
    fileType: FileFormat
  ): Promise<ParsedFileData> {
    const result: ParsedFileData = {
      headers: [],
      data: [],
      totalRows: 0,
      errors: [],
      warnings: []
    };

    try {
      switch (fileType) {
        case 'csv':
          return this.parseCSV(fileContent as string);
        case 'excel':
          return this.parseExcel(fileContent as Buffer);
        case 'json':
          return this.parseJSON(fileContent as string);
        default:
          result.errors.push({
            errorType: 'FILE_FORMAT',
            errorMessage: `Unsupported file format: ${fileType}`,
            code: ImportErrorCodes.UNSUPPORTED_FORMAT,
            rawData: {},
            isFixable: false
          });
          return result;
      }
    } catch (error) {
      result.errors.push({
        errorType: 'PARSE_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Failed to parse file',
        code: ImportErrorCodes.PARSE_ERROR,
        rawData: {},
        isFixable: false
      });
      return result;
    }
  }

  /**
   * Comprehensive data validation with detailed error reporting
   */
  async validateImportData(
    institutionId: string,
    data: UserImportData[]
  ): Promise<ValidationResult> {
    const errors: ImportError[] = [];
    const warnings: ImportWarning[] = [];
    const suggestions: string[] = [];

    // Get template for validation rules
    const template = this.getImportTemplate();
    
    // Get existing users and departments for validation
    const { data: existingUsers } = await this.supabase
      .from('user_profiles')
      .select('email, student_id')
      .eq('institution_id', institutionId);

    const { data: departments } = await this.supabase
      .from('departments')
      .select('name')
      .eq('institution_id', institutionId);

    const existingEmails = new Set(existingUsers?.map(u => u.email.toLowerCase()) || []);
    const existingStudentIds = new Set(existingUsers?.map(u => u.student_id).filter(Boolean) || []);
    const validDepartments = new Set(departments?.map(d => d.name) || []);

    // Track duplicates within the import data
    const emailsInImport = new Set<string>();
    const studentIdsInImport = new Set<string>();

    data.forEach((record, index) => {
      const row = index + 1;
      
      // Validate required fields
      template.requiredFields.forEach(field => {
        const value = record[field as keyof UserImportData];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          errors.push({
            row,
            errorType: 'VALIDATION',
            errorMessage: `Required field '${field}' is missing or empty`,
            fieldName: field,
            fieldValue: value,
            code: ImportErrorCodes.REQUIRED_FIELD_MISSING,
            rawData: record,
            isFixable: true,
            suggestedFix: `Provide a value for ${field}`
          });
        }
      });

      // Validate email format and uniqueness
      if (record.email) {
        const email = record.email.toLowerCase().trim();
        
        if (!this.isValidEmail(email)) {
          errors.push({
            row,
            errorType: 'VALIDATION',
            errorMessage: 'Invalid email format',
            fieldName: 'email',
            fieldValue: record.email,
            code: ImportErrorCodes.INVALID_EMAIL_FORMAT,
            rawData: record,
            isFixable: true,
            suggestedFix: 'Provide a valid email address (e.g., user@domain.com)'
          });
        } else {
          // Check for duplicates in existing data
          if (existingEmails.has(email)) {
            warnings.push({
              row,
              warningType: 'DUPLICATE',
              warningMessage: 'Email already exists in the system',
              fieldName: 'email',
              fieldValue: record.email,
              code: ImportWarningCodes.DUPLICATE_RECORD
            });
          }
          
          // Check for duplicates within import data
          if (emailsInImport.has(email)) {
            errors.push({
              row,
              errorType: 'VALIDATION',
              errorMessage: 'Duplicate email within import data',
              fieldName: 'email',
              fieldValue: record.email,
              code: ImportErrorCodes.DUPLICATE_EMAIL,
              rawData: record,
              isFixable: true,
              suggestedFix: 'Remove duplicate entries or use unique email addresses'
            });
          } else {
            emailsInImport.add(email);
          }
        }
      }

      // Validate role
      if (record.role) {
        const validRoles = template.fieldValidation.role.enumValues || [];
        if (!validRoles.includes(record.role.toLowerCase())) {
          warnings.push({
            row,
            warningType: 'VALIDATION',
            warningMessage: `Unknown role '${record.role}', will default to 'student'`,
            fieldName: 'role',
            fieldValue: record.role,
            code: ImportWarningCodes.UNKNOWN_ROLE
          });
        }
      }

      // Validate department
      if (record.department && validDepartments.size > 0) {
        if (!validDepartments.has(record.department)) {
          warnings.push({
            row,
            warningType: 'VALIDATION',
            warningMessage: `Department '${record.department}' not found in institution`,
            fieldName: 'department',
            fieldValue: record.department,
            code: ImportWarningCodes.DEPARTMENT_MISMATCH
          });
        }
      }

      // Validate student ID uniqueness
      if (record.studentId) {
        const studentId = record.studentId.trim();
        if (existingStudentIds.has(studentId)) {
          warnings.push({
            row,
            warningType: 'DUPLICATE',
            warningMessage: 'Student ID already exists in the system',
            fieldName: 'studentId',
            fieldValue: record.studentId,
            code: ImportWarningCodes.DUPLICATE_RECORD
          });
        }
        
        if (studentIdsInImport.has(studentId)) {
          errors.push({
            row,
            errorType: 'VALIDATION',
            errorMessage: 'Duplicate student ID within import data',
            fieldName: 'studentId',
            fieldValue: record.studentId,
            code: ImportErrorCodes.DUPLICATE_EMAIL,
            rawData: record,
            isFixable: true,
            suggestedFix: 'Use unique student IDs for each student'
          });
        } else {
          studentIdsInImport.add(studentId);
        }
      }

      // Validate grade
      if (record.grade) {
        const grade = typeof record.grade === 'string' ? parseInt(record.grade) : record.grade;
        if (isNaN(grade) || grade < 1 || grade > 12) {
          warnings.push({
            row,
            warningType: 'VALIDATION',
            warningMessage: 'Grade should be a number between 1 and 12',
            fieldName: 'grade',
            fieldValue: record.grade,
            code: ImportWarningCodes.INVALID_GRADE
          });
        }
      }

      // Validate date of birth
      if (record.dateOfBirth && !this.isValidDate(record.dateOfBirth)) {
        warnings.push({
          row,
          warningType: 'VALIDATION',
          warningMessage: 'Invalid date format, expected YYYY-MM-DD',
          fieldName: 'dateOfBirth',
          fieldValue: record.dateOfBirth,
          code: ImportWarningCodes.PARTIAL_DATA
        });
      }

      // Validate field lengths
      Object.entries(record).forEach(([field, value]) => {
        if (value && typeof value === 'string') {
          const validation = template.fieldValidation[field];
          if (validation?.maxLength && value.length > validation.maxLength) {
            warnings.push({
              row,
              warningType: 'VALIDATION',
              warningMessage: `Field '${field}' exceeds maximum length of ${validation.maxLength}`,
              fieldName: field,
              fieldValue: value,
              code: ImportWarningCodes.DATA_TRUNCATED
            });
          }
        }
      });
    });

    // Generate suggestions based on common issues
    if (errors.some(e => e.code === ImportErrorCodes.REQUIRED_FIELD_MISSING)) {
      suggestions.push('Ensure all required fields (email, firstName, lastName) are filled for each user');
    }
    
    if (warnings.some(w => w.code === ImportWarningCodes.UNKNOWN_ROLE)) {
      suggestions.push('Valid roles are: student, teacher, department_admin, institution_admin');
    }
    
    if (warnings.some(w => w.code === ImportWarningCodes.DEPARTMENT_MISMATCH)) {
      suggestions.push('Create departments in your institution before importing users, or leave department field empty');
    }
    
    if (errors.some(e => e.code === ImportErrorCodes.DUPLICATE_EMAIL)) {
      suggestions.push('Remove duplicate email addresses from your import file');
    }

    // Calculate summary
    const summary = this.calculateValidationSummary(data, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      summary
    };
  }

  /**
   * Process bulk import with comprehensive error handling and progress tracking
   */
  async processImport(
    institutionId: string,
    initiatedBy: string,
    fileContent: string | Buffer,
    fileName: string,
    fileType: FileFormat,
    options: BulkImportOptions
  ): Promise<ImportResult> {
    const startTime = Date.now();
    
    // Create import record
    const { data: importRecord, error: createError } = await this.supabase
      .from('bulk_imports')
      .insert({
        institution_id: institutionId,
        initiated_by: initiatedBy,
        file_name: fileName,
        file_size: typeof fileContent === 'string' ? fileContent.length : fileContent.length,
        file_type: fileType,
        status: 'validating',
        import_options: options,
        metadata: { startTime }
      })
      .select()
      .single();

    if (createError || !importRecord) {
      throw new Error(`Failed to create import record: ${createError?.message}`);
    }

    const importId = importRecord.id;

    try {
      // Send start notification
      if (!options.dryRun) {
        await this.sendNotification(importId, initiatedBy, 'started', 
          'Bulk Import Started', 
          `Your bulk import of ${fileName} has started processing.`
        );
      }

      // Update progress
      await this.updateProgress(importId, 'parsing', 0, 100, 'Parsing file...');

      // Parse file
      const parseResult = await this.parseFile(fileContent, fileName, fileType);
      
      if (parseResult.errors.length > 0) {
        await this.updateImportStatus(importId, 'failed', {
          errors: parseResult.errors,
          stage: 'parsing'
        });
        
        return {
          importId,
          totalRecords: 0,
          successfulImports: 0,
          failedImports: 0,
          skippedImports: 0,
          errors: parseResult.errors,
          warnings: parseResult.warnings,
          summary: this.calculateValidationSummary([], parseResult.errors, parseResult.warnings),
          duration: Date.now() - startTime
        };
      }

      // Update progress
      await this.updateProgress(importId, 'validating', 25, 100, 'Validating data...');

      // Validate data
      const validationResult = await this.validateImportData(institutionId, parseResult.data);
      
      // Store validation results
      await this.supabase
        .from('bulk_imports')
        .update({
          total_records: parseResult.data.length,
          validation_report: validationResult
        })
        .eq('id', importId);

      // Store errors and warnings
      if (validationResult.errors.length > 0) {
        await this.storeImportErrors(importId, validationResult.errors);
      }
      
      if (validationResult.warnings.length > 0) {
        await this.storeImportWarnings(importId, validationResult.warnings);
      }

      // If validation only, return results
      if (options.validateOnly || options.dryRun) {
        await this.updateImportStatus(importId, 'completed', {
          validationOnly: true,
          summary: validationResult.summary
        });

        return {
          importId,
          totalRecords: parseResult.data.length,
          successfulImports: 0,
          failedImports: 0,
          skippedImports: 0,
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          summary: validationResult.summary,
          duration: Date.now() - startTime
        };
      }

      // If validation failed and not in dry run mode, stop processing
      if (!validationResult.isValid) {
        await this.updateImportStatus(importId, 'failed', {
          errors: validationResult.errors,
          stage: 'validation'
        });

        await this.sendNotification(importId, initiatedBy, 'failed',
          'Bulk Import Failed',
          `Your bulk import failed validation. Please check the error report and try again.`
        );

        return {
          importId,
          totalRecords: parseResult.data.length,
          successfulImports: 0,
          failedImports: parseResult.data.length,
          skippedImports: 0,
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          summary: validationResult.summary,
          duration: Date.now() - startTime
        };
      }

      // Create snapshot for rollback
      let snapshotId: string | undefined;
      if (options.createSnapshot) {
        snapshotId = await this.createSnapshot(institutionId, importId, parseResult.data);
      }

      // Update progress
      await this.updateProgress(importId, 'processing', 50, 100, 'Processing users...');

      // Process import in batches
      const batchSize = options.batchSize || this.DEFAULT_BATCH_SIZE;
      const batches = this.chunkArray(parseResult.data, batchSize);
      
      let totalImported = 0;
      let totalSkipped = 0;
      let totalFailed = 0;
      const allErrors: ImportError[] = [...validationResult.errors];
      const allWarnings: ImportWarning[] = [...validationResult.warnings];
      const importedUserIds: string[] = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchResult = await this.processBatch(
          importId,
          institutionId,
          batch,
          options,
          i * batchSize
        );

        totalImported += batchResult.recordsImported;
        totalSkipped += batchResult.recordsSkipped;
        totalFailed += batchResult.recordsFailed;
        allErrors.push(...batchResult.errors);
        allWarnings.push(...batchResult.warnings);
        importedUserIds.push(...batchResult.importedUserIds);

        // Update progress
        const progress = Math.min(50 + ((i + 1) / batches.length) * 40, 90);
        await this.updateProgress(importId, 'processing', progress, 100, 
          `Processed batch ${i + 1} of ${batches.length}`);
      }

      // Update snapshot with imported records
      if (snapshotId && importedUserIds.length > 0) {
        await this.updateSnapshot(snapshotId, importedUserIds);
      }

      // Send welcome emails if requested
      if (options.sendWelcomeEmails && importedUserIds.length > 0) {
        await this.updateProgress(importId, 'notifications', 90, 100, 'Sending welcome emails...');
        await this.sendWelcomeEmails(importedUserIds, institutionId);
      }

      // Final status update
      const finalStatus = totalFailed > 0 ? 'completed' : 'completed';
      await this.updateImportStatus(importId, finalStatus, {
        totalImported,
        totalSkipped,
        totalFailed,
        importedUserIds,
        snapshotId
      });

      await this.updateProgress(importId, 'completed', 100, 100, 'Import completed');

      // Send completion notification
      const notificationType: NotificationType = totalFailed > 0 ? 'warning' : 'completed';
      const subject = totalFailed > 0 ? 'Bulk Import Completed with Warnings' : 'Bulk Import Completed Successfully';
      const message = `Your bulk import has completed. ${totalImported} users imported, ${totalSkipped} skipped, ${totalFailed} failed.`;
      
      await this.sendNotification(importId, initiatedBy, notificationType, subject, message);

      // Log audit event
      await this.auditLogger.log({
        action: 'bulk_user_import',
        userId: initiatedBy,
        institutionId,
        details: {
          importId,
          fileName,
          totalRecords: parseResult.data.length,
          successfulImports: totalImported,
          failedImports: totalFailed,
          skippedImports: totalSkipped
        }
      });

      return {
        importId,
        totalRecords: parseResult.data.length,
        successfulImports: totalImported,
        failedImports: totalFailed,
        skippedImports: totalSkipped,
        errors: allErrors,
        warnings: allWarnings,
        summary: this.calculateValidationSummary(parseResult.data, allErrors, allWarnings),
        duration: Date.now() - startTime,
        snapshotId
      };

    } catch (error) {
      // Handle unexpected errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await this.updateImportStatus(importId, 'failed', {
        error: errorMessage,
        stage: 'processing'
      });

      await this.sendNotification(importId, initiatedBy, 'failed',
        'Bulk Import Failed',
        `Your bulk import encountered an unexpected error: ${errorMessage}`
      );

      throw error;
    }
  }

  /**
   * Get import status with detailed progress information
   */
  async getImportStatus(importId: string): Promise<ImportStatusType | null> {
    const { data: importData } = await this.supabase
      .from('bulk_imports')
      .select('*')
      .eq('id', importId)
      .single();

    if (!importData) return null;

    const { data: progressData } = await this.supabase
      .from('import_progress')
      .select('*')
      .eq('import_id', importId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    return {
      importId,
      status: importData.status,
      progress: progressData ? {
        currentStep: progressData.current_step,
        totalSteps: progressData.total_steps,
        progressPercentage: progressData.progress_percentage,
        statusMessage: progressData.status_message,
        stage: progressData.stage
      } : {
        currentStep: 0,
        totalSteps: 100,
        progressPercentage: 0,
        statusMessage: 'Initializing...',
        stage: 'init'
      },
      startedAt: new Date(importData.started_at),
      completedAt: importData.completed_at ? new Date(importData.completed_at) : undefined,
      currentStage: progressData?.stage || 'init'
    };
  }

  /**
   * Rollback import using snapshot
   */
  async rollbackImport(snapshotId: string, userId: string): Promise<RollbackResult> {
    const startTime = Date.now();
    
    const { data: snapshot, error: snapshotError } = await this.supabase
      .from('migration_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .single();

    if (snapshotError || !snapshot) {
      return {
        success: false,
        recordsRolledBack: 0,
        errors: [{
          errorType: 'ROLLBACK',
          errorMessage: 'Snapshot not found',
          code: ImportErrorCodes.SNAPSHOT_NOT_FOUND,
          rawData: {},
          isFixable: false
        }],
        warnings: [],
        duration: Date.now() - startTime,
        snapshotId
      };
    }

    if (snapshot.is_rolled_back) {
      return {
        success: false,
        recordsRolledBack: 0,
        errors: [{
          errorType: 'ROLLBACK',
          errorMessage: 'Import has already been rolled back',
          code: ImportErrorCodes.ALREADY_ROLLED_BACK,
          rawData: {},
          isFixable: false
        }],
        warnings: [],
        duration: Date.now() - startTime,
        snapshotId
      };
    }

    try {
      const importedUserIds = snapshot.imported_records as string[];
      
      // Delete imported users
      const { error: deleteError } = await this.supabase
        .from('user_profiles')
        .delete()
        .in('id', importedUserIds);

      if (deleteError) {
        return {
          success: false,
          recordsRolledBack: 0,
          errors: [{
            errorType: 'ROLLBACK',
            errorMessage: `Failed to rollback users: ${deleteError.message}`,
            code: ImportErrorCodes.ROLLBACK_FAILED,
            rawData: {},
            isFixable: false
          }],
          warnings: [],
          duration: Date.now() - startTime,
          snapshotId
        };
      }

      // Mark snapshot as rolled back
      await this.supabase
        .from('migration_snapshots')
        .update({
          is_rolled_back: true,
          rollback_date: new Date().toISOString(),
          metadata: {
            ...snapshot.metadata,
            rolledBackBy: userId,
            rollbackReason: 'Manual rollback'
          }
        })
        .eq('id', snapshotId);

      // Log audit event
      await this.auditLogger.log({
        action: 'bulk_import_rollback',
        userId,
        institutionId: snapshot.institution_id,
        details: {
          snapshotId,
          importId: snapshot.import_id,
          recordsRolledBack: importedUserIds.length
        }
      });

      return {
        success: true,
        recordsRolledBack: importedUserIds.length,
        errors: [],
        warnings: [],
        duration: Date.now() - startTime,
        snapshotId
      };

    } catch (error) {
      return {
        success: false,
        recordsRolledBack: 0,
        errors: [{
          errorType: 'ROLLBACK',
          errorMessage: error instanceof Error ? error.message : 'Rollback failed',
          code: ImportErrorCodes.ROLLBACK_FAILED,
          rawData: {},
          isFixable: false
        }],
        warnings: [],
        duration: Date.now() - startTime,
        snapshotId
      };
    }
  }

  /**
   * Get import history for institution
   */
  async getImportHistory(institutionId: string, limit = 50): Promise<BulkImport[]> {
    const { data, error } = await this.supabase
      .from('bulk_imports')
      .select(`
        *,
        user_profiles!bulk_imports_initiated_by_fkey(first_name, last_name, email)
      `)
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch import history: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get available snapshots for rollback
   */
  async getAvailableSnapshots(institutionId: string): Promise<MigrationSnapshot[]> {
    const { data, error } = await this.supabase
      .from('migration_snapshots')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_rolled_back', false)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch snapshots: ${error.message}`);
    }

    return data || [];
  }

  // Private helper methods

  private parseCSV(csvContent: string): ParsedFileData {
    const result: ParsedFileData = {
      headers: [],
      data: [],
      totalRows: 0,
      errors: [],
      warnings: []
    };

    try {
      const lines = csvContent.trim().split('\n');
      if (lines.length === 0) {
        result.errors.push({
          errorType: 'FILE_FORMAT',
          errorMessage: 'CSV file is empty',
          code: ImportErrorCodes.EMPTY_FILE,
          rawData: {},
          isFixable: false
        });
        return result;
      }

      // Parse headers
      result.headers = this.parseCSVLine(lines[0]);
      
      // Parse data rows
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = this.parseCSVLine(line);
        const row = i + 1;

        if (values.length !== result.headers.length) {
          result.warnings.push({
            row,
            warningType: 'PARSE',
            warningMessage: `Row has ${values.length} columns, expected ${result.headers.length}`,
            code: ImportWarningCodes.PARTIAL_DATA
          });
        }

        const record: any = {};
        result.headers.forEach((header, index) => {
          record[header] = values[index] || '';
        });

        result.data.push(record);
      }

      result.totalRows = result.data.length;
      return result;
    } catch (error) {
      result.errors.push({
        errorType: 'PARSE_ERROR',
        errorMessage: error instanceof Error ? error.message : 'CSV parsing failed',
        code: ImportErrorCodes.PARSE_ERROR,
        rawData: {},
        isFixable: false
      });
      return result;
    }
  }

  private parseExcel(buffer: Buffer): ParsedFileData {
    const result: ParsedFileData = {
      headers: [],
      data: [],
      totalRows: 0,
      errors: [],
      warnings: []
    };

    try {
      // For now, we'll implement a basic Excel parser
      // In a real implementation, you'd use a library like xlsx
      result.errors.push({
        errorType: 'FEATURE_NOT_IMPLEMENTED',
        errorMessage: 'Excel parsing not yet implemented. Please use CSV format.',
        code: ImportErrorCodes.UNSUPPORTED_FORMAT,
        rawData: {},
        isFixable: true,
        suggestedFix: 'Convert your Excel file to CSV format'
      });
      return result;
    } catch (error) {
      result.errors.push({
        errorType: 'PARSE_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Excel parsing failed',
        code: ImportErrorCodes.PARSE_ERROR,
        rawData: {},
        isFixable: false
      });
      return result;
    }
  }

  private parseJSON(jsonContent: string): ParsedFileData {
    const result: ParsedFileData = {
      headers: [],
      data: [],
      totalRows: 0,
      errors: [],
      warnings: []
    };

    try {
      const jsonData = JSON.parse(jsonContent);
      
      if (!Array.isArray(jsonData)) {
        result.errors.push({
          errorType: 'FILE_FORMAT',
          errorMessage: 'JSON must contain an array of user objects',
          code: ImportErrorCodes.PARSE_ERROR,
          rawData: {},
          isFixable: true,
          suggestedFix: 'Ensure your JSON file contains an array of user objects'
        });
        return result;
      }

      if (jsonData.length === 0) {
        result.errors.push({
          errorType: 'FILE_FORMAT',
          errorMessage: 'JSON array is empty',
          code: ImportErrorCodes.EMPTY_FILE,
          rawData: {},
          isFixable: false
        });
        return result;
      }

      // Extract headers from first object
      result.headers = Object.keys(jsonData[0]);
      result.data = jsonData;
      result.totalRows = jsonData.length;

      return result;
    } catch (error) {
      result.errors.push({
        errorType: 'PARSE_ERROR',
        errorMessage: error instanceof Error ? error.message : 'JSON parsing failed',
        code: ImportErrorCodes.PARSE_ERROR,
        rawData: {},
        isFixable: false
      });
      return result;
    }
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  private async processBatch(
    importId: string,
    institutionId: string,
    batch: UserImportData[],
    options: BulkImportOptions,
    startIndex: number
  ): Promise<BatchProcessResult> {
    const result: BatchProcessResult = {
      batchNumber: Math.floor(startIndex / (options.batchSize || this.DEFAULT_BATCH_SIZE)),
      recordsProcessed: 0,
      recordsImported: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
      warnings: [],
      importedUserIds: []
    };

    for (let i = 0; i < batch.length; i++) {
      const record = batch[i];
      const row = startIndex + i + 1;
      result.recordsProcessed++;

      try {
        // Check if user exists
        const { data: existingUser } = await this.supabase
          .from('user_profiles')
          .select('id, email')
          .eq('email', record.email.toLowerCase())
          .eq('institution_id', institutionId)
          .single();

        if (existingUser) {
          if (options.skipDuplicates) {
            result.recordsSkipped++;
            continue;
          } else if (options.updateExisting) {
            // Update existing user
            const { data: updatedUser, error: updateError } = await this.supabase
              .from('user_profiles')
              .update({
                first_name: record.firstName,
                last_name: record.lastName,
                role: record.role || 'student',
                department: record.department,
                student_id: record.studentId,
                grade: record.grade ? parseInt(record.grade.toString()) : null,
                phone: record.phone,
                address: record.address,
                date_of_birth: record.dateOfBirth,
                emergency_contact: record.emergencyContact,
                emergency_phone: record.emergencyPhone,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingUser.id)
              .select()
              .single();

            if (updateError) {
              result.recordsFailed++;
              result.errors.push({
                row,
                errorType: 'DATABASE',
                errorMessage: `Failed to update user: ${updateError.message}`,
                code: ImportErrorCodes.DATABASE_ERROR,
                rawData: record,
                isFixable: false
              });
            } else {
              result.recordsImported++;
              result.importedUserIds.push(updatedUser.id);
            }
          } else {
            result.recordsSkipped++;
            result.warnings.push({
              row,
              warningType: 'DUPLICATE',
              warningMessage: 'User already exists, skipping',
              code: ImportWarningCodes.DUPLICATE_RECORD
            });
          }
        } else {
          // Create new user
          const { data: newUser, error: createError } = await this.supabase
            .from('user_profiles')
            .insert({
              email: record.email.toLowerCase(),
              first_name: record.firstName,
              last_name: record.lastName,
              role: record.role || 'student',
              department: record.department,
              student_id: record.studentId,
              grade: record.grade ? parseInt(record.grade.toString()) : null,
              phone: record.phone,
              address: record.address,
              date_of_birth: record.dateOfBirth,
              emergency_contact: record.emergencyContact,
              emergency_phone: record.emergencyPhone,
              institution_id: institutionId
            })
            .select()
            .single();

          if (createError) {
            result.recordsFailed++;
            result.errors.push({
              row,
              errorType: 'DATABASE',
              errorMessage: `Failed to create user: ${createError.message}`,
              code: ImportErrorCodes.DATABASE_ERROR,
              rawData: record,
              isFixable: false
            });
          } else {
            result.recordsImported++;
            result.importedUserIds.push(newUser.id);
          }
        }
      } catch (error) {
        result.recordsFailed++;
        result.errors.push({
          row,
          errorType: 'SYSTEM',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          code: ImportErrorCodes.SYSTEM_ERROR,
          rawData: record,
          isFixable: false
        });
      }
    }

    return result;
  }

  private async updateProgress(
    importId: string,
    stage: string,
    currentStep: number,
    totalSteps: number,
    statusMessage: string
  ): Promise<void> {
    const progressPercentage = Math.min((currentStep / totalSteps) * 100, 100);
    
    await this.supabase
      .from('import_progress')
      .upsert({
        import_id: importId,
        stage,
        current_step: currentStep,
        total_steps: totalSteps,
        progress_percentage: progressPercentage,
        status_message: statusMessage
      });
  }

  private async updateImportStatus(
    importId: string,
    status: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const updateData: any = {
      status,
      metadata: metadata,
      updated_at: new Date().toISOString()
    };

    if (status === 'completed' || status === 'failed') {
      updateData.completed_at = new Date().toISOString();
    }

    if (metadata.totalImported !== undefined) {
      updateData.successful_records = metadata.totalImported;
    }
    
    if (metadata.totalFailed !== undefined) {
      updateData.failed_records = metadata.totalFailed;
    }

    await this.supabase
      .from('bulk_imports')
      .update(updateData)
      .eq('id', importId);
  }

  private async storeImportErrors(importId: string, errors: ImportError[]): Promise<void> {
    const errorRecords = errors.map(error => ({
      import_id: importId,
      row_number: error.row || 0,
      error_type: error.errorType,
      error_message: error.errorMessage,
      field_name: error.fieldName,
      field_value: error.fieldValue?.toString(),
      raw_data: error.rawData,
      suggested_fix: error.suggestedFix,
      is_fixable: error.isFixable
    }));

    await this.supabase
      .from('import_errors')
      .insert(errorRecords);
  }

  private async storeImportWarnings(importId: string, warnings: ImportWarning[]): Promise<void> {
    const warningRecords = warnings.map(warning => ({
      import_id: importId,
      row_number: warning.row || 0,
      warning_type: warning.warningType,
      warning_message: warning.warningMessage,
      field_name: warning.fieldName,
      field_value: warning.fieldValue?.toString()
    }));

    await this.supabase
      .from('import_warnings')
      .insert(warningRecords);
  }

  private async createSnapshot(
    institutionId: string,
    importId: string,
    originalData: any[]
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from('migration_snapshots')
      .insert({
        institution_id: institutionId,
        import_id: importId,
        snapshot_type: 'user_import',
        original_data: originalData,
        imported_records: [],
        metadata: {
          createdAt: new Date().toISOString(),
          recordCount: originalData.length
        }
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create snapshot: ${error.message}`);
    }

    return data.id;
  }

  private async updateSnapshot(snapshotId: string, importedUserIds: string[]): Promise<void> {
    await this.supabase
      .from('migration_snapshots')
      .update({
        imported_records: importedUserIds,
        metadata: {
          updatedAt: new Date().toISOString(),
          importedCount: importedUserIds.length
        }
      })
      .eq('id', snapshotId);
  }

  private async sendNotification(
    importId: string,
    recipientId: string,
    type: NotificationType,
    subject: string,
    message: string
  ): Promise<void> {
    // Store notification record
    await this.supabase
      .from('import_notifications')
      .insert({
        import_id: importId,
        recipient_id: recipientId,
        notification_type: type,
        subject,
        message
      });

    // Send actual notification via notification service
    try {
      await this.notificationService.sendNotification({
        recipientId,
        type: 'email',
        subject,
        message,
        metadata: { importId, notificationType: type }
      });

      // Update delivery status
      await this.supabase
        .from('import_notifications')
        .update({
          sent_at: new Date().toISOString(),
          delivery_status: 'sent'
        })
        .eq('import_id', importId)
        .eq('recipient_id', recipientId)
        .eq('notification_type', type);

    } catch (error) {
      // Update delivery status as failed
      await this.supabase
        .from('import_notifications')
        .update({
          delivery_status: 'failed'
        })
        .eq('import_id', importId)
        .eq('recipient_id', recipientId)
        .eq('notification_type', type);
    }
  }

  private async sendWelcomeEmails(userIds: string[], institutionId: string): Promise<void> {
    // Get user details
    const { data: users } = await this.supabase
      .from('user_profiles')
      .select('id, email, first_name, last_name')
      .in('id', userIds);

    if (!users) return;

    // Send welcome emails in batches to avoid overwhelming the email service
    const emailBatches = this.chunkArray(users, 10);
    
    for (const batch of emailBatches) {
      const emailPromises = batch.map(user => 
        this.notificationService.sendWelcomeEmail({
          recipientId: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          institutionId
        })
      );

      await Promise.allSettled(emailPromises);
    }
  }

  private calculateValidationSummary(
    data: any[],
    errors: ImportError[],
    warnings: ImportWarning[]
  ): ImportSummary {
    const totalRecords = data.length;
    const recordsWithErrors = new Set(errors.filter(e => e.row).map(e => e.row));
    const validRecords = totalRecords - recordsWithErrors.size;

    // Count specific issues
    const duplicateEmails = errors.filter(e => e.code === ImportErrorCodes.DUPLICATE_EMAIL).length;
    const missingRequiredFields = errors.filter(e => e.code === ImportErrorCodes.REQUIRED_FIELD_MISSING).length;
    const invalidEmails = errors.filter(e => e.code === ImportErrorCodes.INVALID_EMAIL_FORMAT).length;
    const unknownRoles = warnings.filter(w => w.code === ImportWarningCodes.UNKNOWN_ROLE).length;
    const departmentMismatches = warnings.filter(w => w.code === ImportWarningCodes.DEPARTMENT_MISMATCH).length;

    return {
      totalRecords,
      validRecords,
      duplicateEmails,
      missingRequiredFields,
      invalidEmails,
      unknownRoles,
      departmentMismatches
    };
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime()) && dateString.match(/^\d{4}-\d{2}-\d{2}$/);
  }
}