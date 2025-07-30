import { createClient } from '@/lib/supabase/server';
import { 
  DataImportResult, 
  ImportError, 
  ImportWarning,
  IntegrationConfig,
  SISConfig,
  LMSConfig 
} from '@/lib/types/integration';

// CSV/Excel parsing support
interface CSVParseResult {
  data: any[];
  errors: ImportError[];
  warnings: ImportWarning[];
}

interface MigrationSnapshot {
  id: string;
  institutionId: string;
  type: 'user_import' | 'course_import' | 'full_migration';
  timestamp: Date;
  originalData: any[];
  importedRecords: string[];
  metadata: Record<string, any>;
}

interface RollbackResult {
  success: boolean;
  recordsRolledBack: number;
  errors: ImportError[];
  duration: number;
}

export interface ImportOptions {
  skipDuplicates?: boolean;
  updateExisting?: boolean;
  validateOnly?: boolean;
  batchSize?: number;
}

export interface ExportOptions {
  format: 'csv' | 'json' | 'xlsx';
  includeHeaders?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  filters?: Record<string, any>;
}

export class DataImportExportService {
  private supabase = createClient();

  /**
   * Parse CSV data with validation
   */
  async parseCSV(csvContent: string, hasHeaders = true): Promise<CSVParseResult> {
    const result: CSVParseResult = {
      data: [],
      errors: [],
      warnings: []
    };

    try {
      const lines = csvContent.trim().split('\n');
      if (lines.length === 0) {
        result.errors.push({
          message: 'CSV file is empty',
          code: 'EMPTY_FILE'
        });
        return result;
      }

      let headers: string[] = [];
      let dataStartIndex = 0;

      if (hasHeaders) {
        headers = this.parseCSVLine(lines[0]);
        dataStartIndex = 1;
      } else {
        // Generate generic headers
        const firstLine = this.parseCSVLine(lines[0]);
        headers = firstLine.map((_, index) => `column_${index + 1}`);
      }

      // Validate headers
      if (headers.length === 0) {
        result.errors.push({
          message: 'No columns found in CSV',
          code: 'NO_COLUMNS'
        });
        return result;
      }

      // Parse data rows
      for (let i = dataStartIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines

        const values = this.parseCSVLine(line);
        const row = i + 1;

        if (values.length !== headers.length) {
          result.warnings.push({
            row,
            message: `Row has ${values.length} columns, expected ${headers.length}`,
            code: 'COLUMN_MISMATCH'
          });
        }

        const record: any = {};
        headers.forEach((header, index) => {
          record[header] = values[index] || '';
        });

        result.data.push(record);
      }

      return result;
    } catch (error) {
      result.errors.push({
        message: error instanceof Error ? error.message : 'CSV parsing failed',
        code: 'PARSE_ERROR'
      });
      return result;
    }
  }

  /**
   * Import users from CSV/Excel with enhanced validation and rollback support
   */
  async importUsersFromFile(
    institutionId: string,
    fileContent: string,
    fileType: 'csv' | 'excel',
    options: ImportOptions & { createSnapshot?: boolean } = {}
  ): Promise<DataImportResult & { snapshotId?: string }> {
    let parseResult: CSVParseResult;

    // Parse file based on type
    if (fileType === 'csv') {
      parseResult = await this.parseCSV(fileContent, true);
    } else {
      // For Excel, we'd need a library like xlsx, but for now handle as CSV
      parseResult = await this.parseCSV(fileContent, true);
    }

    if (parseResult.errors.length > 0) {
      return {
        success: false,
        recordsProcessed: 0,
        recordsImported: 0,
        recordsSkipped: 0,
        recordsFailed: 0,
        errors: parseResult.errors,
        warnings: parseResult.warnings,
        duration: 0
      };
    }

    // Create snapshot if requested
    let snapshotId: string | undefined;
    if (options.createSnapshot) {
      snapshotId = await this.createMigrationSnapshot(
        institutionId,
        'user_import',
        parseResult.data
      );
    }

    // Import the parsed data
    const importResult = await this.importUsers(institutionId, parseResult.data, options);

    // Add parsing warnings to import result
    importResult.warnings.unshift(...parseResult.warnings);

    return {
      ...importResult,
      snapshotId
    };
  }

