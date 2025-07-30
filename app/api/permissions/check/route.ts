import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PermissionChecker } from '@/lib/services/permission-checker';

interface PermissionCheckRequest {
  permissions: string[];
  resourceId?: string;
  action?: string;
  context?: {
    institutionId?: string;
    departmentId?: string;
    [key: string]: any;
  };
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

    const body: PermissionCheckRequest = await request.json();
    
    // Validate request structure
    if (!body.permissions || !Array.isArray(body.permissions)) {
      return NextResponse.json(
        { error: 'Invalid request: permissions array is required' },
        { status: 400 }
      );
    }

    if (body.permissions.length === 0) {
      return NextResponse.json(
        { error: 'At least one permission must be specified' },
        { status: 400 }
      );
    }

    if (body.permissions.length > 100) {
      return NextResponse.json(
        { error: 'Too many permissions to check. Maximum allowed: 100' },
        { status: 400 }
      );
    }

    // Initialize permission checker
    const permissionChecker = new PermissionChecker();

    // Check permissions
    const results = await Promise.all(
      body.permissions.map(async (permissionName) => {
        try {
          let hasPermission = false;

          if (body.resourceId && body.action) {
            // Check resource-specific permission
            hasPermission = await permissionChecker.canAccessResource(
              user.id,
              body.resourceId,
              body.action as any
            );
          } else {
            // Check general permission
            hasPermission = await permissionChecker.hasPermission(
              user.id,
              { name: permissionName } as any
            );
          }

          return {
            permission: permissionName,
            granted: hasPermission,
            context: body.context || {}
          };
        } catch (error) {
          console.error(`Error checking permission ${permissionName}:`, error);
          return {
            permission: permissionName,
            granted: false,
            error: error instanceof Error ? error.message : 'Permission check failed',
            context: body.context || {}
          };
        }
      })
    );

    // Calculate summary
    const summary = {
      total: results.length,
      granted: results.filter(r => r.granted).length,
      denied: results.filter(r => !r.granted).length,
      errors: results.filter(r => r.error).length
    };

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        results,
        summary,
        checkedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Permission check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const permission = searchParams.get('permission');
    const resourceId = searchParams.get('resourceId');
    const action = searchParams.get('action');

    if (!permission) {
      return NextResponse.json(
        { error: 'Permission parameter is required' },
        { status: 400 }
      );
    }

    // Initialize permission checker
    const permissionChecker = new PermissionChecker();

    let hasPermission = false;

    if (resourceId && action) {
      // Check resource-specific permission
      hasPermission = await permissionChecker.canAccessResource(
        user.id,
        resourceId,
        action as any
      );
    } else {
      // Check general permission
      hasPermission = await permissionChecker.hasPermission(
        user.id,
        { name: permission } as any
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        permission,
        granted: hasPermission,
        resourceId,
        action,
        checkedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Permission check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}