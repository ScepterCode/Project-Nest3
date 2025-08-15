"use client";

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { StudentOnboarding } from '@/components/onboarding/student-onboarding';
import { TeacherOnboarding } from '@/components/onboarding/teacher-onboarding';
import { InstitutionAdminOnboarding } from '@/components/onboarding/institution-admin-onboarding';
import { Button } from '@/components/ui/button';

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loadingUserData, setLoadingUserData] = useState(true);

  useEffect(() => {
    setMounted(true);
    
    // Add a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (loading) {
        setDebugInfo('Loading timeout - forcing continue');
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [loading]);

  // Load user role from database or user metadata
  useEffect(() => {
    const loadUserRole = async () => {
      if (!user) {
        setLoadingUserData(false);
        return;
      }

      try {
        const supabase = createClient();
        
        // First try to get role from database
        const { data: userData, error } = await supabase
          .from('users')
          .select('role, first_name, last_name')
          .eq('id', user.id)
          .single();

        if (userData && userData.role) {
          setUserRole(userData.role);
        } else {
          // Fallback to user metadata from registration
          const roleFromMetadata = user.user_metadata?.role;
          if (roleFromMetadata) {
            // Map 'institution' to 'institution_admin' for consistency
            const mappedRole = roleFromMetadata === 'institution' ? 'institution_admin' : roleFromMetadata;
            setUserRole(mappedRole);
          }
        }
      } catch (error) {
        console.error('Error loading user role:', error);
        // Fallback to user metadata
        const roleFromMetadata = user.user_metadata?.role;
        if (roleFromMetadata) {
          const mappedRole = roleFromMetadata === 'institution' ? 'institution_admin' : roleFromMetadata;
          setUserRole(mappedRole);
        }
      } finally {
        setLoadingUserData(false);
      }
    };

    if (user) {
      loadUserRole();
    }
  }, [user]);

  // Debug logging
  useEffect(() => {
    const debugData = {
      mounted,
      user: !!user,
      userEmail: user?.email,
      userId: user?.id,
      loading,
      timestamp: new Date().toISOString()
    };
    console.log('Onboarding Debug:', debugData);
    setDebugInfo(JSON.stringify(debugData, null, 2));
  }, [mounted, user, loading]);

  const handleOnboardingComplete = async (onboardingData: any) => {
    if (!user) {
      alert('No user found. Please refresh and try again.');
      return;
    }
    
    if (!userRole) {
      alert('Unable to determine your role. Please contact support.');
      return;
    }

    setSaving(true);
    console.log('Completing onboarding for user:', user.id, 'role:', userRole, 'data:', onboardingData);
    
    try {
      const supabase = createClient();
      
      // Check if user already has onboarding completed
      const { data: existingUser } = await supabase
        .from('users')
        .select('role, onboarding_completed')
        .eq('id', user.id)
        .single();

      if (existingUser && existingUser.onboarding_completed) {
        alert('Your onboarding has already been completed. Redirecting to dashboard.');
        const dashboardPath = userRole === 'student' ? '/dashboard/student' : 
                             userRole === 'teacher' ? '/dashboard/teacher' : 
                             userRole === 'institution_admin' ? '/dashboard/institution' :
                             '/dashboard';
        router.push(dashboardPath);
        return;
      }

      // Complete onboarding with user data (role should already be set from registration)
      const { error: updateError } = await supabase
        .from('users')
        .upsert({ 
          id: user.id,
          email: user.email || '',
          role: userRole, // Use the role from registration
          onboarding_completed: true,
          first_name: onboardingData.firstName || user.user_metadata?.first_name || '',
          last_name: onboardingData.lastName || user.user_metadata?.last_name || '',
          // Store additional onboarding data in metadata
          onboarding_data: onboardingData
        }, {
          onConflict: 'id'
        });

      if (updateError) {
        console.error('Error completing onboarding:', {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code,
          fullError: updateError
        });
        alert(`Failed to complete onboarding: ${updateError.message}`);
        return;
      }
      
      console.log('Onboarding completed for role:', userRole);

      // Set flag to show completion message briefly
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('onboarding-just-completed', 'true');
      }

      // Redirect to appropriate dashboard
      const dashboardPath = userRole === 'student' ? '/dashboard/student' : 
                           userRole === 'teacher' ? '/dashboard/teacher' : 
                           userRole === 'institution_admin' ? '/dashboard/institution' :
                           '/dashboard';
      
      console.log('Redirecting to:', dashboardPath);
      router.push(dashboardPath);
    } catch (error) {
      console.error('Error completing onboarding:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        fullError: error
      });
      alert(`Something went wrong: ${error instanceof Error ? error.message : error}`);
    } finally {
      setSaving(false);
    }
  };



  // Debug: Show what's happening
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Mounting component...</div>
      </div>
    );
  }

  if ((loading || loadingUserData) && !debugInfo.includes('timeout')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div>Loading user authentication...</div>
          <div className="text-sm text-gray-500 mt-2">
            Debug: mounted={mounted.toString()}, loading={loading.toString()}, user={user ? 'exists' : 'null'}
          </div>
          <button 
            onClick={() => setDebugInfo('timeout-forced')}
            className="mt-4 px-4 py-2 bg-gray-600 text-white rounded text-sm"
          >
            Skip Loading (Debug)
          </button>
          <pre className="text-xs text-left mt-4 bg-gray-100 p-2 rounded overflow-auto max-h-32">
            {debugInfo}
          </pre>
        </div>
      </div>
    );
  }

  if (!user && !debugInfo.includes('timeout')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold mb-4">Please Log In</h2>
          <p className="mb-4">You need to be logged in to access onboarding.</p>
          <button 
            onClick={() => router.push('/auth/login')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mr-2"
          >
            Go to Login
          </button>
          <button 
            onClick={async () => {
              // Test Supabase connection
              try {
                const supabase = createClient();
                const { data, error } = await supabase.from('users').select('count').limit(1);
                alert(`Supabase test: ${error ? 'Error: ' + error.message : 'Success: ' + JSON.stringify(data)}`);
              } catch (err) {
                alert('Supabase connection failed: ' + err);
              }
            }}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Test DB
          </button>
          <pre className="text-xs text-left mt-4 bg-gray-100 p-2 rounded overflow-auto max-h-32">
            {debugInfo}
          </pre>
        </div>
      </div>
    );
  }

  // Show role-specific onboarding based on user's registered role
  if (userRole && !loadingUserData) {
    const userName = user?.user_metadata?.first_name || user?.user_metadata?.last_name || 'there';
    
    switch (userRole) {
      case 'student':
        return (
          <StudentOnboarding
            onComplete={handleOnboardingComplete}
            userName={userName}
          />
        );
      case 'teacher':
        return (
          <TeacherOnboarding
            onComplete={handleOnboardingComplete}
            userName={userName}
          />
        );
      case 'institution_admin':
        return (
          <InstitutionAdminOnboarding
            onComplete={handleOnboardingComplete}
            userName={userName}
          />
        );
      default:
        return (
          <div className="min-h-screen bg-gray-50 py-12">
            <div className="max-w-2xl mx-auto px-4">
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <h1 className="text-2xl font-bold mb-4">Unknown Role</h1>
                <p className="text-gray-600 mb-4">
                  We couldn't determine your role. Please contact support.
                </p>
                <p className="text-sm text-gray-500">Role detected: {userRole}</p>
              </div>
            </div>
          </div>
        );
    }
  }

  // Show loading or error state
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow p-8 text-center">
          {loadingUserData ? (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <h1 className="text-2xl font-bold mb-2">Setting up your onboarding...</h1>
              <p className="text-gray-600">Please wait while we prepare your personalized setup.</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-4">Unable to Load Onboarding</h1>
              <p className="text-gray-600 mb-4">
                We couldn't determine your role from your registration. Please contact support.
              </p>
              <Button onClick={() => router.push('/dashboard')} className="mt-4">
                Go to Dashboard
              </Button>
            </>
          )}
          
          {saving && (
            <div className="mt-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">Completing your setup...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}