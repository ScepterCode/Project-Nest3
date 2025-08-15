"use client";

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function Dashboard() {
  const { user, loading, getUserDisplayName, logout } = useAuth();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
      return;
    }

    // CRITICAL SECURITY FIX: Role-based routing
    if (user && !loading && !redirecting) {
      setRedirecting(true);
      
      const redirectToRoleDashboard = async () => {
        try {
          const supabase = createClient();
          
          // Get user role from database (not cached)
          const { data: profile, error } = await supabase
            .from('users')
            .select('role, email')
            .eq('id', user.id)
            .single();

          if (error || !profile) {
            console.error('SECURITY: Cannot determine user role, forcing logout');
            await logout();
            return;
          }

          console.log('Dashboard: Redirecting user', profile.email, 'to', profile.role, 'dashboard');

          // Redirect based on role
          switch (profile.role) {
            case 'student':
              router.replace('/dashboard/student');
              break;
            case 'teacher':
              router.replace('/dashboard/teacher');
              break;
            case 'institution_admin':
              router.replace('/dashboard/institution');
              break;
            default:
              console.error('SECURITY: Unknown role', profile.role, 'forcing logout');
              await logout();
          }
        } catch (error) {
          console.error('SECURITY: Error determining user role, forcing logout:', error);
          await logout();
        }
      };

      redirectToRoleDashboard();
    }
  }, [user, loading, router, logout, redirecting]);

  if (loading || redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Redirecting to your dashboard...</span>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <button
              onClick={async () => {
                const { logout } = await import('@/contexts/auth-context');
                await logout();
                router.push('/');
              }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Welcome, {getUserDisplayName()}!</h2>
          <p className="text-gray-600 mb-6">
            Welcome to your dashboard. Choose your role to get started:
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button
              onClick={() => router.push('/dashboard/student')}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="flex items-center">
                <div className="text-3xl mr-4">👨‍🎓</div>
                <div>
                  <h3 className="font-semibold">Student Dashboard</h3>
                  <p className="text-gray-600 text-sm">Access classes, assignments, and grades</p>
                </div>
              </div>
            </button>
            
            <button
              onClick={() => router.push('/dashboard/teacher')}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="flex items-center">
                <div className="text-3xl mr-4">👨‍🏫</div>
                <div>
                  <h3 className="font-semibold">Teacher Dashboard</h3>
                  <p className="text-gray-600 text-sm">Manage classes, create assignments</p>
                </div>
              </div>
            </button>
          </div>

          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-800 mb-2">💡 Getting Started</h3>
            <p className="text-blue-700 text-sm">
              Select the dashboard that matches your role to access the appropriate features and tools.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}