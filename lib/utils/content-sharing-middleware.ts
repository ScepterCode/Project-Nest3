import { NextRequest, NextResponse } from 'next/server';
import { ContentSharingEnforcement, SharingContext } from '@/lib/services/content-sharing-enforcement';
import { createClient } from '@/lib/supabase/server';

export interface ContentSharingMiddlewareOptions {
  requireAttribution?: boolean;
  allowBypass?: boolean;
  logViolations?: boolean;
}

export class ContentSharingMiddleware {
  private enforcement: ContentSharingEnforcement;
  private supabase = createClient();

  constructor() {
    this.enforcement = new ContentSharingEnforcement();
  }

  /**
   * Middleware to enforce content sharing policies
   */
  async enforceSharing(
    request: NextRequest,
    context: Partial<SharingContext>,
    options: ContentSharingMiddlewareOptions = {}
  ): Promise<NextResponse | null> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }

      // Build complete sharing context
      const sharingContext = await this.buildSharingContext(user.id, context);

      if (!sharingContext) {
        return NextResponse.json({ error: 'Invalid sharing context' }, { status: 400 });
      }

      // Enforce sharing policies
      const result = await this.enforcement.enforceSharing(sharingContext);

      if (!result.allowed) {
        if (options.logViolations) {
          await this.logAccessAttempt(sharingContext, result.reason || 'Access denied');
        }

        return NextResponse.json(
          { 
            error: 'Content sharing not permitted',
            reason: result.reason,
            violations: result.violations
          },
          { status: 403 }
        );
      }

      // Handle approval requirement
      if (result.requiresApproval && !options.allowBypass) {
        return NextResponse.json(
          {
            message: 'Approval required for content sharing',
            approvalWorkflowId: result.approvalWorkflowId,
            requiresApproval: true
          },
          { status: 202 }
        );
      }

      // Handle attribution requirement
      if (result.requiresAttribution && options.requireAttribution) {
        await this.enforcement.enforceAttribution(
          sharingContext.contentId,
          sharingContext.ownerId,
          sharingContext.ownerInstitutionId
        );
      }

      // Log successful sharing if violations were detected
      if (result.violations && result.violations.length > 0 && options.logViolations) {
        await this.logAccessAttempt(sharingContext, 'Allowed with violations', result.violations);
      }

      return null; // Allow request to continue
    } catch (error) {
      console.error('Content sharing middleware error:', error);
      return NextResponse.json(
        { error: 'Content sharing enforcement failed' },
        { status: 500 }
      );
    }
  }

  /**
   * Check if user can access content
   */
  async checkAccess(
    userId: string,
    contentId: string,
    contentType: string,
    requestedPermissions: string[] = ['view']
  ): Promise<{ allowed: boolean; reason?: string; permissions?: string[] }> {
    try {
      // Get content ownership info
      const contentInfo = await this.getContentInfo(contentId, contentType);
      if (!contentInfo) {
        return { allowed: false, reason: 'Content not found' };
      }

      // Get user institution info
      const userInfo = await this.getUserInstitutionInfo(userId);
      if (!userInfo) {
        return { allowed: false, reason: 'User institution not found' };
      }

      // Check if user is the owner
      if (contentInfo.ownerId === userId) {
        return { allowed: true, permissions: ['view', 'edit', 'share', 'admin'] };
      }

      // Build sharing context
      const context: SharingContext = {
        contentId,
        contentType: contentType as any,
        ownerId: contentInfo.ownerId,
        ownerInstitutionId: contentInfo.ownerInstitutionId,
        ownerDepartmentId: contentInfo.ownerDepartmentId,
        requesterId: userId,
        requesterInstitutionId: userInfo.institutionId,
        requesterDepartmentId: userInfo.departmentId,
        requestedPermissions: requestedPermissions as any,
        targetSharingLevel: this.determineSharingLevel(
          contentInfo.ownerInstitutionId,
          userInfo.institutionId,
          contentInfo.ownerDepartmentId,
          userInfo.departmentId
        )
      };

      const result = await this.enforcement.enforceSharing(context);

      if (!result.allowed) {
        return { allowed: false, reason: result.reason };
      }

      // Check existing permissions
      const existingPermissions = await this.getExistingPermissions(contentId, userId);
      
      return {
        allowed: true,
        permissions: existingPermissions || ['view']
      };
    } catch (error) {
      console.error('Access check error:', error);
      return { allowed: false, reason: 'Access check failed' };
    }
  }

  /**
   * Grant sharing permissions
   */
  async grantPermissions(
    contentId: string,
    contentType: string,
    ownerId: string,
    targetUserId?: string,
    targetInstitutionId?: string,
    targetDepartmentId?: string,
    permissions: string[] = ['view'],
    expiresAt?: Date
  ): Promise<{ success: boolean; permissionId?: string; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('content_sharing_permissions')
        .insert({
          content_id: contentId,
          content_type: contentType,
          owner_id: ownerId,
          shared_with_user_id: targetUserId,
          shared_with_institution_id: targetInstitutionId,
          shared_with_department_id: targetDepartmentId,
          permissions,
          granted_by: ownerId,
          expires_at: expiresAt?.toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      return { success: true, permissionId: data.id };
    } catch (error) {
      console.error('Grant permissions error:', error);
      return { success: false, error: 'Failed to grant permissions' };
    }
  }

  /**
   * Revoke sharing permissions
   */
  async revokePermissions(
    contentId: string,
    targetUserId?: string,
    targetInstitutionId?: string,
    targetDepartmentId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      let query = this.supabase
        .from('content_sharing_permissions')
        .delete()
        .eq('content_id', contentId);

      if (targetUserId) {
        query = query.eq('shared_with_user_id', targetUserId);
      }
      if (targetInstitutionId) {
        query = query.eq('shared_with_institution_id', targetInstitutionId);
      }
      if (targetDepartmentId) {
        query = query.eq('shared_with_department_id', targetDepartmentId);
      }

      const { error } = await query;

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('Revoke permissions error:', error);
      return { success: false, error: 'Failed to revoke permissions' };
    }
  }

  // Helper methods
  private async buildSharingContext(
    userId: string,
    partial: Partial<SharingContext>
  ): Promise<SharingContext | null> {
    try {
      const userInfo = await this.getUserInstitutionInfo(userId);
      if (!userInfo) return null;

      const contentInfo = partial.contentId 
        ? await this.getContentInfo(partial.contentId, partial.contentType || 'assignment')
        : null;

      return {
        contentId: partial.contentId || '',
        contentType: partial.contentType || 'assignment' as any,
        ownerId: contentInfo?.ownerId || partial.ownerId || '',
        ownerInstitutionId: contentInfo?.ownerInstitutionId || partial.ownerInstitutionId || '',
        ownerDepartmentId: contentInfo?.ownerDepartmentId || partial.ownerDepartmentId,
        requesterId: userId,
        requesterInstitutionId: userInfo.institutionId,
        requesterDepartmentId: userInfo.departmentId,
        requestedPermissions: partial.requestedPermissions || ['view'] as any,
        targetSharingLevel: partial.targetSharingLevel || this.determineSharingLevel(
          contentInfo?.ownerInstitutionId || partial.ownerInstitutionId || '',
          userInfo.institutionId,
          contentInfo?.ownerDepartmentId || partial.ownerDepartmentId,
          userInfo.departmentId
        )
      };
    } catch (error) {
      console.error('Build sharing context error:', error);
      return null;
    }
  }

  private async getUserInstitutionInfo(userId: string): Promise<{
    institutionId: string;
    departmentId?: string;
  } | null> {
    const { data, error } = await this.supabase
      .from('user_institutions')
      .select('institution_id, department_id')
      .eq('user_id', userId)
      .single();

    if (error) return null;
    return {
      institutionId: data.institution_id,
      departmentId: data.department_id
    };
  }

  private async getContentInfo(contentId: string, contentType: string): Promise<{
    ownerId: string;
    ownerInstitutionId: string;
    ownerDepartmentId?: string;
  } | null> {
    // This would need to be implemented based on your content storage structure
    // For now, returning a mock implementation
    return {
      ownerId: 'mock-owner',
      ownerInstitutionId: 'mock-institution',
      ownerDepartmentId: 'mock-department'
    };
  }

  private determineSharingLevel(
    ownerInstitutionId: string,
    requesterInstitutionId: string,
    ownerDepartmentId?: string,
    requesterDepartmentId?: string
  ): any {
    if (ownerInstitutionId !== requesterInstitutionId) {
      return 'cross_institution';
    }
    if (ownerDepartmentId !== requesterDepartmentId) {
      return 'institution';
    }
    return 'department';
  }

  private async getExistingPermissions(contentId: string, userId: string): Promise<string[] | null> {
    const { data, error } = await this.supabase
      .from('content_sharing_permissions')
      .select('permissions')
      .eq('content_id', contentId)
      .eq('shared_with_user_id', userId)
      .single();

    if (error) return null;
    return data.permissions;
  }

  private async logAccessAttempt(
    context: SharingContext,
    result: string,
    violations?: string[]
  ): Promise<void> {
    console.log('Content access attempt:', {
      contentId: context.contentId,
      contentType: context.contentType,
      requesterId: context.requesterId,
      result,
      violations
    });
  }
}

// Export singleton instance
export const contentSharingMiddleware = new ContentSharingMiddleware();