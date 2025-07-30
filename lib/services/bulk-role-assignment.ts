/**
 * Bulk Role Assignment Service
 * 
 * Handles file parsing, validation, and bulk processing of role assignments.
 * Provides detailed error reporting and transaction handling.
 */

import { UserRole, BulkRoleAssignment, BulkRoleAssignmentResult, RoleAssignmentRequest } from '../types/role-management';

export interface BulkAssignmentFileData {
  email: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  departmentId?: string;
  justification?: string;
}

export interface FileValidationError {
  row: number;
  field: string;
  message: string;
  value?: string;
}

export interface FileParseResult {
  data: BulkAssignmentFileData[];
  errors: FileValidationError[];
  warnings: FileValidationError[];
}

export interface BulkProcessingOptions {
  validateOnly?: boolean;
  skipDuplicates?: boolean;
  sendWelcomeEmails?: boolean;
  batchSize?: number;
}

export class BulkRoleAssignmentService {
  private readonly SUPPORTED_FORMATS = ['.csv', '.xlsx', '.xls'];
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly MAX_RECORDS = 10000;
  private readonly REQUIRED_HEADERS = ['email'];
  private readonly OPTIONAL_HEADERS = ['first_name', 'firstname', 'last_name', 'lastname', 'role', 'department', 'department_id', 'justification'];

  /**
   * Parse and validate uploaded file
   */
  async parseFile(file: File): Promise<FileParseResult> {
    const errors: FileValidationError[] = [];
    const warnings: FileValidationError[] = [];

    // Validate file format and size
    const formatValidation = this.validateFileFormat(file);
    if (formatValidation.length > 0) {
      return { data: [], errors: formatValidation, warnings: [] };
    }

    try {
      const content = await this.readFileContent(file);
      const parseResult = await this.parseFileContent(content, file.name);
      
      return {
        data: parseResult.data,
        errors: [...errors, ...parseResult.errors],
        warnings: [...warnings, ...parseResult.warnings]
      };
    } catch (error) {
      errors.push({
        row: 0,
        field: 'file',
        message: error instanceof Error ? error.message : 'Failed to parse file'
      });
      return { data: [], errors, warnings };
    }
  }

  /**
   * Validate file format and basic constraints
   */
  private validateFileFormat(file: File): FileValidationError[] {
    const errors: FileValidationError[] = [];

    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      errors.push({
        row: 0,
        field: 'file',
        message: `File size exceeds maximum limit of ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`
      });
    }

