'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { DatabaseStatusBanner } from '@/components/database-status-banner';
import { RoleGate } from '@/components/ui/permission-gate';

interface InstitutionStats {
  totalUsers: number;
  totalTeachers: number;
  totalStudents: number;
  totalAdmins: number;
  totalClasses: number;
  totalAssignments: number;
  totalSubmissions: number;
}

export default function InstitutionReportsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [institutionStats, setInstitutionStats] = useState<InstitutionStats>({
    totalUsers: 0,
    totalTeachers: 0,
    totalStudents: 0,
    totalAdmins: 0,
    totalClasses: 0,
    totalAssignments: 0,
    totalSubmissions: 0,
  });

  useEffect(() => {
    if (user) {
      fetchReportsData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchReportsData = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Counts only (no rows transferred). RLS scopes every count to the
      // admin's own institution.
      const members = () =>
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .not('institution_id', 'is', null);
      const [all, teachers, students, admins, classes, assignments] =
        await Promise.all([
          members(),
          members().eq('role', 'teacher'),
          members().eq('role', 'student'),
          members().eq('role', 'institution_admin'),
          supabase.from('classes').select('id', { count: 'exact', head: true }),
          supabase
            .from('assignments')
            .select('id', { count: 'exact', head: true }),
        ]);

      const failed = [
        all,
        teachers,
        students,
        admins,
        classes,
        assignments,
      ].find(r => r.error);
      if (failed) {
        console.error('Error loading institution counts:', failed.error);
        setError('Failed to load reports data');
      }

      setInstitutionStats({
        totalUsers: all.count ?? 0,
        totalTeachers: teachers.count ?? 0,
        totalStudents: students.count ?? 0,
        totalAdmins: admins.count ?? 0,
        totalClasses: classes.count ?? 0,
        totalAssignments: assignments.count ?? 0,
        // Institution admins can't read submissions (they're private to
        // students and their teachers), so this isn't reported here.
        totalSubmissions: 0,
      });
    } catch (error) {
      console.error('Error fetching reports data:', error);
      setError('Failed to load reports data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (user) {
      fetchReportsData();
    }
  };

  if (loading) {
    return (
      <RoleGate userId={user?.id ?? ''} allowedRoles={['institution_admin']}>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
          <DatabaseStatusBanner />
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          </div>
        </div>
      </RoleGate>
    );
  }

  if (error) {
    return (
      <RoleGate userId={user?.id ?? ''} allowedRoles={['institution_admin']}>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
          <DatabaseStatusBanner />
          <div className="max-w-7xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-red-800 mb-2">
                Error Loading Reports
              </h2>
              <p className="text-red-700 mb-4">{error}</p>
              <Button onClick={handleRefresh} variant="outline">
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </RoleGate>
    );
  }

  return (
    <RoleGate userId={user?.id ?? ''} allowedRoles={['institution_admin']}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <DatabaseStatusBanner />
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Institution Reports</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Comprehensive analytics and insights for your institution
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline" onClick={handleRefresh}>
                Refresh Data
              </Button>
              <Button variant="outline">Export Report</Button>
            </div>
          </div>

          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Total Users
                  </p>
                  <p className="text-2xl font-bold">
                    {institutionStats.totalUsers}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Teachers</p>
                  <p className="text-2xl font-bold">
                    {institutionStats.totalTeachers}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Students</p>
                  <p className="text-2xl font-bold">
                    {institutionStats.totalStudents}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Admins</p>
                  <p className="text-2xl font-bold">
                    {institutionStats.totalAdmins}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Success Message */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-green-800 mb-2">
              ✅ Reports Page Working!
            </h2>
            <p className="text-green-700">
              The reports page is now loading successfully with real data from
              the database. Check the debug info above to see the current state
              and user information.
            </p>
          </div>
        </div>
      </div>
    </RoleGate>
  );
}
