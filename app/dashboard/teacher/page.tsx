'use client';

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import DashboardHeader from '../components/dashboardheader';

export default function TeacherDashboard() {
  const { user, loading, getUserDisplayName } = useAuth();
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
      <DashboardHeader text="Teacher" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Welcome, {getUserDisplayName()}!
          </h2>
          <p className="text-gray-600 mb-6">
            You are logged in as a teacher. This is your dashboard where you
            can:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={() => router.push('/dashboard/teacher/classes')}
              className="p-6 text-left border rounded-lg hover:shadow-md transition-all duration-200 bg-white hover:border-blue-300 hover:bg-blue-50"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-xl">🏫</span>
                </div>
                <h3 className="font-semibold text-lg">My Classes</h3>
              </div>
              <p className="text-gray-600 text-sm">
                View and manage all your classes
              </p>
            </button>

            <button
              onClick={() => router.push('/dashboard/teacher/classes/create')}
              className="p-6 text-left border rounded-lg hover:shadow-md transition-all duration-200 bg-white hover:border-green-300 hover:bg-green-50"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-xl">➕</span>
                </div>
                <h3 className="font-semibold text-lg">Create Class</h3>
              </div>
              <p className="text-gray-600 text-sm">
                Start a new class for your students
              </p>
            </button>

            <button
              onClick={() => router.push('/dashboard/teacher/assignments')}
              className="p-6 text-left border rounded-lg hover:shadow-md transition-all duration-200 bg-white hover:border-purple-300 hover:bg-purple-50"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <span className="text-xl">📋</span>
                </div>
                <h3 className="font-semibold text-lg">Assignments</h3>
              </div>
              <p className="text-gray-600 text-sm">
                Create and manage assignments
              </p>
            </button>

            <button
              onClick={() => router.push('/dashboard/teacher/analytics')}
              className="p-6 text-left border rounded-lg hover:shadow-md transition-all duration-200 bg-white hover:border-orange-300 hover:bg-orange-50"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <span className="text-xl">📊</span>
                </div>
                <h3 className="font-semibold text-lg">Analytics</h3>
              </div>
              <p className="text-gray-600 text-sm">
                View class performance and insights
              </p>
            </button>

            <button
              onClick={() => router.push('/dashboard/teacher/rubrics')}
              className="p-6 text-left border rounded-lg hover:shadow-md transition-all duration-200 bg-white hover:border-indigo-300 hover:bg-indigo-50"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <span className="text-xl">📏</span>
                </div>
                <h3 className="font-semibold text-lg">Rubrics</h3>
              </div>
              <p className="text-gray-600 text-sm">
                Create and manage grading rubrics
              </p>
            </button>

            <button
              onClick={() => router.push('/dashboard/teacher/peer-reviews')}
              className="p-6 text-left border rounded-lg hover:shadow-md transition-all duration-200 bg-white hover:border-teal-300 hover:bg-teal-50"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                  <span className="text-xl">👥</span>
                </div>
                <h3 className="font-semibold text-lg">Peer Reviews</h3>
              </div>
              <p className="text-gray-600 text-sm">
                Manage peer review assignments
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
