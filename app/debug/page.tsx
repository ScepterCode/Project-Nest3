"use client";

import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { RoleDebug } from '@/components/role-debug';
import { useState, useEffect } from 'react';

export default function DebugPage() {
  const { user, loading, onboardingStatus } = useAuth();
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    const checkDatabase = async () => {
      try {
        const supabase = createClient();
        
        // Test database connection
        const { data: testData, error: testError } = await supabase
          .from('users')
          .select('count')
          .limit(1);
          
        setDbStatus({
          connected: !testError,
          error: testError?.message
        });

        // Get user profile if user exists
        if (user) {
          const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();
            
          setUserProfile({
            data: profile,
            error: profileError?.message
          });
        }
      } catch (error) {
        setDbStatus({
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    };

    checkDatabase();
  }, [user]);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-8">Debug Information</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Authentication Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Authentication Status</h2>
            <div className="space-y-2">
              <div>
                <strong>Loading:</strong> {loading ? 'Yes' : 'No'}
              </div>
              <div>
                <strong>User Authenticated:</strong> {user ? 'Yes' : 'No'}
              </div>
              {user && (
                <>
                  <div>
                    <strong>Email:</strong> {user.email}
                  </div>
                  <div>
                    <strong>User ID:</strong> {user.id}
                  </div>
                  <div>
                    <strong>Email Confirmed:</strong> {user.email_confirmed_at ? 'Yes' : 'No'}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Onboarding Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Onboarding Status</h2>
            <div className="space-y-2">
              <div>
                <strong>Status Available:</strong> {onboardingStatus ? 'Yes' : 'No'}
              </div>
              {onboardingStatus && (
                <>
                  <div>
                    <strong>Completed:</strong> {onboardingStatus.isComplete ? 'Yes' : 'No'}
                  </div>
                  <div>
                    <strong>Needs Onboarding:</strong> {onboardingStatus.needsOnboarding ? 'Yes' : 'No'}
                  </div>
                  <div>
                    <strong>Current Step:</strong> {onboardingStatus.currentStep}
                  </div>
                  <div>
                    <strong>Redirect Path:</strong> {onboardingStatus.redirectPath || 'None'}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Database Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Database Status</h2>
            <div className="space-y-2">
              <div>
                <strong>Connected:</strong> {dbStatus?.connected ? 'Yes' : 'No'}
              </div>
              {dbStatus?.error && (
                <div>
                  <strong>Error:</strong> 
                  <pre className="text-red-600 text-sm mt-1">{dbStatus.error}</pre>
                </div>
              )}
            </div>
          </div>

          {/* User Profile */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">User Profile</h2>
            <div className="space-y-2">
              {userProfile?.error ? (
                <div>
                  <strong>Error:</strong>
                  <pre className="text-red-600 text-sm mt-1">{userProfile.error}</pre>
                </div>
              ) : userProfile?.data ? (
                <div>
                  <strong>Profile Found:</strong>
                  <pre className="text-sm mt-1 bg-gray-100 p-2 rounded overflow-auto">
                    {JSON.stringify(userProfile.data, null, 2)}
                  </pre>
                </div>
              ) : (
                <div>No profile data available</div>
              )}
            </div>
          </div>
        </div>

        {/* Environment Variables */}
        <div className="bg-white rounded-lg shadow p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4">Environment Variables</h2>
          <div className="space-y-2">
            <div>
              <strong>Supabase URL:</strong> {process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Not Set'}
            </div>
            <div>
              <strong>Supabase Anon Key:</strong> {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Not Set'}
            </div>
          </div>
        </div>

        {/* Role Debug */}
        <div className="mt-6">
          <RoleDebug />
        </div>

        {/* Role Assignment Disabled */}
        <div className="mt-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Role Assignment</h3>
            <p className="text-gray-600">
              Role assignment has been disabled. Roles are set during onboarding and cannot be changed through the UI. 
              Contact an administrator if you need a role change.
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-4">
            <button
              onClick={() => window.location.href = '/auth/login'}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mr-2"
            >
              Go to Login
            </button>
            <button
              onClick={() => window.location.href = '/onboarding'}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 mr-2"
            >
              Go to Onboarding
            </button>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 mr-2"
            >
              Go to Dashboard
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}