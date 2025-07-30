/**
 * Bulk Role Assignment API Endpoint
 * 
 * Handles bulk role assignment requests with file upload processing,
 * validation, and transaction handling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BulkRoleAssignmentService } from '@/lib/services/bulk-role-assignment';
import { RoleManager } from '@/lib/services/role-manager';
import { UserRole, BulkRoleAssignmentResult } from '@/lib/types/role-management';

interface BulkAssignmentRequest {
  assignments: Array<{
    email: string;
    firstName?: string;
    lastName?: string;
    role: UserRole;
    departmentId?: string;
    institutionId: string;
    justification?: string;
  }>;
  validateOnly?: boolean;
  skipDuplicates?: boolean;
  sendWelcomeEmails?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body: BulkAssignmentRequest = await request.json();
    
    // Validate request structure
    if (!body.assignments || !Array.isArray(body.assignments)) {
      return NextResponse.json(
        { error: 'Invalid request: assignments array is required' },
        { status: 400 }
      );
    }

    if (body.assignments.length === 0) {
      return NextResponse.json(
        { error: 'No assignments provided' },
        { status: 400 }
      );
    }

    if (body.assignments.length > 10000) {
      return NextResponse.json(
        { error: 'Too many assignments. Maximum allowed: 10000' },
        { status: 400 }
      );
    }

    // Validate user permissions
    const hasPermission = await checkBulkAssignmentPermission(user.id, body.assignments[0].institutionId);
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions for bulk role assignment' },
        { status: 403 }
      );
    }

    // Initialize services
    const bulkService = new BulkRoleAssignmentService();
    const roleManager = new RoleManager({
      defaultRoleRequestExpiration: 7,
      maxTemporaryRoleDuration: 90,
      requireApprovalForRoles: [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
      autoApproveRoles: [UserRole.STUDENT]
    });

    // Process assignments with transaction handling
    const result = await processWithTransaction(async () => {
      // Convert request format to service format
      const assignmentData = body.assignments.map(assignment => ({
        email: assignment.email,
        firstName: assignment.firstName,
        lastName: assignment.lastName,
        role: assignment.role,
        departmentId: assignment.departmentId,
        justification: assignment.justification
      }));

      // Process bulk assignment
      return await bulkService.processBulkAssignment(
        assignmentData,
        body.assignments[0].institutionId,
        user.id,
        {
          validateOnly: body.validateOnly || false,
          skipDuplicates: body.skipDuplicates || false,
          sendWelcomeEmails: body.sendWelcomeEmails !== false, // Default to true
          batchSize: 50 // Process in smaller batches for better performance
        }
      );
    });

    // Log the bulk assignment operation
    await logBulkAssignmentOperation(
      user.id,
      body.assignments[0].institutionId,
      body.assignments.length,
      result.successful,
      result.failed,
      body.validateOnly || false
    );

    return NextResponse.json({
      success: true,
      result: {
        successful: result.successful,
        failed: result.failed,
        total: body.assignments.length,
        errors: result.errors,
        validateOnly: body.validateOnly || false
      }
    });

  } catch (error) {
    console.error('Bulk role assignment error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

/**
 * Check if user has permission to perform bulk role assignments
 */
async function checkBulkAssignmentPermission(userId: string, institutionId: string): Promise<boolean> {
  const supabase = createClient();
  
  try {
    // Check if user is institution admin or system admin
    const { data: userRoles, error } = await supabase
      .from('user_role_assignments')
      .select('role, status')
      .eq('user_id', userId)
      .eq('institution_id', institutionId)
      .eq('status', 'active');

    if (error) {
      console.error('Error checking user permissions:', error);
      return false;
    }

    const hasAdminRole = userRoles?.some(role => 
      role.role === UserRole.INSTITUTION_ADMIN || 
      role.role === UserRole.SYSTEM_ADMIN
    );

    return hasAdminRole || false;
  } catch (error) {
    console.error('Permission check error:', error);
    return false;
  }
}

/**
 * Process bulk assignment with database transaction
 */
async function processWithTransaction<T>(operation: () => Promise<T>): Promise<T> {
  const supabase = createClient();
  
  try {
    // Start transaction
    const { data, error } = await supabase.rpc('begin_transaction');
    if (error) throw error;

    try {
      // Execute the operation
      const result = await operation();
      
      // Commit transaction
      const { error: commitError } = await supabase.rpc('commit_transaction');
      if (commitError) throw commitError;
      
      return result;
    } catch (operationError) {
      // Rollback transaction on error
      const { error: rollbackError } = await supabase.rpc('rollback_transaction');
      if (rollbackError) {
        console.error('Rollback error:', rollbackError);
      }
      throw operationError;
    }
  } catch (error) {
    // If we can't start transaction, proceed without it but log the issue
    console.warn('Transaction not available, proceeding without transaction:', error);
    return await operation();
  }
}

/**
 * Log bulk assignment operation for audit purposes
 */
async function logBulkAssignmentOperation(
  userId: string,
  institutionId: string,
  totalAssignments: number,
  successful: number,
  failed: number,
  validateOnly: boolean
): Promise<void> {
  const supabase = createClient();
  
  try {
    await supabase
      .from('role_audit_log')
      .insert({
        user_id: userId,
        action: validateOnly ? 'bulk_validated' : 'bulk_assigned',
        changed_by: userId,
        reason: `Bulk ${validateOnly ? 'validation' : 'assignment'} operation`,
        timestamp: new Date().toISOString(),
        institution_id: institutionId,
        metadata: {
          total_assignments: totalAssignments,
          successful,
          failed,
          validate_only: validateOnly
        }
      });
  } catch (error) {
    console.error('Failed to log bulk assignment operation:', error);
    // Don't throw error as this is just logging
  }
}

/**
 * Handle file upload for bulk assignment
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const institutionId = formData.get('institutionId') as string;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!institutionId) {
      return NextResponse.json(
        { error: 'Institution ID is required' },
        { status: 400 }
      );
    }

    // Check permissions
    const hasPermission = await checkBulkAssignmentPermission(user.id, institutionId);
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Parse and validate file
    const bulkService = new BulkRoleAssignmentService();
    const parseResult = await bulkService.parseFile(file);

    return NextResponse.json({
      success: true,
      data: parseResult.data,
      errors: parseResult.errors,
      warnings: parseResult.warnings,
      summary: {
        totalRows: parseResult.data.length,
        errorCount: parseResult.errors.length,
        warningCount: parseResult.warnings.length,
        isValid: parseResult.errors.length === 0
      }
    });

  } catch (error) {
    console.error('File upload error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to process file',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}