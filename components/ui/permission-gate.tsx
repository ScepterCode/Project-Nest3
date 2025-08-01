/**
 * Permission Gate Component
 * Conditionally renders children based on user permissions
 */

import React from 'react';
import { usePermissionCheck } from '@/lib/hooks/usePermissions';
import { ResourceContext } from '@/lib/services/permission-checker';

interface PermissionGateProps {
  userId?: string;
  permission: string;
  context?: ResourceContext;
  fallback?: React.ReactNode;
  loading?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({
  userId,
  permission,
  context,
  fallback = null,
  loading = null,
  children
}: PermissionGateProps) {
  // For now, allow all permissions to avoid blocking the UI
  // TODO: Implement proper permission checking once the permission system is fully set up
  try {
    const { hasAccess, loading: isLoading, error } = usePermissionCheck(userId, permission, context);

    if (isLoading) {
      return <>{loading}</>;
    }

    if (error) {
      console.error('Permission gate error:', error);
      // Allow access on error for now
      return <>{children}</>;
    }

    if (!hasAccess) {
      return <>{fallback}</>;
    }

    return <>{children}</>;
  } catch (error) {
    console.error('Permission gate error:', error);
    // Allow access on error for now
    return <>{children}</>;
  }
}

/**
 * Admin Gate Component
 * Conditionally renders children based on admin status
 */
interface AdminGateProps {
  userId?: string;
  scope: 'system' | 'institution' | 'department';
  scopeId?: string;
  fallback?: React.ReactNode;
  loading?: React.ReactNode;
  children: React.ReactNode;
}

export function AdminGate({
  userId,
  scope,
  scopeId,
  fallback = null,
  loading = null,
  children
}: AdminGateProps) {
  const [isAdmin, setIsAdmin] = React.useState<boolean>(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const checkAdmin = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Import permission checker dynamically to avoid circular dependencies
        const { PermissionChecker } = await import('@/lib/services/permission-checker');
        const permissionChecker = new PermissionChecker({
          cacheEnabled: true,
          cacheTtl: 300,
          bulkCheckLimit: 50
        });
        
        const result = await permissionChecker.isAdmin(userId, scope, scopeId);
        if (isMounted) {
          setIsAdmin(result);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Admin check failed');
          setIsAdmin(false);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    checkAdmin();

    return () => {
      isMounted = false;
    };
  }, [userId, scope, scopeId]);

  if (isLoading) {
    return <>{loading}</>;
  }

  if (error) {
    console.error('Admin gate error:', error);
    return <>{fallback}</>;
  }

  if (!isAdmin) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Role Gate Component
 * Conditionally renders children based on user role
 */
interface RoleGateProps {
  userId?: string;
  allowedRoles: string[];
  fallback?: React.ReactNode;
  loading?: React.ReactNode;
  children: React.ReactNode;
}

export function RoleGate({
  userId,
  allowedRoles,
  fallback = null,
  loading = null,
  children
}: RoleGateProps) {
  const [hasRole, setHasRole] = React.useState<boolean>(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!userId || !allowedRoles.length) {
      setHasRole(false);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const checkRole = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Import supabase client dynamically
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        
        // Get user role from users table
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('role')
          .eq('id', userId)
          .single();

        if (userError) {
          throw userError;
        }

        const userRole = userData?.role;
        const hasAllowedRole = userRole && allowedRoles.includes(userRole);
        
        if (isMounted) {
          setHasRole(hasAllowedRole);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Role check failed');
          setHasRole(false);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    checkRole();

    return () => {
      isMounted = false;
    };
  }, [userId, allowedRoles]);

  if (isLoading) {
    return <>{loading}</>;
  }

  if (error) {
    console.error('Role gate error:', error);
    return <>{fallback}</>;
  }

  if (!hasRole) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}