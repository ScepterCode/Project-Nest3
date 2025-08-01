"use client";

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { StudentOnboarding } from '@/components/onboarding/student-onboarding';
import { TeacherOnboarding } from '@/components/onboarding/teacher-onboarding';
import { InstitutionAdminOnboarding } from '@/components/onboarding/institution-admin-onboarding';

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<'role-selection' | 'role-specific'>('role-selection');

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

  const handleRoleSelect = (role: string) => {
    setSelectedRole(role);
    setOnboardingStep('role-specific');
  };

  const handleOnboardingComplete = async (role: string, onboardingData: any) => {
    if (!user) {
      alert('No user found. Please refresh and try again.');
      return;
    }
    
    setSaving(true);
    console.log('Completing onboarding for user:', user.id, 'role:', role, 'data:', onboardingData);
    
    try {
      const supabase = createClient();
      
      // Check if user already has a role assigned
      const { data: existingUser } = await supabase
        .from('users')
        .select('role, onboarding_completed')
        .eq('id', user.id)
        .single();

      if (existingUser && existingUser.onboarding_completed) {
        alert('Your role has already been set and cannot be changed. Contact an administrator if you need a role change.');
        router.push('/dashboard');
        return;
      }

      // Set role permanently with onboarding data
      const { error: updateError } = await supabase
        .from('users')
        .upsert({ 
          id: user.id,
          email: user.email || '',
          role: role,
          onboarding_completed: true,
          first_name: onboardingData.firstName || user.user_metadata?.first_name || '',
          last_name: onboardingData.lastName || user.user_metadata?.last_name || '',
          // Store additional onboarding data in metadata
          onboarding_data: onboardingData
        }, {
          onConflict: 'id'
        });

      if (updateError) {
        console.error('Error setting user role:', {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code,
          fullError: updateError
        });
        alert(`Failed to complete onboarding: ${updateError.message}`);
        return;
      }
      
      console.log('Onboarding completed for role:', role);

      // Redirect to appropriate dashboard
      const dashboardPath = role === 'student' ? '/dashboard/student' : 
                           role === 'teacher' ? '/dashboard/teacher' : 
                           role === 'institution_admin' ? '/dashboard/institution' :
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

  const handleBackToRoleSelection = () => {
    setSelectedRole(null);
    setOnboardingStep('role-selection');
  };

  // Debug: Show what's happening
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Mounting component...</div>
      </div>
    );
  }

  if (loading && !debugInfo.includes('timeout')) {
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

  // Show role-specific onboarding if role is selected
  if (onboardingStep === 'role-specific' && selectedRole) {
    switch (selectedRole) {
      case 'student':
        return (
          <StudentOnboarding
            onComplete={(data) => handleOnboardingComplete('student', data)}
            onBack={handleBackToRoleSelection}
          />
        );
      case 'teacher':
        return (
          <TeacherOnboarding
            onComplete={(data) => handleOnboardingComplete('teacher', data)}
            onBack={handleBackToRoleSelection}
          />
        );
      case 'institution_admin':
        return (
          <InstitutionAdminOnboarding
            onComplete={(data) => handleOnboardingComplete('institution_admin', data)}
            onBack={handleBackToRoleSelection}
          />
        );
      default:
        setOnboardingStep('role-selection');
        break;
    }
  }

  // Show role selection
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-2xl font-bold text-center mb-2">Welcome to the Platform!</h1>
          <p className="text-gray-600 text-center mb-8">
            Hi {user?.email}! Let's get you set up. What's your role?
          </p>

          <div className="space-y-4">
            <button 
              onClick={() => handleRoleSelect('student')}
              disabled={saving}
              className="w-full p-4 text-left border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center">
                <div className="text-2xl mr-4">👨‍🎓</div>
                <div>
                  <h3 className="font-semibold">Student</h3>
                  <p className="text-gray-600 text-sm">I'm here to learn and complete assignments</p>
                </div>
              </div>
            </button>

            <button 
              onClick={() => handleRoleSelect('teacher')}
              disabled={saving}
              className="w-full p-4 text-left border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center">
                <div className="text-2xl mr-4">👨‍🏫</div>
                <div>
                  <h3 className="font-semibold">Teacher</h3>
                  <p className="text-gray-600 text-sm">I teach classes and manage student learning</p>
                </div>
              </div>
            </button>

            <button 
              onClick={() => handleRoleSelect('institution_admin')}
              disabled={saving}
              className="w-full p-4 text-left border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center">
                <div className="text-2xl mr-4">👨‍💼</div>
                <div>
                  <h3 className="font-semibold">Administrator</h3>
                  <p className="text-gray-600 text-sm">I manage institution operations</p>
                </div>
              </div>
            </button>
          </div>

          {saving && (
            <div className="mt-6 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">Completing your setup...</p>
            </div>
          )}

          <div className="mt-8 text-center text-sm text-gray-500">
            <p>Each role has a customized setup process</p>
          </div>
        </div>
      </div>
    </div>
  );
}