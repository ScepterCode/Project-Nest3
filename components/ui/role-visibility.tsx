/**
 * Role-based Visibility Components
 * Provides components for showing/hiding UI elements based on user roles and permissions
 */

import React from 'react';
import {
  usePermissionCheck,
  useBulkPermissionCheck,
} from '@/lib/hooks/usePermissions';
import { ResourceContext } from '@/lib/services/permission-checker';

interface ConditionalRenderProps {
  condition: boolean;
  loading?: React.ReactNode;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Base conditional render component
 */
function ConditionalRender({
  condition,
  loading,
  fallback = null,
  children,
}: ConditionalRenderProps) {
  if (loading !== undefined) {
    return <>{loading}</>;
  }

  return condition ? <>{children}</> : <>{fallback}</>;
}

/**
 * Show content only if user has specific permission
 */
interface ShowIfPermissionProps {
  userId?: string;
  permission: string;
  context?: ResourceContext;
  loading?: React.ReactNode;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function ShowIfPermission({
  userId,
  permission,
  context,
  loading,
  fallback = null,
  children,
}: ShowIfPermissionProps) {
  const {
    hasAccess,
    loading: isLoading,
    error,
  } = usePermissionCheck(userId, permission, context);

  if (error) {
    console.error('ShowIfPermission error:', error);
    return <>{fallback}</>;
  }

  return (
    <ConditionalRender
      condition={hasAccess}
      loading={isLoading ? loading : undefined}
      fallback={fallback}
    >
      {children}
    </ConditionalRender>
  );
}

/**
 * Hide content if user has specific permission
 */
interface HideIfPermissionProps {
  userId?: string;
  permission: string;
  context?: ResourceContext;
  loading?: React.ReactNode;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function HideIfPermission({
  userId,
  permission,
  context,
  loading,
  fallback = null,
  children,
}: HideIfPermissionProps) {
  const {
    hasAccess,
    loading: isLoading,
    error,
  } = usePermissionCheck(userId, permission, context);

  if (error) {
    console.error('HideIfPermission error:', error);
    return <>{children}</>;
  }

  return (
    <ConditionalRender
      condition={!hasAccess}
      loading={isLoading ? loading : undefined}
      fallback={fallback}
    >
      {children}
    </ConditionalRender>
  );
}

/**
 * Show content only if user has ANY of the specified permissions
 */
interface ShowIfAnyPermissionProps {
  userId?: string;
  permissions: Array<{ permission: string; context?: ResourceContext }>;
  loading?: React.ReactNode;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function ShowIfAnyPermission({
  userId,
  permissions,
  loading,
  fallback = null,
  children,
}: ShowIfAnyPermissionProps) {
  const {
    results,
    loading: isLoading,
    error,
  } = useBulkPermissionCheck(userId, permissions);

  if (error) {
    console.error('ShowIfAnyPermission error:', error);
    return <>{fallback}</>;
  }

  const hasAnyPermission = Object.values(results).some(granted => granted);

  return (
    <ConditionalRender
      condition={hasAnyPermission}
      loading={isLoading ? loading : undefined}
      fallback={fallback}
    >
      {children}
    </ConditionalRender>
  );
}

/**
 * Show content only if user has ALL of the specified permissions
 */
interface ShowIfAllPermissionsProps {
  userId?: string;
  permissions: Array<{ permission: string; context?: ResourceContext }>;
  loading?: React.ReactNode;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function ShowIfAllPermissions({
  userId,
  permissions,
  loading,
  fallback = null,
  children,
}: ShowIfAllPermissionsProps) {
  const {
    results,
    loading: isLoading,
    error,
  } = useBulkPermissionCheck(userId, permissions);

  if (error) {
    console.error('ShowIfAllPermissions error:', error);
    return <>{fallback}</>;
  }

  const hasAllPermissions =
    permissions.length > 0 &&
    permissions.every(p => results[p.permission] === true);

  return (
    <ConditionalRender
      condition={hasAllPermissions}
      loading={isLoading ? loading : undefined}
      fallback={fallback}
    >
      {children}
    </ConditionalRender>
  );
}

/**
 * Show different content based on user's highest role
 */
interface RoleBasedContentProps {
  userId?: string;
  roleContent: Record<string, React.ReactNode>;
  defaultContent?: React.ReactNode;
  loading?: React.ReactNode;
}

export function RoleBasedContent({
  userId,
  roleContent,
  defaultContent = null,
  loading,
}: RoleBasedContentProps) {
  const [userRoles, setUserRoles] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!userId) {
      setUserRoles([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const fetchUserRoles = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();

        const { data: roleAssignments, error: rolesError } = await supabase
          .from('user_role_assignments')
          .select('role')
          .eq('user_id', userId)
          .eq('status', 'active')
          .gte('expires_at', new Date().toISOString())
          .or('expires_at.is.null');

        if (rolesError) {
          throw rolesError;
        }

        const roles = (roleAssignments || []).map(ra => ra.role);

        if (isMounted) {
          setUserRoles(roles);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to fetch user roles'
          );
          setUserRoles([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchUserRoles();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  if (isLoading) {
    return <>{loading}</>;
  }

  if (error) {
    console.error('RoleBasedContent error:', error);
    return <>{defaultContent}</>;
  }

  // Role hierarchy for determining highest role
  const roleHierarchy = {
    system_admin: 5,
    institution_admin: 4,
    department_admin: 3,
    teacher: 2,
    student: 1,
  };

  // Find the highest role
  const highestRole = userRoles.reduce((highest, current) => {
    const currentWeight =
      roleHierarchy[current as keyof typeof roleHierarchy] || 0;
    const highestWeight =
      roleHierarchy[highest as keyof typeof roleHierarchy] || 0;
    return currentWeight > highestWeight ? current : highest;
  }, '');

  // Return content for the highest role, or check for any matching role
  if (highestRole && roleContent[highestRole]) {
    return <>{roleContent[highestRole]}</>;
  }

  // Check if any of the user's roles have content
  for (const role of userRoles) {
    if (roleContent[role]) {
      return <>{roleContent[role]}</>;
    }
  }

  return <>{defaultContent}</>;
}

/**
 * Wrapper component that applies role-based styling
 */
interface RoleStyledProps {
  userId?: string;
  roleStyles: Record<string, string>;
  defaultStyle?: string;
  children: React.ReactNode;
}

export function RoleStyled({
  userId,
  roleStyles,
  defaultStyle = '',
  children,
}: RoleStyledProps) {
  const [appliedStyle, setAppliedStyle] = React.useState(defaultStyle);

  React.useEffect(() => {
    if (!userId) {
      setAppliedStyle(defaultStyle);
      return;
    }

    let isMounted = true;

    const fetchUserRoles = async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();

        const { data: roleAssignments, error } = await supabase
          .from('user_role_assignments')
          .select('role')
          .eq('user_id', userId)
          .eq('status', 'active')
          .gte('expires_at', new Date().toISOString())
          .or('expires_at.is.null');

        if (error || !roleAssignments) {
          if (isMounted) setAppliedStyle(defaultStyle);
          return;
        }

        const roles = roleAssignments.map(ra => ra.role);

        // Apply style for the first matching role
        for (const role of roles) {
          if (roleStyles[role]) {
            if (isMounted) setAppliedStyle(roleStyles[role]);
            return;
          }
        }

        if (isMounted) setAppliedStyle(defaultStyle);
      } catch (error) {
        console.error('RoleStyled error:', error);
        if (isMounted) setAppliedStyle(defaultStyle);
      }
    };

    fetchUserRoles();

    return () => {
      isMounted = false;
    };
  }, [userId, roleStyles, defaultStyle]);

  return <div className={appliedStyle}>{children}</div>;
}

/**
 * Button that's only enabled if user has permission
 */
interface PermissionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  userId?: string;
  permission: string;
  context?: ResourceContext;
  disabledMessage?: string;
  children: React.ReactNode;
}

export function PermissionButton({
  userId,
  permission,
  context,
  disabledMessage = 'You do not have permission to perform this action',
  children,
  ...buttonProps
}: PermissionButtonProps) {
  const { hasAccess, loading, error } = usePermissionCheck(
    userId,
    permission,
    context
  );

  const isDisabled = loading || error || !hasAccess || buttonProps.disabled;

  return (
    <button
      {...buttonProps}
      disabled={isDisabled as boolean}
      title={!hasAccess ? disabledMessage : buttonProps.title}
    >
      {children}
    </button>
  );
}
