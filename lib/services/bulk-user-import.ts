import { DataImportExportService } from './data-import-export';
import { DataImportResult, ImportError, ImportWarning } from '@/lib/types/integration';

export interface BulkImportOptions {
  skipDuplicates?: boolean;
  updateExisting?: boolean;
  validateOnly?: boolean;
  batchSize?: number;
  createSnapshot?: boolean;
  sendWelcomeEmails?: boolean;
  assignDefaultRole?: string;
  assignToDepartment?: string;
}

export interface BulkImportTemplate {
  requiredFields: string[];
  optionalFields: string[];
  fieldDescriptions: Record<string, string>;
  sampleData: Record<string, any>[];
}

export interface ValidationReport {
  isValid: boolean;
  errors: ImportError[];
  warnings: ImportWarning[];
  suggestions: string[];
  summary: {
    totalRecords: number;
    validRecords: number;
    duplicateEmails: number;
    missingRequiredFields: number;
  };
}

export class BulkUserImportService {
  private importService = new DataImportExportService();

  /**
   * Get template for bulk user import
   */
  getImportTemplate(): BulkImportTemplate {
    return {
      requiredFields: ['email', 'firstName', 'lastName'],
      optionalFields: ['role', 'department', 'studentId', 'grade', 'phone', 'address'],
      fieldDescriptions: {
        email: 'User email address (must be unique)',
        firstName: 'User first name',
        lastName: 'User last name',
        role: 'User role (student, teacher, admin)',
        department: 'Department name (must exist in institution)',
        studentId: 'Student ID number (optional)',
        grade: 'Grade level (for students)',
        phone: 'Phone number',
        address: 'Mailing address'
      },
      sampleData: [
        {
          email: 'john.doe@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'student',
          department: 'Computer Science',
          studentId: 'CS2024001',
          grade: '10'
        },
        {
          email: 'jane.smith@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          role: 'teacher',
          department: 'Mathematics',
          phone: '555-0123'
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
   * Validate CSV data before import
   */
  async validateImportData(
    institutionId: string,
    csvContent: string
  ): Promise<ValidationReport> {
    const parseResult = await this.importService.parseCSV(csvContent, true);
    
    if (parseResult.errors.length > 0) {
      return {
        isValid: false,
        errors: parseResult.errors,
        warnings: parseResult.warnings,
        suggestions: ['Fix CSV parsing errors before proceeding'],
        summary: {
          totalRecords: 0,
          validRecords: 0,
          duplicateEmails: 0,
          missingRequiredFields: 0
        }
      };
    }

    // Validate data integrity
    const integrityResult = await this.importService.validateDataIntegrity(
      institutionId,
      parseResult.data,
      'users'
    );

    // Basic validation
    const basicValidation = this.validateBasicUserData(parseResult.data);

    // Combine all validation results
    const allErrors = [...integrityResult.errors, ...basicValidation.errors];
    const allWarnings = [...parseResult.warnings, ...integrityResult.warnings, ...basicValidation.warnings];
    const allSuggestions = [...integrityResult.suggestions, ...basicValidation.suggestions];

    // Calculate summary
    const summary = this.calculateValidationSummary(parseResult.data, allErrors);

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      suggestions: allSuggestions,
      summary
    };
  }

  /**
   * Import users from CSV with comprehensive error handling
   */
  async importUsersFromCSV(
    institutionId: string,
    csvContent: string,
    options: BulkImportOptions = {}
  ): Promise<DataImportResult & { snapshotId?: string; validationReport?: ValidationReport }> {
    // First validate the data
    const validationReport = await this.validateImportData(institutionId, csvContent);
    
    if (!validationReport.isValid && !options.validateOnly) {
      return {
        success: false,
        recordsProcessed: 0,
        recordsImported: 0,
        recordsSkipped: 0,
        recordsFailed: 0,
        errors: validationReport.errors,
        warnings: validationReport.warnings,
        duration: 0,
        validationReport
      };
    }

    if (options.validateOnly) {
      return {
        success: validationReport.isValid,
        recordsProcessed: validationReport.summary.totalRecords,
        recordsImported: 0,
        recordsSkipped: 0,
        recordsFailed: 0,
        errors: validationReport.errors,
        warnings: validationReport.warnings,
        duration: 0,
        validationReport
      };
    }

    // Proceed with import
    const importResult = await this.importService.importUsersFromFile(
      institutionId,
      csvContent,
      'csv',
      {
        ...options,
        createSnapshot: options.createSnapshot ?? true
      }
    );

    return {
      ...importResult,
      validationReport
    };
  }

  /**
   * Get import history for an institution
   */
  async getImportHistory(institutionId: string, limit = 50): Promise<any[]> {
    // This would query the import_logs table
    // Implementation depends on your database setup
    return [];
  }

  /**
   * Get available snapshots for rollback
   */
  async getAvailableSnapshots(institutionId: string): Promise<any[]> {
    // This would query the migration_snapshots table
    // Implementation depends on your database setup
    return [];
  }

  private validateBasicUserData(data: any[]): { errors: ImportError[]; warnings: ImportWarning[]; suggestions: string[] } {
    const errors: ImportError[] = [];
    const warnings: ImportWarning[] = [];
    const suggestions: string[] = [];

    const template = this.getImportTemplate();
    const requiredFields = template.requiredFields;

    data.forEach((record, index) => {
      const row = index + 1;

      // Check required fields
      requiredFields.forEach(field => {
        if (!record[field] || record[field].toString().trim() === '') {
          errors.push({
            row,
            field,
            value: record[field],
            message: `Required field '${field}' is missing or empty`,
            code: 'REQUIRED_FIELD_MISSING'
          });
        }
      });

      // Validate email format
      if (record.email && !this.isValidEmail(record.email)) {
        errors.push({
          row,
          field: 'email',
          value: record.email,
          message: 'Invalid email format',
          code: 'INVALID_EMAIL_FORMAT'
        });
      }

      // Validate role
      if (record.role && !['student', 'teacher', 'admin', 'department_admin'].includes(record.role.toLowerCase())) {
        warnings.push({
          row,
          field: 'role',
          value: record.role,
          message: 'Unknown role, will default to student',
          code: 'UNKNOWN_ROLE'
        });
      }

      // Validate grade (if provided)
      if (record.grade && (isNaN(record.grade) || record.grade < 1 || record.grade > 12)) {
        warnings.push({
          row,
          field: 'grade',
          value: record.grade,
          message: 'Grade should be a number between 1 and 12',
          code: 'INVALID_GRADE'
        });
      }
    });

    // Add suggestions based on common issues
    if (errors.some(e => e.code === 'REQUIRED_FIELD_MISSING')) {
      suggestions.push('Ensure all required fields (email, firstName, lastName) are filled for each user');
    }

    if (warnings.some(w => w.code === 'UNKNOWN_ROLE')) {
      suggestions.push('Valid roles are: student, teacher, admin, department_admin');
    }

    return { errors, warnings, suggestions };
  }

  private calculateValidationSummary(data: any[], errors: ImportError[]): ValidationReport['summary'] {
    const totalRecords = data.length;
    const recordsWithErrors = new Set(errors.filter(e => e.row).map(e => e.row));
    const validRecords = totalRecords - recordsWithErrors.size;

    // Count duplicate emails
    const emails = data.map(r => r.email?.toLowerCase()).filter(Boolean);
    const duplicateEmails = emails.length - new Set(emails).size;

    // Count missing required fields
    const missingRequiredFields = errors.filter(e => e.code === 'REQUIRED_FIELD_MISSING').length;

    return {
      totalRecords,
      validRecords,
      duplicateEmails,
      missingRequiredFields
    };
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}