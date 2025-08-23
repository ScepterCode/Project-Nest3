import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UserRole } from '@/lib/types/role-management';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const scope = searchParams.get('scope');
    const roleType = searchParams.get('role');

    // Build query for permissions
    let permissionsQuery = supabase
      .from('permissions')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (category) {
      permissionsQuery = permissionsQuery.eq('category', category);
    }

    if (scope) {
      permissionsQuery = permissionsQuery.eq('scope', scope);
    }

    const { data: permissions, error: permissionsError } = await permissionsQuery;

    if (permissionsError) {
      console.error('Error fetching permissions:', permissionsError);
      return NextResponse.json(
        { error: 'Failed to fetch permissions' },
        { status: 500 }
      );
    }

    // If role type is specified, get role-specific permissions
    let rolePermissions = null;
    if (roleType && Object.values(UserRole).includes(roleType as UserRole)) {
      const { data: rolePerms, error: rolePermsError } = await supabase
        .from('role_permissions')
        .select(`
          permission_id,
          conditions,
          permissions (
            id,
            name,
            description,
            category,
            scope
          )
        `)
        .eq('role', roleType);

      if (!rolePermsError && rolePerms) {
        rolePermissions = rolePerms.map(rp => ({
          ...rp.permissions,
          conditions: rp.conditions
        }));
      }
    }

    // Group permissions by category
    const permissionsByCategory = permissions?.reduce((acc, permission) => {
      if (!acc[permission.category]) {
        acc[permission.category] = [];
      }
      acc[permission.category].push(permission);
      return acc;
    }, {} as Record<string, any[]>) || {};

    // Get permission categories
    const categories = permissions?.reduce((acc, permission) => {
      if (!acc.includes(permission.category)) {
        acc.push(permission.category);
      }
      return acc;
    }, [] as string[]) || [];

    // Get permission scopes
    const scopes = permissions?.reduce((acc, permission) => {
      if (!acc.includes(permission.scope)) {
        acc.push(permission.scope);
      }
      return acc;
    }, [] as string[]) || [];

    return NextResponse.json({
      success: true,
      data: {
        permissions: permissions || [],
        rolePermissions,
        byCategory: permissionsByCategory,
        metadata: {
          total: permissions?.length || 0,
          categories,
          scopes,
          requestedRole: roleType
        }
      }
    });

  } catch (error) {
    console.error('Get permissions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}