  /**
   * Create a migration snapshot for rollback purposes
   */
  async createMigrationSnapshot(
    institutionId: string,
    type: MigrationSnapshot['type'],
    originalData: any[],
    metadata: Record<string, any> = {}
  ): Promise<string> {
    const snapshot: Omit<MigrationSnapshot, 'id'> = {
      institutionId,
      type,
      timestamp: new Date(),
      originalData,
      importedRecords: [],
      metadata
    };

    const { data, error } = await this.supabase
      .from('migration_snapshots')
      .insert(snapshot)
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create migration snapshot: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Rollback a migration using snapshot
   */
  async rollbackMigration(snapshotId: string): Promise<RollbackResult> {
    const startTime = Date.now();
    const result: RollbackResult = {
      success: false,
      recordsRolledBack: 0,
      errors: [],
      duration: 0
    };

    try {
      // Get snapshot
      const { data: snapshot, error: snapshotError } = await this.supabase
        .from('migration_snapshots')
        .select('*')
        .eq('id', snapshotId)
        .single();

      if (snapshotError || !snapshot) {
        result.errors.push({
          message: 'Migration snapshot not found',
          code: 'SNAPSHOT_NOT_FOUND'
        });
        return result;
      }

      // Get imported records from snapshot
      const importedRecords = snapshot.imported_records || [];

      if (importedRecords.length === 0) {
        result.errors.push({
          message: 'No records to rollback',
          code: 'NO_RECORDS'
        });
        return result;
      }

      // Rollback based on migration type
      switch (snapshot.type) {
        case 'user_import':
          await this.rollbackUserImport(importedRecords, result);
          break;
        case 'course_import':
          await this.rollbackCourseImport(importedRecords, result);
          break;
        case 'full_migration':
          await this.rollbackFullMigration(importedRecords, result);
          break;
        default:
          result.errors.push({
            message: `Unknown migration type: ${snapshot.type}`,
            code: 'UNKNOWN_TYPE'
          });
          return result;
      }

      // Mark snapshot as rolled back
      await this.supabase
        .from('migration_snapshots')
        .update({ 
          metadata: { 
            ...snapshot.metadata, 
            rolledBack: true, 
            rollbackDate: new Date().toISOString() 
          }
        })
        .eq('id', snapshotId);

      result.success = result.errors.length === 0;
      result.duration = Date.now() - startTime;

      return result;
    } catch (error) {
      result.errors.push({
        message: error instanceof Error ? error.message : 'Rollback failed',
        code: 'ROLLBACK_ERROR'
      });
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Enhanced data validation with integrity checks
   */
  async validateDataIntegrity(
    institutionId: string,
    data: any[],
    type: 'users' | 'courses'
  ): Promise<{ errors: ImportError[]; warnings: ImportWarning[]; suggestions: string[] }> {
    const errors: ImportError[] = [];
    const warnings: ImportWarning[] = [];
    const suggestions: string[] = [];

    if (type === 'users') {
      return this.validateUserDataIntegrity(institutionId, data);
    } else if (type === 'courses') {
      return this.validateCourseDataIntegrity(institutionId, data);
    }

    return { errors, warnings, suggestions };
  }

  /**
   * Migrate data from existing system
   */
  async migrateFromExistingSystem(
    institutionId: string,
    systemType: 'sis' | 'lms' | 'custom',
    migrationConfig: Record<string, any>
  ): Promise<DataImportResult & { snapshotId: string }> {
    const startTime = Date.now();
    const result: DataImportResult = {
      success: false,
      recordsProcessed: 0,
      recordsImported: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
      warnings: [],
      duration: 0
    };

    try {
      // Create migration snapshot
      const snapshotId = await this.createMigrationSnapshot(
        institutionId,
        'full_migration',
        [],
        { systemType, config: migrationConfig }
      );

      // Fetch data from existing system
      let userData: any[] = [];
      let courseData: any[] = [];

      switch (systemType) {
        case 'sis':
          userData = await this.fetchExistingSystemUsers(migrationConfig);
          courseData = await this.fetchExistingSystemCourses(migrationConfig);
          break;
        case 'lms':
          courseData = await this.fetchExistingSystemCourses(migrationConfig);
          break;
        case 'custom':
          // Handle custom migration logic
          const customData = await this.fetchCustomSystemData(migrationConfig);
          userData = customData.users || [];
          courseData = customData.courses || [];
          break;
      }

      // Import users if available
      if (userData.length > 0) {
        const userResult = await this.importUsers(institutionId, userData, {
          skipDuplicates: false,
          updateExisting: true
        });
        this.mergeResults(result, userResult);
      }

      // Import courses if available
      if (courseData.length > 0) {
        const courseResult = await this.importCourses(institutionId, courseData, {
          skipDuplicates: false,
          updateExisting: true
        });
        this.mergeResults(result, courseResult);
      }

      result.success = result.recordsFailed === 0;
      result.duration = Date.now() - startTime;

      return { ...result, snapshotId };
    } catch (error) {
      result.errors.push({
        message: error instanceof Error ? error.message : 'Migration failed',
        code: 'MIGRATION_FAILED'
      });
      result.duration = Date.now() - startTime;
      return { ...result, snapshotId: '' };
    }
  }

  async importUsers(
    institutionId: string,
    data: any[],
    options: ImportOptions = {}
  ): Promise<DataImportResult> {
    const startTime = Date.now();
    const result: DataImportResult = {
      success: false,
      recordsProcessed: 0,
      recordsImported: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
      warnings: [],
      duration: 0,
    };

    try {
      // Validate data structure
      const validationResult = this.validateUserData(data);
      result.errors.push(...validationResult.errors);
      result.warnings.push(...validationResult.warnings);

      if (options.validateOnly) {
        result.success = result.errors.length === 0;
        result.duration = Date.now() - startTime;
        return result;
      }

      // Process in batches
      const batchSize = options.batchSize || 100;
      const batches = this.chunkArray(data, batchSize);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchResult = await this.processBatch(
          batch,
          institutionId,
          options,
          batchIndex * batchSize
        );

        result.recordsProcessed += batchResult.recordsProcessed;
        result.recordsImported += batchResult.recordsImported;
        result.recordsSkipped += batchResult.recordsSkipped;
        result.recordsFailed += batchResult.recordsFailed;
        result.errors.push(...batchResult.errors);
        result.warnings.push(...batchResult.warnings);
      }

      result.success = result.recordsFailed === 0;
      result.duration = Date.now() - startTime;

      // Log import result
      await this.logImportResult(institutionId, 'users', result);

      return result;
    } catch (error) {
      result.errors.push({
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'IMPORT_FAILED',
      });
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  async importCourses(
    institutionId: string,
    data: any[],
    options: ImportOptions = {}
  ): Promise<DataImportResult> {
    const startTime = Date.now();
    const result: DataImportResult = {
      success: false,
      recordsProcessed: 0,
      recordsImported: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
      warnings: [],
      duration: 0,
    };

    try {
      // Validate data structure
      const validationResult = this.validateCourseData(data);
      result.errors.push(...validationResult.errors);
      result.warnings.push(...validationResult.warnings);

      if (options.validateOnly) {
        result.success = result.errors.length === 0;
        result.duration = Date.now() - startTime;
        return result;
      }

      // Process in batches
      const batchSize = options.batchSize || 50;
      const batches = this.chunkArray(data, batchSize);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchResult = await this.processCourseBatch(
          batch,
          institutionId,
          options,
          batchIndex * batchSize
        );

        result.recordsProcessed += batchResult.recordsProcessed;
        result.recordsImported += batchResult.recordsImported;
        result.recordsSkipped += batchResult.recordsSkipped;
        result.recordsFailed += batchResult.recordsFailed;
        result.errors.push(...batchResult.errors);
        result.warnings.push(...batchResult.warnings);
      }

      result.success = result.recordsFailed === 0;
      result.duration = Date.now() - startTime;

      // Log import result
      await this.logImportResult(institutionId, 'courses', result);

      return result;
    } catch (error) {
      result.errors.push({
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'IMPORT_FAILED',
      });
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  async exportUsers(
    institutionId: string,
    options: ExportOptions
  ): Promise<{ data: any; filename: string }> {
    let query = this.supabase
      .from('profiles')
      .select('*')
      .eq('institution_id', institutionId);

    // Apply filters
    if (options.filters) {
      Object.entries(options.filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });
    }

    // Apply date range
    if (options.dateRange) {
      query = query
        .gte('created_at', options.dateRange.start.toISOString())
        .lte('created_at', options.dateRange.end.toISOString());
    }

    const { data: users, error } = await query;

    if (error) {
      throw new Error(`Failed to export users: ${error.message}`);
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `users_export_${timestamp}`;

    switch (options.format) {
      case 'json':
        return {
          data: JSON.stringify(users, null, 2),
          filename: `${filename}.json`,
        };
      case 'csv':
        return {
          data: this.convertToCSV(users, options.includeHeaders),
          filename: `${filename}.csv`,
        };
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  async exportCourses(
    institutionId: string,
    options: ExportOptions
  ): Promise<{ data: any; filename: string }> {
    let query = this.supabase
      .from('classes')
      .select('*')
      .eq('institution_id', institutionId);

    // Apply filters
    if (options.filters) {
      Object.entries(options.filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });
    }

    // Apply date range
    if (options.dateRange) {
      query = query
        .gte('created_at', options.dateRange.start.toISOString())
        .lte('created_at', options.dateRange.end.toISOString());
    }

    const { data: courses, error } = await query;

    if (error) {
      throw new Error(`Failed to export courses: ${error.message}`);
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `courses_export_${timestamp}`;

    switch (options.format) {
      case 'json':
        return {
          data: JSON.stringify(courses, null, 2),
          filename: `${filename}.json`,
        };
      case 'csv':
        return {
          data: this.convertToCSV(courses, options.includeHeaders),
          filename: `${filename}.csv`,
        };
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  async syncFromSIS(integrationId: string): Promise<DataImportResult> {
    const integration = await this.getIntegration(integrationId);
    if (!integration || integration.type !== 'sis') {
      throw new Error('Invalid SIS integration');
    }

    const config = integration.config as SISConfig;
    const result: DataImportResult = {
      success: false,
      recordsProcessed: 0,
      recordsImported: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
      warnings: [],
      duration: 0,
    };

    const startTime = Date.now();

    try {
      // Sync users if enabled
      if (config.syncSettings.syncUsers) {
        const usersData = await this.fetchSISUsers(config);
        const userResult = await this.importUsers(integration.institutionId, usersData);
        this.mergeResults(result, userResult);
      }

      // Sync courses if enabled
      if (config.syncSettings.syncCourses) {
        const coursesData = await this.fetchSISCourses(config);
        const courseResult = await this.importCourses(integration.institutionId, coursesData);
        this.mergeResults(result, courseResult);
      }

      result.success = result.recordsFailed === 0;
      result.duration = Date.now() - startTime;

      // Update integration sync status
      await this.updateIntegrationSyncStatus(integrationId, result);

      return result;
    } catch (error) {
      result.errors.push({
        message: error instanceof Error ? error.message : 'SIS sync failed',
        code: 'SIS_SYNC_FAILED',
      });
      result.duration = Date.now() - startTime;
      
      await this.updateIntegrationSyncStatus(integrationId, result);
      return result;
    }
  }

  private validateUserData(data: any[]): { errors: ImportError[]; warnings: ImportWarning[] } {
    const errors: ImportError[] = [];
    const warnings: ImportWarning[] = [];

    data.forEach((record, index) => {
      const row = index + 1;

      // Required fields
      if (!record.email) {
        errors.push({
          row,
          field: 'email',
          value: record.email,
          message: 'Email is required',
          code: 'REQUIRED_FIELD',
        });
      } else if (!this.isValidEmail(record.email)) {
        errors.push({
          row,
          field: 'email',
          value: record.email,
          message: 'Invalid email format',
          code: 'INVALID_FORMAT',
        });
      }

      if (!record.firstName) {
        errors.push({
          row,
          field: 'firstName',
          value: record.firstName,
          message: 'First name is required',
          code: 'REQUIRED_FIELD',
        });
      }

      if (!record.lastName) {
        errors.push({
          row,
          field: 'lastName',
          value: record.lastName,
          message: 'Last name is required',
          code: 'REQUIRED_FIELD',
        });
      }

      // Optional field validation
      if (record.role && !['student', 'teacher', 'admin'].includes(record.role)) {
        warnings.push({
          row,
          field: 'role',
          value: record.role,
          message: 'Unknown role, will default to student',
          code: 'UNKNOWN_VALUE',
        });
      }
    });

    return { errors, warnings };
  }

  private validateCourseData(data: any[]): { errors: ImportError[]; warnings: ImportWarning[] } {
    const errors: ImportError[] = [];
    const warnings: ImportWarning[] = [];

    data.forEach((record, index) => {
      const row = index + 1;

      // Required fields
      if (!record.name) {
        errors.push({
          row,
          field: 'name',
          value: record.name,
          message: 'Course name is required',
          code: 'REQUIRED_FIELD',
        });
      }

      if (!record.code) {
        errors.push({
          row,
          field: 'code',
          value: record.code,
          message: 'Course code is required',
          code: 'REQUIRED_FIELD',
        });
      }

      // Optional field validation
      if (record.startDate && !this.isValidDate(record.startDate)) {
        warnings.push({
          row,
          field: 'startDate',
          value: record.startDate,
          message: 'Invalid date format, will be ignored',
          code: 'INVALID_FORMAT',
        });
      }
    });

    return { errors, warnings };
  }

  private async processBatch(
    batch: any[],
    institutionId: string,
    options: ImportOptions,
    startIndex: number,
    snapshotId?: string
  ): Promise<DataImportResult> {
    const result: DataImportResult = {
      success: true,
      recordsProcessed: 0,
      recordsImported: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
      warnings: [],
      duration: 0,
    };

    for (let i = 0; i < batch.length; i++) {
      const record = batch[i];
      const row = startIndex + i + 1;
      result.recordsProcessed++;

      try {
        // Check if user exists
        const { data: existingUser } = await this.supabase
          .from('profiles')
          .select('id')
          .eq('email', record.email)
          .single();

        if (existingUser) {
          if (options.skipDuplicates) {
            result.recordsSkipped++;
            continue;
          } else if (options.updateExisting) {
            // Update existing user
            const { error } = await this.supabase
              .from('profiles')
              .update({
                first_name: record.firstName,
                last_name: record.lastName,
                role: record.role || 'student',
                department: record.department,
                institution_id: institutionId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingUser.id);

            if (error) {
              result.recordsFailed++;
              result.errors.push({
                row,
                message: `Failed to update user: ${error.message}`,
                code: 'UPDATE_FAILED',
              });
            } else {
              result.recordsImported++;
            }
          } else {
            result.recordsSkipped++;
            result.warnings.push({
              row,
              message: 'User already exists, skipping',
              code: 'DUPLICATE_RECORD',
            });
          }
        } else {
          // Create new user
          const { error } = await this.supabase
            .from('profiles')
            .insert({
              email: record.email,
              first_name: record.firstName,
              last_name: record.lastName,
              role: record.role || 'student',
              department: record.department,
              institution_id: institutionId,
            });

          if (error) {
            result.recordsFailed++;
            result.errors.push({
              row,
              message: `Failed to create user: ${error.message}`,
              code: 'CREATE_FAILED',
            });
          } else {
            result.recordsImported++;
          }
        }
      } catch (error) {
        result.recordsFailed++;
        result.errors.push({
          row,
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'PROCESSING_ERROR',
        });
      }
    }

    return result;
  }

  private async processCourseBatch(
    batch: any[],
    institutionId: string,
    options: ImportOptions,
    startIndex: number
  ): Promise<DataImportResult> {
    const result: DataImportResult = {
      success: true,
      recordsProcessed: 0,
      recordsImported: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
      warnings: [],
      duration: 0,
    };

    for (let i = 0; i < batch.length; i++) {
      const record = batch[i];
      const row = startIndex + i + 1;
      result.recordsProcessed++;

      try {
        // Check if course exists
        const { data: existingCourse } = await this.supabase
          .from('classes')
          .select('id')
          .eq('code', record.code)
          .eq('institution_id', institutionId)
          .single();

        if (existingCourse) {
          if (options.skipDuplicates) {
            result.recordsSkipped++;
            continue;
          } else if (options.updateExisting) {
            // Update existing course
            const { error } = await this.supabase
              .from('classes')
              .update({
                name: record.name,
                description: record.description,
                start_date: record.startDate,
                end_date: record.endDate,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingCourse.id);

            if (error) {
              result.recordsFailed++;
              result.errors.push({
                row,
                message: `Failed to update course: ${error.message}`,
                code: 'UPDATE_FAILED',
              });
            } else {
              result.recordsImported++;
            }
          } else {
            result.recordsSkipped++;
            result.warnings.push({
              row,
              message: 'Course already exists, skipping',
              code: 'DUPLICATE_RECORD',
            });
          }
        } else {
          // Create new course
          const { error } = await this.supabase
            .from('classes')
            .insert({
              name: record.name,
              code: record.code,
              description: record.description,
              start_date: record.startDate,
              end_date: record.endDate,
              institution_id: institutionId,
            });

          if (error) {
            result.recordsFailed++;
            result.errors.push({
              row,
              message: `Failed to create course: ${error.message}`,
              code: 'CREATE_FAILED',
            });
          } else {
            result.recordsImported++;
          }
        }
      } catch (error) {
        result.recordsFailed++;
        result.errors.push({
          row,
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'PROCESSING_ERROR',
        });
      }
    }

    return result;
  }

  private async fetchSISUsers(config: SISConfig): Promise<any[]> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(`${config.apiUrl}/users`, {
      headers,
    });

    if (!response.ok) {
      throw new Error(`SIS API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Map SIS data to our format
    return data.map((user: any) => ({
      email: user[config.fieldMapping.email],
      firstName: user[config.fieldMapping.firstName],
      lastName: user[config.fieldMapping.lastName],
      studentId: user[config.fieldMapping.studentId],
      grade: config.fieldMapping.grade ? user[config.fieldMapping.grade] : undefined,
    }));
  }

  private async fetchSISCourses(config: SISConfig): Promise<any[]> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(`${config.apiUrl}/courses`, {
      headers,
    });

    if (!response.ok) {
      throw new Error(`SIS API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Map SIS data to our format
    return data.map((course: any) => ({
      code: course[config.fieldMapping.courseId],
      name: course[config.fieldMapping.courseName],
      description: course.description,
    }));
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private convertToCSV(data: any[], includeHeaders = true): string {
    if (!data.length) return '';

    const headers = Object.keys(data[0]);
    const csvRows: string[] = [];

    if (includeHeaders) {
      csvRows.push(headers.join(','));
    }

    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header];
        return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
      });
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add final field
    result.push(current.trim());
    return result;
  }

  private async validateUserDataIntegrity(
    institutionId: string,
    data: any[]
  ): Promise<{ errors: ImportError[]; warnings: ImportWarning[]; suggestions: string[] }> {
    const errors: ImportError[] = [];
    const warnings: ImportWarning[] = [];
    const suggestions: string[] = [];

    // Check for duplicate emails in the data
    const emailCounts = new Map<string, number[]>();
    data.forEach((record, index) => {
      if (record.email) {
        const email = record.email.toLowerCase();
        if (!emailCounts.has(email)) {
          emailCounts.set(email, []);
        }
        emailCounts.get(email)!.push(index + 1);
      }
    });

    // Report duplicates
    emailCounts.forEach((rows, email) => {
      if (rows.length > 1) {
        errors.push({
          message: `Duplicate email "${email}" found in rows: ${rows.join(', ')}`,
          code: 'DUPLICATE_EMAIL'
        });
      }
    });

    // Check against existing users in the institution
    const emails = Array.from(emailCounts.keys());
    if (emails.length > 0) {
      const { data: existingUsers } = await this.supabase
        .from('profiles')
        .select('email')
        .eq('institution_id', institutionId)
        .in('email', emails);

      if (existingUsers && existingUsers.length > 0) {
        const existingEmails = new Set(existingUsers.map(u => u.email.toLowerCase()));
        
        data.forEach((record, index) => {
          if (record.email && existingEmails.has(record.email.toLowerCase())) {
            warnings.push({
              row: index + 1,
              field: 'email',
              value: record.email,
              message: 'User with this email already exists in the institution',
              code: 'EXISTING_USER'
            });
          }
        });

        suggestions.push('Consider using the "updateExisting" option to update existing users instead of creating duplicates');
      }
    }

    // Validate department references
    const departments = [...new Set(data.map(r => r.department).filter(Boolean))];
    if (departments.length > 0) {
      const { data: existingDepts } = await this.supabase
        .from('departments')
        .select('name')
        .eq('institution_id', institutionId)
        .in('name', departments);

      const existingDeptNames = new Set(existingDepts?.map(d => d.name) || []);
      
      data.forEach((record, index) => {
        if (record.department && !existingDeptNames.has(record.department)) {
          warnings.push({
            row: index + 1,
            field: 'department',
            value: record.department,
            message: 'Department does not exist in the institution',
            code: 'UNKNOWN_DEPARTMENT'
          });
        }
      });

      if (existingDeptNames.size < departments.length) {
        suggestions.push('Create missing departments before importing users, or remove department assignments');
      }
    }

    return { errors, warnings, suggestions };
  }

  private async validateCourseDataIntegrity(
    institutionId: string,
    data: any[]
  ): Promise<{ errors: ImportError[]; warnings: ImportWarning[]; suggestions: string[] }> {
    const errors: ImportError[] = [];
    const warnings: ImportWarning[] = [];
    const suggestions: string[] = [];

    // Check for duplicate course codes in the data
    const codeCounts = new Map<string, number[]>();
    data.forEach((record, index) => {
      if (record.code) {
        const code = record.code.toUpperCase();
        if (!codeCounts.has(code)) {
          codeCounts.set(code, []);
        }
        codeCounts.get(code)!.push(index + 1);
      }
    });

    // Report duplicates
    codeCounts.forEach((rows, code) => {
      if (rows.length > 1) {
        errors.push({
          message: `Duplicate course code "${code}" found in rows: ${rows.join(', ')}`,
          code: 'DUPLICATE_CODE'
        });
      }
    });

    // Check against existing courses in the institution
    const codes = Array.from(codeCounts.keys());
    if (codes.length > 0) {
      const { data: existingCourses } = await this.supabase
        .from('classes')
        .select('code')
        .eq('institution_id', institutionId)
        .in('code', codes);

      if (existingCourses && existingCourses.length > 0) {
        const existingCodes = new Set(existingCourses.map(c => c.code.toUpperCase()));
        
        data.forEach((record, index) => {
          if (record.code && existingCodes.has(record.code.toUpperCase())) {
            warnings.push({
              row: index + 1,
              field: 'code',
              value: record.code,
              message: 'Course with this code already exists in the institution',
              code: 'EXISTING_COURSE'
            });
          }
        });

        suggestions.push('Consider using the "updateExisting" option to update existing courses instead of creating duplicates');
      }
    }

    return { errors, warnings, suggestions };
  }

  private async rollbackUserImport(importedRecords: string[], result: RollbackResult): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('profiles')
        .delete()
        .in('id', importedRecords);

      if (error) {
        result.errors.push({
          message: `Failed to rollback user records: ${error.message}`,
          code: 'ROLLBACK_FAILED'
        });
      } else {
        result.recordsRolledBack = importedRecords.length;
      }
    } catch (error) {
      result.errors.push({
        message: error instanceof Error ? error.message : 'User rollback failed',
        code: 'ROLLBACK_ERROR'
      });
    }
  }

  private async rollbackCourseImport(importedRecords: string[], result: RollbackResult): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('classes')
        .delete()
        .in('id', importedRecords);

      if (error) {
        result.errors.push({
          message: `Failed to rollback course records: ${error.message}`,
          code: 'ROLLBACK_FAILED'
        });
      } else {
        result.recordsRolledBack = importedRecords.length;
      }
    } catch (error) {
      result.errors.push({
        message: error instanceof Error ? error.message : 'Course rollback failed',
        code: 'ROLLBACK_ERROR'
      });
    }
  }

  private async rollbackFullMigration(importedRecords: string[], result: RollbackResult): Promise<void> {
    // For full migration, we need to rollback both users and courses
    // This is a simplified implementation - in practice, you'd want more sophisticated tracking
    try {
      // Rollback users
      const { error: userError } = await this.supabase
        .from('profiles')
        .delete()
        .in('id', importedRecords.filter(id => id.startsWith('user_')));

      // Rollback courses
      const { error: courseError } = await this.supabase
        .from('classes')
        .delete()
        .in('id', importedRecords.filter(id => id.startsWith('course_')));

      if (userError || courseError) {
        result.errors.push({
          message: `Failed to rollback migration: ${userError?.message || courseError?.message}`,
          code: 'ROLLBACK_FAILED'
        });
      } else {
        result.recordsRolledBack = importedRecords.length;
      }
    } catch (error) {
      result.errors.push({
        message: error instanceof Error ? error.message : 'Full migration rollback failed',
        code: 'ROLLBACK_ERROR'
      });
    }
  }

  private async fetchExistingSystemUsers(config: Record<string, any>): Promise<any[]> {
    // This would implement fetching users from various external systems
    // For now, return empty array as placeholder
    return [];
  }

  private async fetchExistingSystemCourses(config: Record<string, any>): Promise<any[]> {
    // This would implement fetching courses from various external systems
    // For now, return empty array as placeholder
    return [];
  }

  private async fetchCustomSystemData(config: Record<string, any>): Promise<{ users: any[]; courses: any[] }> {
    // This would implement custom data fetching logic
    // For now, return empty arrays as placeholder
    return { users: [], courses: [] };
  }

  private mergeResults(target: DataImportResult, source: DataImportResult): void {
    target.recordsProcessed += source.recordsProcessed;
    target.recordsImported += source.recordsImported;
    target.recordsSkipped += source.recordsSkipped;
    target.recordsFailed += source.recordsFailed;
    target.errors.push(...source.errors);
    target.warnings.push(...source.warnings);
  }

  private async getIntegration(id: string): Promise<IntegrationConfig | null> {
    const { data, error } = await this.supabase
      .from('institution_integrations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      institutionId: data.institution_id,
      type: data.type,
      provider: data.provider,
      name: data.name,
      description: data.description,
      config: data.config,
      enabled: data.enabled,
      status: data.status,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      createdBy: data.created_by,
    };
  }

  private async logImportResult(
    institutionId: string,
    type: string,
    result: DataImportResult
  ): Promise<void> {
    await this.supabase
      .from('import_logs')
      .insert({
        institution_id: institutionId,
        type,
        result,
        created_at: new Date().toISOString(),
      });
  }

  private async updateIntegrationSyncStatus(
    integrationId: string,
    result: DataImportResult
  ): Promise<void> {
    await this.supabase
      .from('institution_integrations')
      .update({
        last_sync: new Date().toISOString(),
        last_sync_status: result.success ? 'success' : 'error',
        sync_errors: result.errors.map(e => e.message),
        updated_at: new Date().toISOString(),
      })
      .eq('id', integrationId);
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }

}