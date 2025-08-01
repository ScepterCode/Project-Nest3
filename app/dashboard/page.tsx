"use client";

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
          <h2 className="text-xl font-semibold mb-4">Welcome, {user.email}!</h2>
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