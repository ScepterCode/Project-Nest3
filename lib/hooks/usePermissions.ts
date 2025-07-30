/**
 * React hook for permission checking
 * Provides easy access to permission checking functionality in components
 */

import { useEffect, useState, useCallback } from 'react';
import { PermissionChecker, Action, ResourceContext } from '../services/permission-checker';
import { Permission } from '../types/role-management';

const permissionChecker = new PermissionChecker({
  cacheEnabled: true,
  cacheTtl: 300, // 5 minutes
  bulkCheckLimit: 50
});

export interface UsePermissionsReturn {
  hasPermission: (permission: string, context?: ResourceContext) => Promise<boolean>;
  canAccessResource: (resourceId: string, action: Action, context?: Partial<ResourceContext>) => Promise<boolean>;
  isAdmin: (scope: 'system' | 'institution' | 'department', scopeId?: string) => Promise<boolean>;
  getUserPermissions: () => Promise<Permission[]>;
  loading: boolean;
  error: string | null;
}

export function usePermissions(userId?: string): UsePermissionsReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPermission = useCallback(async (
    permission: string, 
    context?: ResourceContext
  ): Promise<boolean> => {
    if (!userId) return false;
    
    try {
      setError(null);
      return await permissionChecker.hasPermission(userId, permission, context);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Permission check failed');
      return false;
    }
  }, [userId]);

  const canAccessResource = useCallback(async (
    resourceId: string,
    action: Action,
    context?: Partial<ResourceContext>
  ): Promise<boolean> => {
    if (!userId) return false;
    
    try {
      setError(null);
      return await permissionChecker.canAccessResource(userId, resourceId, action, context);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resource access check failed');
      return false;
    }
  }, [userId]);

  const isAdmin = useCallback(async (
    scope: 'system' | 'institution' | 'department',
    scopeId?: string
  ): Promise<boolean> => {
    if (!userId) return false;
    
    try {
      setError(null);
      return await permissionChecker.isAdmin(userId, scope, scopeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin check failed');
      return false;
    }
  }, [userId]);

  const getUserPermissions = useCallback(async (): Promise<Permission[]> => {
    if (!userId) return [];
    
    try {
      setLoading(true);
      setError(null);
      return await permissionChecker.getUserPermissions(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get user permissions');
      return [];
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return {
    hasPermission,
    canAccessResource,
    isAdmin,
    getUserPermissions,
    loading,
    error
  };
}

/**
 * Hook for checking a single permission with loading state
 */
export function usePermissionCheck(
  userId: string | undefined,
  permission: string,
  context?: ResourceContext
) {
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !permission) {
      setHasAccess(false);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const checkPermission = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await permissionChecker.hasPermission(userId, permission, context);
        if (isMounted) {
          setHasAccess(result);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Permission check failed');
          setHasAccess(false);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkPermission();

    return () => {
      isMounted = false;
    };
  }, [userId, permission, context]);

  return { hasAccess, loading, error };
}

/**
 * Hook for checking multiple permissions at once
 */
export function useBulkPermissionCheck(
  userId: string | undefined,
  permissions: Array<{ permission: string; context?: ResourceContext }>
) {
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !permissions.length) {
      setResults({});
      setLoading(false);
      return;
    }

    let isMounted = true;

    const checkPermissions = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const permissionResults = await permissionChecker.checkBulkPermissions(
          userId,
          permissions
        );

        if (isMounted) {
          const resultMap: Record<string, boolean> = {};
          permissionResults.forEach((result) => {
            resultMap[result.permission] = result.granted;
          });
          setResults(resultMap);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Bulk permission check failed');
          setResults({});
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkPermissions();

    return () => {
      isMounted = false;
    };
  }, [userId, permissions]);

  return { results, loading, error };
}