import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';

export interface UserRoleData {
  role: string;
  institutionId?: string;
  departmentId?: string;
  onboardingCompleted: boolean;
}

export function useUserRole() {
  const { user } = useAuth();
  const [roleData, setRoleData] = useState<UserRoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserRole = async () => {
    if (!user) {
      setRoleData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = createClient();
      const { data: userData, error: dbError } = await supabase
        .from('users')
        .select('role, institution_id, department_id, onboarding_completed')
        .eq('id', user.id)
        .single();

      if (dbError) {
        console.log('Database not available - role detection failed');
        // No fallback to metadata - require database role
        setError('Database role required but not accessible');
        setRoleData(null);
      } else {
        setRoleData({
          role: userData.role || 'student',
          institutionId: userData.institution_id,
          departmentId: userData.department_id,
          onboardingCompleted: userData.onboarding_completed || false
        });
      }
    } catch (err) {
      console.log('Error fetching user role - database required');
      setRoleData(null);
      setError(err instanceof Error ? err.message : 'Failed to fetch user role');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserRole();
  }, [user]);

  const refreshRole = async () => {
    if (user) {
      await fetchUserRole();
    }
  };

  return {
    roleData,
    loading,
    error,
    refreshRole,
    // Convenience getters
    role: roleData?.role || 'student',
    isTeacher: roleData?.role === 'teacher',
    isStudent: roleData?.role === 'student',
    isAdmin: ['department_admin', 'institution_admin', 'system_admin'].includes(roleData?.role || ''),
    hasRole: (role: string) => roleData?.role === role,
    hasAnyRole: (roles: string[]) => roles.includes(roleData?.role || '')
  };
}