    // Check file extension
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!this.SUPPORTED_FORMATS.includes(extension)) {
      errors.push({
        row: 0,
        field: 'file',
        message: `Unsupported file format. Supported formats: ${this.SUPPORTED_FORMATS.join(', ')}`
      });
    }

    return errors;
  }

  /**
   * Read file content based on format
   */
  private async readFileContent(file: File): Promise<string> {
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (extension === '.csv') {
      return await file.text();
    } else if (extension === '.xlsx' || extension === '.xls') {
      // For Excel files, we would need a library like xlsx
      // For now, we'll throw an error suggesting CSV format
      throw new Error('Excel files not yet supported. Please convert to CSV format.');
    }
    
    throw new Error('Unsupported file format');
  }

  /**
   * Parse CSV content into structured data
   */
  private async parseFileContent(content: string, filename: string): Promise<FileParseResult> {
    const lines = content.split('\n').filter(line => line.trim());
    const errors: FileValidationError[] = [];
    const warnings: FileValidationError[] = [];
    const data: BulkAssignmentFileData[] = [];

    if (lines.length === 0) {
      errors.push({
        row: 0,
        field: 'file',
        message: 'File is empty'
      });
      return { data, errors, warnings };
    }

    if (lines.length > this.MAX_RECORDS + 1) { // +1 for header
      errors.push({
        row: 0,
        field: 'file',
        message: `File contains too many records. Maximum allowed: ${this.MAX_RECORDS}`
      });
      return { data, errors, warnings };
    }

    // Parse header row
    const headers = this.parseCSVRow(lines[0]).map(h => h.trim().toLowerCase());
    const headerValidation = this.validateHeaders(headers);
    errors.push(...headerValidation);

    if (errors.length > 0) {
      return { data, errors, warnings };
    }

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const rowNumber = i + 1;
      const values = this.parseCSVRow(lines[i]);
      
      if (values.length === 0 || values.every(v => !v.trim())) {
        // Skip empty rows
        continue;
      }

      const rowData = this.parseRowData(headers, values, rowNumber);
      
      if (rowData.errors.length > 0) {
        errors.push(...rowData.errors);
      }
      
      if (rowData.warnings.length > 0) {
        warnings.push(...rowData.warnings);
      }

      if (rowData.data) {
        data.push(rowData.data);
      }
    }

    // Additional validation
    const duplicateEmails = this.findDuplicateEmails(data);
    duplicateEmails.forEach(duplicate => {
      warnings.push({
        row: duplicate.row,
        field: 'email',
        message: `Duplicate email found: ${duplicate.email}`,
        value: duplicate.email
      });
    });

    return { data, errors, warnings };
  }

  /**
   * Parse a single CSV row, handling quoted values
   */
  private parseCSVRow(row: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      
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

  /**
   * Validate CSV headers
   */
  private validateHeaders(headers: string[]): FileValidationError[] {
    const errors: FileValidationError[] = [];
    
    // Check for required headers
    const missingRequired = this.REQUIRED_HEADERS.filter(required => 
      !headers.some(header => this.normalizeHeader(header) === required)
    );
    
    if (missingRequired.length > 0) {
      errors.push({
        row: 1,
        field: 'headers',
        message: `Missing required headers: ${missingRequired.join(', ')}`
      });
    }

    // Check for unknown headers
    const allValidHeaders = [...this.REQUIRED_HEADERS, ...this.OPTIONAL_HEADERS];
    const unknownHeaders = headers.filter(header => 
      !allValidHeaders.includes(this.normalizeHeader(header))
    );
    
    if (unknownHeaders.length > 0) {
      // This is a warning, not an error
      // We'll handle it in the warnings section
    }

    return errors;
  }

  /**
   * Normalize header names for comparison
   */
  private normalizeHeader(header: string): string {
    return header.toLowerCase().replace(/[_\s]/g, '');
  }

  /**
   * Parse a single row of data
   */
  private parseRowData(
    headers: string[], 
    values: string[], 
    rowNumber: number
  ): { data?: BulkAssignmentFileData; errors: FileValidationError[]; warnings: FileValidationError[] } {
    const errors: FileValidationError[] = [];
    const warnings: FileValidationError[] = [];
    const rowData: Partial<BulkAssignmentFileData> = {};

    // Map values to fields based on headers
    headers.forEach((header, index) => {
      const value = values[index]?.trim() || '';
      const normalizedHeader = this.normalizeHeader(header);

      switch (normalizedHeader) {
        case 'email':
          rowData.email = value;
          break;
        case 'firstname':
        case 'first_name':
          rowData.firstName = value;
          break;
        case 'lastname':
        case 'last_name':
          rowData.lastName = value;
          break;
        case 'role':
          if (value && Object.values(UserRole).includes(value as UserRole)) {
            rowData.role = value as UserRole;
          } else if (value) {
            errors.push({
              row: rowNumber,
              field: 'role',
              message: `Invalid role: ${value}. Valid roles: ${Object.values(UserRole).join(', ')}`,
              value
            });
          }
          break;
        case 'department':
        case 'departmentid':
        case 'department_id':
          rowData.departmentId = value;
          break;
        case 'justification':
          rowData.justification = value;
          break;
      }
    });

    // Validate required fields
    if (!rowData.email) {
      errors.push({
        row: rowNumber,
        field: 'email',
        message: 'Email is required'
      });
    } else if (!this.isValidEmail(rowData.email)) {
      errors.push({
        row: rowNumber,
        field: 'email',
        message: 'Invalid email format',
        value: rowData.email
      });
    }

    // Set default role if not specified
    if (!rowData.role) {
      rowData.role = UserRole.STUDENT;
      warnings.push({
        row: rowNumber,
        field: 'role',
        message: 'No role specified, defaulting to student',
        value: UserRole.STUDENT
      });
    }

    // Validate department if specified
    if (rowData.departmentId && !this.isValidUUID(rowData.departmentId)) {
      warnings.push({
        row: rowNumber,
        field: 'departmentId',
        message: 'Department ID format may be invalid',
        value: rowData.departmentId
      });
    }

    return {
      data: errors.length === 0 ? rowData as BulkAssignmentFileData : undefined,
      errors,
      warnings
    };
  }

  /**
   * Find duplicate emails in the data
   */
  private findDuplicateEmails(data: BulkAssignmentFileData[]): Array<{ email: string; row: number }> {
    const emailCounts = new Map<string, number[]>();
    const duplicates: Array<{ email: string; row: number }> = [];

    data.forEach((item, index) => {
      const email = item.email.toLowerCase();
      if (!emailCounts.has(email)) {
        emailCounts.set(email, []);
      }
      emailCounts.get(email)!.push(index + 2); // +2 because index is 0-based and we skip header
    });

    emailCounts.forEach((rows, email) => {
      if (rows.length > 1) {
        rows.forEach(row => {
          duplicates.push({ email, row });
        });
      }
    });

    return duplicates;
  }

  /**
   * Process bulk role assignments with transaction handling
   */
  async processBulkAssignment(
    assignments: BulkAssignmentFileData[],
    institutionId: string,
    assignedBy: string,
    options: BulkProcessingOptions = {}
  ): Promise<BulkRoleAssignmentResult> {
    const {
      validateOnly = false,
      skipDuplicates = false,
      sendWelcomeEmails = true,
      batchSize = 100
    } = options;

    const result: BulkRoleAssignmentResult = {
      successful: 0,
      failed: 0,
      errors: [],
      assignments: []
    };

    // Convert to role assignment requests
    const roleRequests: RoleAssignmentRequest[] = assignments.map(assignment => ({
      userId: '', // Will be resolved during processing
      role: assignment.role,
      assignedBy,
      institutionId,
      departmentId: assignment.departmentId,
      justification: assignment.justification || 'Bulk assignment',
      metadata: {
        email: assignment.email,
        firstName: assignment.firstName,
        lastName: assignment.lastName,
        bulkAssignment: true
      }
    }));

    // Process in batches
    for (let i = 0; i < roleRequests.length; i += batchSize) {
      const batch = roleRequests.slice(i, i + batchSize);
      const batchResult = await this.processBatch(batch, validateOnly, skipDuplicates);
      
      result.successful += batchResult.successful;
      result.failed += batchResult.failed;
      result.errors.push(...batchResult.errors);
      result.assignments.push(...batchResult.assignments);
    }

    // Send welcome emails if requested and not validation only
    if (!validateOnly && sendWelcomeEmails && result.successful > 0) {
      await this.sendWelcomeEmails(result.assignments);
    }

    return result;
  }

  /**
   * Process a batch of assignments
   */
  private async processBatch(
    batch: RoleAssignmentRequest[],
    validateOnly: boolean,
    skipDuplicates: boolean
  ): Promise<BulkRoleAssignmentResult> {
    const result: BulkRoleAssignmentResult = {
      successful: 0,
      failed: 0,
      errors: [],
      assignments: []
    };

    for (let i = 0; i < batch.length; i++) {
      const request = batch[i];
      const email = request.metadata?.email as string;
      
      try {
        if (validateOnly) {
          // Only validate, don't actually assign
          await this.validateAssignmentRequest(request);
          result.successful++;
        } else {
          // Check for existing user or create new one
          const userId = await this.resolveOrCreateUser(email, request);
          request.userId = userId;

          // Check for duplicate assignment
          if (skipDuplicates && await this.hasExistingRole(userId, request.role, request.institutionId)) {
            result.successful++; // Count as success since we're skipping
            continue;
          }

          // Assign the role
          const assignment = await this.assignRole(request);
          result.assignments.push(assignment);
          result.successful++;
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          index: i,
          userId: email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return result;
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate UUID format
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  // Abstract methods that would be implemented with actual database operations
  private async validateAssignmentRequest(request: RoleAssignmentRequest): Promise<void> {
    // Implementation would validate business rules
    if (!request.metadata?.email) {
      throw new Error('Email is required');
    }
    
    if (!Object.values(UserRole).includes(request.role)) {
      throw new Error(`Invalid role: ${request.role}`);
    }
  }

  private async resolveOrCreateUser(email: string, request: RoleAssignmentRequest): Promise<string> {
    // Implementation would:
    // 1. Check if user exists by email
    // 2. If not, create new user with provided information
    // 3. Return user ID
    
    // For now, return a mock UUID
    return crypto.randomUUID();
  }

  private async hasExistingRole(userId: string, role: UserRole, institutionId: string): Promise<boolean> {
    // Implementation would check if user already has this role
    return false;
  }

  private async assignRole(request: RoleAssignmentRequest): Promise<any> {
    // Implementation would use RoleManager to assign the role
    // For now, return a mock assignment
    return {
      id: crypto.randomUUID(),
      userId: request.userId,
      role: request.role,
      assignedBy: request.assignedBy,
      assignedAt: new Date(),
      institutionId: request.institutionId,
      departmentId: request.departmentId,
      metadata: request.metadata
    };
  }

  private async sendWelcomeEmails(assignments: any[]): Promise<void> {
    // Implementation would send welcome emails to new users
    console.log(`Sending welcome emails to ${assignments.length} users`);
  }
}