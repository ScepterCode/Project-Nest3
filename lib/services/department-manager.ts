import { createClient } from '@/lib/supabase/server';
import {
  Department,
  DepartmentCreationData,
  DepartmentFilters,
  ValidationResult,
  ValidationError,
  DepartmentStatus,
  DepartmentSettings,
  TenantContext
} from '@/lib/types/institution';

export interface DepartmentTransferOptions {
  preserveUserData: boolean;
  preserveClassData: boolean;
  preserveAnalytics: boolean;
  notifyUsers: boolean;
}

export interface DepartmentDeletionOptions {
  preserveData: boolean;
  transferUsersTo?: string; // Department ID to transfer users to
  transferClassesTo?: string; // Department ID to transfer classes to
  archiveAnalytics: boolean;
}

export interface UserTransferResult {
  success: boolean;
  transferredUsers: number;
  failedTransfers: string[];
  errors?: ValidationError[];
}

export interface DepartmentHierarchyNode {
  department: Department;
  children: DepartmentHierarchyNode[];
  userCount: number;
  classCount: number;
}

export class DepartmentManager {
  private supabase;

  constructor() {
    this.supabase = createClient();
  }

  /**
   * Create a new department with validation and hierarchy support
   */
  async createDepartment(
    institutionId: string, 
    data: DepartmentCreationData,
    context: TenantContext
  ): Promise<{ success: boolean; department?: Department; errors?: ValidationError[] }> {
    try {
      // Validate input data
      const validation = await this.validateDepartmentData(data, institutionId);
      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }

      // Check department code uniqueness within institution
      const codeCheck = await this.checkDepartmentCodeUniqueness(data.code, institutionId);
      if (!codeCheck.isUnique) {
        return { 
          success: false, 
          errors: [{ field: 'code', message: codeCheck.message, code: 'CODE_CONFLICT' }] 
        };
      }

      // Validate hierarchical structure if parent department is specified
      if (data.parentDepartmentId) {
        const hierarchyValidation = await this.validateHierarchy(data.parentDepartmentId, institutionId);
        if (!hierarchyValidation.isValid) {
          return { success: false, errors: hierarchyValidation.errors };
        }
      }

      // Prepare department data with defaults
      const departmentData = this.prepareDepartmentData(data, institutionId);

      // Insert department
      const { data: department, error } = await this.supabase
        .from('departments')
        .insert(departmentData)
        .select()
        .single();

      if (error) {
        console.error('Error creating department:', error);
        return { 
          success: false, 
          errors: [{ field: 'general', message: 'Failed to create department', code: 'DATABASE_ERROR' }] 
        };
      }

      // Transform database result to Department type
      const transformedDepartment = this.transformDatabaseToDepartment(department);

      // Create default admin assignment if adminId is provided
      if (data.adminId) {
        await this.assignDepartmentAdmin(transformedDepartment.id, data.adminId);
      }

      return { success: true, department: transformedDepartment };
    } catch (error) {
      console.error('Unexpected error creating department:', error);
      return { 
        success: false, 
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }] 
      };
    }
  }

  /**
   * Update department with validation
   */
  async updateDepartment(
    id: string, 
    updates: Partial<DepartmentCreationData>,
    context: TenantContext
  ): Promise<{ success: boolean; department?: Department; errors?: ValidationError[] }> {
    try {
      // Get current department to validate updates
      const currentDepartment = await this.getDepartmentById(id);
      if (!currentDepartment) {
        return {
          success: false,
          errors: [{ field: 'id', message: 'Department not found', code: 'NOT_FOUND' }]
        };
      }

      // Validate tenant context
      if (currentDepartment.institutionId !== context.institutionId) {
        return {
          success: false,
          errors: [{ field: 'access', message: 'Access denied', code: 'ACCESS_DENIED' }]
        };
      }

      // Validate code uniqueness if code is being updated
      if (updates.code && updates.code !== currentDepartment.code) {
        const codeCheck = await this.checkDepartmentCodeUniqueness(updates.code, currentDepartment.institutionId, id);
        if (!codeCheck.isUnique) {
          return { 
            success: false, 
            errors: [{ field: 'code', message: codeCheck.message, code: 'CODE_CONFLICT' }] 
          };
        }
      }

      // Validate hierarchy changes
      if (updates.parentDepartmentId !== undefined) {
        if (updates.parentDepartmentId) {
          const hierarchyValidation = await this.validateHierarchy(updates.parentDepartmentId, currentDepartment.institutionId, id);
          if (!hierarchyValidation.isValid) {
            return { success: false, errors: hierarchyValidation.errors };
          }
        }
      }

      // Prepare update data
      const updateData = this.prepareUpdateData(updates);

      const { data, error } = await this.supabase
        .from('departments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating department:', error);
        return { 
          success: false, 
          errors: [{ field: 'general', message: 'Failed to update department', code: 'DATABASE_ERROR' }] 
        };
      }

      // Update admin assignment if adminId changed
      if (updates.adminId && updates.adminId !== currentDepartment.adminId) {
        await this.assignDepartmentAdmin(id, updates.adminId);
      }

      const transformedDepartment = this.transformDatabaseToDepartment(data);
      return { success: true, department: transformedDepartment };
    } catch (error) {
      console.error('Unexpected error updating department:', error);
      return { 
        success: false, 
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }] 
      };
    }
  }

  /**
   * Delete department with data preservation options
   */
  async deleteDepartment(
    id: string, 
    options: DepartmentDeletionOptions,
    context: TenantContext
  ): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      // Get department to validate deletion
      const department = await this.getDepartmentById(id);
      if (!department) {
        return {
          success: false,
          errors: [{ field: 'id', message: 'Department not found', code: 'NOT_FOUND' }]
        };
      }

      // Validate tenant context
      if (department.institutionId !== context.institutionId) {
        return {
          success: false,
          errors: [{ field: 'access', message: 'Access denied', code: 'ACCESS_DENIED' }]
        };
      }

      // Check if department can be deleted
      const canDelete = await this.canDeleteDepartment(id, options);
      if (!canDelete.canDelete) {
        return { 
          success: false, 
          errors: [{ field: 'general', message: canDelete.reason, code: 'DELETE_RESTRICTED' }] 
        };
      }

      // Handle data preservation and transfers
      if (options.preserveData) {
        const preservationResult = await this.preserveDepartmentData(id, options);
        if (!preservationResult.success) {
          return preservationResult;
        }
      }

      // Handle user transfers
      if (options.transferUsersTo) {
        const transferResult = await this.transferDepartmentUsers(id, options.transferUsersTo, {
          preserveUserData: true,
          preserveClassData: false,
          preserveAnalytics: options.archiveAnalytics,
          notifyUsers: true
        });
        if (!transferResult.success) {
          return { success: false, errors: transferResult.errors };
        }
      }

      // Handle class transfers
      if (options.transferClassesTo) {
        await this.transferDepartmentClasses(id, options.transferClassesTo);
      }

      // Archive analytics if requested
      if (options.archiveAnalytics) {
        await this.archiveDepartmentAnalytics(id);
      }

      // Soft delete by setting status to archived
      const { error } = await this.supabase
        .from('departments')
        .update({ 
          status: 'archived' as DepartmentStatus, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', id);

      if (error) {
        console.error('Error deleting department:', error);
        return { 
          success: false, 
          errors: [{ field: 'general', message: 'Failed to delete department', code: 'DATABASE_ERROR' }] 
        };
      }

      return { success: true };
    } catch (error) {
      console.error('Unexpected error deleting department:', error);
      return { 
        success: false, 
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }] 
      };
    }
  }

  /**
   * Get department by ID
   */
  async getDepartmentById(id: string): Promise<Department | null> {
    try {
      const { data, error } = await this.supabase
        .from('departments')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return null;
      }

      return this.transformDatabaseToDepartment(data);
    } catch (error) {
      console.error('Error fetching department:', error);
      return null;
    }
  }

  /**
   * List departments with filtering and hierarchy support
   */
  async listDepartments(filters: DepartmentFilters = {}): Promise<{ departments: Department[]; total: number }> {
    try {
      let query = this.supabase.from('departments').select('*', { count: 'exact' });

      // Apply filters
      if (filters.institutionId) {
        query = query.eq('institution_id', filters.institutionId);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.adminId) {
        query = query.eq('admin_id', filters.adminId);
      }
      if (filters.parentDepartmentId !== undefined) {
        if (filters.parentDepartmentId === null) {
          query = query.is('parent_department_id', null);
        } else {
          query = query.eq('parent_department_id', filters.parentDepartmentId);
        }
      }
      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,code.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      // Apply pagination
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
      if (filters.offset) {
        query = query.range(filters.offset, (filters.offset + (filters.limit || 10)) - 1);
      }

      // Order by name by default
      query = query.order('name', { ascending: true });

      const { data, error, count } = await query;

      if (error) {
        console.error('Error listing departments:', error);
        return { departments: [], total: 0 };
      }

      const departments = (data || []).map(item => this.transformDatabaseToDepartment(item));
      return { departments, total: count || 0 };
    } catch (error) {
      console.error('Unexpected error listing departments:', error);
      return { departments: [], total: 0 };
    }
  }

  /**
   * Get department hierarchy for an institution
   */
  async getDepartmentHierarchy(institutionId: string): Promise<DepartmentHierarchyNode[]> {
    try {
      // Get all departments for the institution
      const { departments } = await this.listDepartments({ 
        institutionId, 
        status: 'active',
        limit: 1000 // Get all departments
      });

      // Get user and class counts for each department
      const departmentStats = await this.getDepartmentStats(departments.map(d => d.id));

      // Build hierarchy tree
      const hierarchy = this.buildHierarchyTree(departments, departmentStats);
      
      return hierarchy;
    } catch (error) {
      console.error('Error getting department hierarchy:', error);
      return [];
    }
  }

  /**
   * Transfer users between departments
   */
  async transferDepartmentUsers(
    fromDepartmentId: string, 
    toDepartmentId: string,
    options: DepartmentTransferOptions
  ): Promise<UserTransferResult> {
    try {
      // Validate both departments exist and are in the same institution
      const fromDept = await this.getDepartmentById(fromDepartmentId);
      const toDept = await this.getDepartmentById(toDepartmentId);

      if (!fromDept || !toDept) {
        return {
          success: false,
          transferredUsers: 0,
          failedTransfers: [],
          errors: [{ field: 'departments', message: 'One or both departments not found', code: 'NOT_FOUND' }]
        };
      }

      if (fromDept.institutionId !== toDept.institutionId) {
        return {
          success: false,
          transferredUsers: 0,
          failedTransfers: [],
          errors: [{ field: 'departments', message: 'Departments must be in the same institution', code: 'INVALID_TRANSFER' }]
        };
      }

      // Get users to transfer
      const { data: users, error: usersError } = await this.supabase
        .from('user_departments')
        .select('user_id, users!inner(id, email, full_name)')
        .eq('department_id', fromDepartmentId);

      if (usersError) {
        console.error('Error fetching users for transfer:', usersError);
        return {
          success: false,
          transferredUsers: 0,
          failedTransfers: [],
          errors: [{ field: 'users', message: 'Failed to fetch users', code: 'DATABASE_ERROR' }]
        };
      }

      const failedTransfers: string[] = [];
      let transferredCount = 0;

      // Transfer each user
      for (const userDept of users || []) {
        try {
          // Update user's department assignment
          const { error: updateError } = await this.supabase
            .from('user_departments')
            .update({ 
              department_id: toDepartmentId,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userDept.user_id)
            .eq('department_id', fromDepartmentId);

          if (updateError) {
            failedTransfers.push(userDept.users.email);
            continue;
          }

          // Handle class enrollments if preserveClassData is false
          if (!options.preserveClassData) {
            await this.transferUserClassEnrollments(userDept.user_id, fromDepartmentId, toDepartmentId);
          }

          transferredCount++;

          // Send notification if requested
          if (options.notifyUsers) {
            await this.notifyUserTransfer(userDept.users, fromDept, toDept);
          }

        } catch (error) {
          console.error(`Error transferring user ${userDept.users.email}:`, error);
          failedTransfers.push(userDept.users.email);
        }
      }

      return {
        success: failedTransfers.length === 0,
        transferredUsers: transferredCount,
        failedTransfers
      };

    } catch (error) {
      console.error('Unexpected error transferring users:', error);
      return {
        success: false,
        transferredUsers: 0,
        failedTransfers: [],
        errors: [{ field: 'general', message: 'Unexpected error occurred', code: 'INTERNAL_ERROR' }]
      };
    }
  }

  /**
   * Validate department data
   */
  private async validateDepartmentData(data: DepartmentCreationData, institutionId: string): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    // Required fields
    if (!data.name || data.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Department name is required', code: 'REQUIRED' });
    }

    if (!data.code || data.code.trim().length === 0) {
      errors.push({ field: 'code', message: 'Department code is required', code: 'REQUIRED' });
    }

    if (!data.adminId || data.adminId.trim().length === 0) {
      errors.push({ field: 'adminId', message: 'Department admin is required', code: 'REQUIRED' });
    }

    // Validate code format (alphanumeric, uppercase)
    if (data.code && !/^[A-Z0-9]{2,10}$/.test(data.code)) {
      errors.push({ field: 'code', message: 'Department code must be 2-10 uppercase alphanumeric characters', code: 'INVALID_FORMAT' });
    }

    // Validate admin exists and belongs to institution
    if (data.adminId) {
      const adminValidation = await this.validateDepartmentAdmin(data.adminId, institutionId);
      if (!adminValidation.isValid) {
        errors.push(...adminValidation.errors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check department code uniqueness within institution
   */
  private async checkDepartmentCodeUniqueness(code: string, institutionId: string, excludeId?: string): Promise<{ isUnique: boolean; message: string }> {
    try {
      let query = this.supabase
        .from('departments')
        .select('id')
        .eq('code', code)
        .eq('institution_id', institutionId);

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data } = await query;

      if (data && data.length > 0) {
        return { isUnique: false, message: 'Department code is already in use within this institution' };
      }

      return { isUnique: true, message: 'Department code is available' };
    } catch (error) {
      console.error('Error checking department code uniqueness:', error);
      return { isUnique: false, message: 'Error checking code availability' };
    }
  }

  /**
   * Validate hierarchical structure
   */
  private async validateHierarchy(parentDepartmentId: string, institutionId: string, excludeId?: string): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    try {
      // Check if parent department exists and belongs to same institution
      const parentDept = await this.getDepartmentById(parentDepartmentId);
      if (!parentDept) {
        errors.push({ field: 'parentDepartmentId', message: 'Parent department not found', code: 'NOT_FOUND' });
        return { isValid: false, errors };
      }

      if (parentDept.institutionId !== institutionId) {
        errors.push({ field: 'parentDepartmentId', message: 'Parent department must be in the same institution', code: 'INVALID_PARENT' });
        return { isValid: false, errors };
      }

      // Check for circular reference
      if (excludeId && await this.wouldCreateCircularReference(parentDepartmentId, excludeId)) {
        errors.push({ field: 'parentDepartmentId', message: 'Cannot create circular department hierarchy', code: 'CIRCULAR_REFERENCE' });
      }

      // Check hierarchy depth (max 5 levels)
      const depth = await this.getHierarchyDepth(parentDepartmentId);
      if (depth >= 5) {
        errors.push({ field: 'parentDepartmentId', message: 'Maximum hierarchy depth (5 levels) exceeded', code: 'MAX_DEPTH_EXCEEDED' });
      }

    } catch (error) {
      console.error('Error validating hierarchy:', error);
      errors.push({ field: 'parentDepartmentId', message: 'Error validating hierarchy', code: 'VALIDATION_ERROR' });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate department admin
   */
  private async validateDepartmentAdmin(adminId: string, institutionId: string): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    try {
      // Check if user exists and belongs to institution
      const { data: user, error } = await this.supabase
        .from('users')
        .select('id, role')
        .eq('id', adminId)
        .single();

      if (error || !user) {
        errors.push({ field: 'adminId', message: 'Admin user not found', code: 'NOT_FOUND' });
        return { isValid: false, errors };
      }

      // Check if user has appropriate role
      const validAdminRoles = ['institution_admin', 'department_admin', 'teacher'];
      if (!validAdminRoles.includes(user.role)) {
        errors.push({ field: 'adminId', message: 'User does not have appropriate role for department administration', code: 'INVALID_ROLE' });
      }

      // In a real implementation, you would also check if user belongs to the institution
      // This would require a user_institutions or similar table

    } catch (error) {
      console.error('Error validating department admin:', error);
      errors.push({ field: 'adminId', message: 'Error validating admin user', code: 'VALIDATION_ERROR' });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if assignment would create circular reference
   */
  private async wouldCreateCircularReference(parentId: string, childId: string): Promise<boolean> {
    try {
      // Get all ancestors of the proposed parent
      const ancestors = await this.getDepartmentAncestors(parentId);
      
      // Check if the child is already an ancestor of the parent
      return ancestors.some(ancestor => ancestor.id === childId);
    } catch (error) {
      console.error('Error checking circular reference:', error);
      return true; // Err on the side of caution
    }
  }

  /**
   * Get hierarchy depth for a department
   */
  private async getHierarchyDepth(departmentId: string): Promise<number> {
    try {
      const ancestors = await this.getDepartmentAncestors(departmentId);
      return ancestors.length;
    } catch (error) {
      console.error('Error getting hierarchy depth:', error);
      return 0;
    }
  }

  /**
   * Get all ancestors of a department
   */
  private async getDepartmentAncestors(departmentId: string): Promise<Department[]> {
    const ancestors: Department[] = [];
    let currentId = departmentId;

    try {
      while (currentId) {
        const dept = await this.getDepartmentById(currentId);
        if (!dept || !dept.parentDepartmentId) {
          break;
        }
        
        ancestors.push(dept);
        currentId = dept.parentDepartmentId;

        // Prevent infinite loops
        if (ancestors.length > 10) {
          break;
        }
      }
    } catch (error) {
      console.error('Error getting department ancestors:', error);
    }

    return ancestors;
  }

  /**
   * Prepare department data for database insertion
   */
  private prepareDepartmentData(data: DepartmentCreationData, institutionId: string): any {
    const now = new Date().toISOString();

    // Default settings
    const defaultSettings: DepartmentSettings = {
      defaultClassSettings: {
        defaultCapacity: 30,
        allowWaitlist: true,
        requireApproval: false,
        allowSelfEnrollment: true,
        gradingScale: 'letter',
        passingGrade: 70
      },
      gradingPolicies: [
        {
          name: 'Standard Letter Grade',
          scale: 'letter',
          ranges: [
            { min: 90, max: 100, grade: 'A' },
            { min: 80, max: 89, grade: 'B' },
            { min: 70, max: 79, grade: 'C' },
            { min: 60, max: 69, grade: 'D' },
            { min: 0, max: 59, grade: 'F' }
          ],
          allowExtraCredit: true,
          roundingRule: 'nearest'
        }
      ],
      assignmentDefaults: {
        allowLateSubmissions: true,
        latePenaltyPercent: 10,
        maxLateDays: 7,
        allowResubmissions: false,
        maxResubmissions: 0,
        defaultDueDays: 7,
        requireRubric: false
      },
      collaborationRules: {
        allowPeerReview: true,
        allowGroupAssignments: true,
        allowCrossClassCollaboration: false,
        allowExternalCollaboration: false,
        defaultGroupSize: 3,
        maxGroupSize: 6
      },
      customFields: []
    };

    return {
      institution_id: institutionId,
      name: data.name,
      description: data.description || '',
      code: data.code.toUpperCase(),
      admin_id: data.adminId,
      parent_department_id: data.parentDepartmentId || null,
      settings: { ...defaultSettings, ...data.settings },
      status: 'active' as DepartmentStatus,
      created_at: now,
      updated_at: now
    };
  }

  /**
   * Prepare update data
   */
  private prepareUpdateData(updates: Partial<DepartmentCreationData>): any {
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (updates.name) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.code) updateData.code = updates.code.toUpperCase();
    if (updates.adminId) updateData.admin_id = updates.adminId;
    if (updates.parentDepartmentId !== undefined) updateData.parent_department_id = updates.parentDepartmentId;
    if (updates.settings) updateData.settings = updates.settings;

    return updateData;
  }

  /**
   * Transform database result to Department type
   */
  private transformDatabaseToDepartment(data: any): Department {
    return {
      id: data.id,
      institutionId: data.institution_id,
      name: data.name,
      description: data.description || '',
      code: data.code,
      adminId: data.admin_id,
      settings: data.settings || {},
      parentDepartmentId: data.parent_department_id,
      status: data.status,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }

  /**
   * Check if department can be deleted
   */
  private async canDeleteDepartment(id: string, options: DepartmentDeletionOptions): Promise<{ canDelete: boolean; reason: string }> {
    try {
      // Check for child departments
      const { departments: children } = await this.listDepartments({ parentDepartmentId: id });
      if (children.length > 0 && !options.preserveData) {
        return { canDelete: false, reason: 'Department has child departments' };
      }

      // Check for active users
      const { data: users } = await this.supabase
        .from('user_departments')
        .select('user_id')
        .eq('department_id', id);

      if (users && users.length > 0 && !options.transferUsersTo && !options.preserveData) {
        return { canDelete: false, reason: 'Department has active users' };
      }

      // Check for active classes
      const { data: classes } = await this.supabase
        .from('classes')
        .select('id')
        .eq('department_id', id)
        .neq('status', 'archived');

      if (classes && classes.length > 0 && !options.transferClassesTo && !options.preserveData) {
        return { canDelete: false, reason: 'Department has active classes' };
      }

      return { canDelete: true, reason: 'Department can be deleted' };
    } catch (error) {
      console.error('Error checking if department can be deleted:', error);
      return { canDelete: false, reason: 'Error checking deletion eligibility' };
    }
  }

  /**
   * Preserve department data before deletion
   */
  private async preserveDepartmentData(id: string, options: DepartmentDeletionOptions): Promise<{ success: boolean; errors?: ValidationError[] }> {
    try {
      // Archive child departments
      const { departments: children } = await this.listDepartments({ parentDepartmentId: id });
      for (const child of children) {
        await this.supabase
          .from('departments')
          .update({ status: 'archived', updated_at: new Date().toISOString() })
          .eq('id', child.id);
      }

      // Archive analytics if requested
      if (options.archiveAnalytics) {
        await this.archiveDepartmentAnalytics(id);
      }

      return { success: true };
    } catch (error) {
      console.error('Error preserving department data:', error);
      return {
        success: false,
        errors: [{ field: 'preservation', message: 'Failed to preserve department data', code: 'PRESERVATION_ERROR' }]
      };
    }
  }

  /**
   * Transfer department classes to another department
   */
  private async transferDepartmentClasses(fromDepartmentId: string, toDepartmentId: string): Promise<void> {
    try {
      await this.supabase
        .from('classes')
        .update({ 
          department_id: toDepartmentId,
          updated_at: new Date().toISOString()
        })
        .eq('department_id', fromDepartmentId);
    } catch (error) {
      console.error('Error transferring department classes:', error);
    }
  }

  /**
   * Archive department analytics
   */
  private async archiveDepartmentAnalytics(departmentId: string): Promise<void> {
    try {
      // Get existing analytics data
      const { data: analyticsData } = await this.supabase
        .from('department_analytics')
        .select('*')
        .eq('department_id', departmentId);

      if (analyticsData && analyticsData.length > 0) {
        // Archive the data with archive timestamp
        const archiveData = analyticsData.map(record => ({
          ...record,
          archived_at: new Date().toISOString(),
          original_id: record.id
        }));

        // Insert into archive table
        await this.supabase
          .from('department_analytics_archive')
          .insert(archiveData);

        // Delete original records
        await this.supabase
          .from('department_analytics')
          .delete()
          .eq('department_id', departmentId);
      }
    } catch (error) {
      console.error('Error archiving department analytics:', error);
    }
  }

  /**
   * Assign department admin
   */
  private async assignDepartmentAdmin(departmentId: string, adminId: string): Promise<void> {
    try {
      // Update user's department assignment with admin role
      await this.supabase
        .from('user_departments')
        .upsert({
          user_id: adminId,
          department_id: departmentId,
          role: 'department_admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error assigning department admin:', error);
    }
  }

  /**
   * Transfer user class enrollments
   */
  private async transferUserClassEnrollments(userId: string, fromDepartmentId: string, toDepartmentId: string): Promise<void> {
    try {
      // Get classes from the old department that the user is enrolled in
      const { data: enrollments } = await this.supabase
        .from('enrollments')
        .select('class_id, classes!inner(department_id)')
        .eq('user_id', userId)
        .eq('classes.department_id', fromDepartmentId);

      if (enrollments && enrollments.length > 0) {
        // Get corresponding classes in the new department (if they exist)
        for (const enrollment of enrollments) {
          // This is a simplified approach - in reality you might need more complex logic
          // to match classes between departments or handle the transfer differently
          await this.supabase
            .from('enrollments')
            .update({ updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('class_id', enrollment.class_id);
        }
      }
    } catch (error) {
      console.error('Error transferring user class enrollments:', error);
    }
  }

  /**
   * Notify user about department transfer
   */
  private async notifyUserTransfer(user: any, fromDept: Department, toDept: Department): Promise<void> {
    try {
      // Create notification record
      await this.supabase
        .from('notifications')
        .insert({
          user_id: user.id,
          type: 'department_transfer',
          title: 'Department Transfer',
          message: `You have been transferred from ${fromDept.name} to ${toDept.name}`,
          data: {
            fromDepartment: fromDept.name,
            toDepartment: toDept.name,
            transferDate: new Date().toISOString()
          },
          created_at: new Date().toISOString()
        });

      // In a real implementation, you might also send an email notification
      // await this.emailService.sendDepartmentTransferNotification(user, fromDept, toDept);
    } catch (error) {
      console.error('Error notifying user about transfer:', error);
    }
  }

  /**
   * Get department statistics
   */
  private async getDepartmentStats(departmentIds: string[]): Promise<Record<string, { userCount: number; classCount: number }>> {
    const stats: Record<string, { userCount: number; classCount: number }> = {};

    try {
      // Get user counts
      const { data: userCounts } = await this.supabase
        .from('user_departments')
        .select('department_id')
        .in('department_id', departmentIds);

      // Get class counts
      const { data: classCounts } = await this.supabase
        .from('classes')
        .select('department_id')
        .in('department_id', departmentIds)
        .neq('status', 'archived');

      // Initialize stats for all departments
      departmentIds.forEach(id => {
        stats[id] = { userCount: 0, classCount: 0 };
      });

      // Count users per department
      if (userCounts) {
        userCounts.forEach(record => {
          if (stats[record.department_id]) {
            stats[record.department_id].userCount++;
          }
        });
      }

      // Count classes per department
      if (classCounts) {
        classCounts.forEach(record => {
          if (stats[record.department_id]) {
            stats[record.department_id].classCount++;
          }
        });
      }

      return stats;
    } catch (error) {
      console.error('Error getting department stats:', error);
      return stats;
    }
  }

  /**
   * Build hierarchy tree from flat department list
   */
  private buildHierarchyTree(
    departments: Department[], 
    stats: Record<string, { userCount: number; classCount: number }>
  ): DepartmentHierarchyNode[] {
    const nodeMap = new Map<string, DepartmentHierarchyNode>();
    const rootNodes: DepartmentHierarchyNode[] = [];

    // Create nodes for all departments
    departments.forEach(dept => {
      const node: DepartmentHierarchyNode = {
        department: dept,
        children: [],
        userCount: stats[dept.id]?.userCount || 0,
        classCount: stats[dept.id]?.classCount || 0
      };
      nodeMap.set(dept.id, node);
    });

    // Build parent-child relationships
    departments.forEach(dept => {
      const node = nodeMap.get(dept.id);
      if (!node) return;

      if (dept.parentDepartmentId) {
        const parent = nodeMap.get(dept.parentDepartmentId);
        if (parent) {
          parent.children.push(node);
        } else {
          // Parent not found, treat as root
          rootNodes.push(node);
        }
      } else {
        rootNodes.push(node);
      }
    });

    return rootNodes;
  }
}