"use client";

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';

export default function SimpleOnboardingTest() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [dbTest, setDbTest] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && user) {
      testDatabase();
    }
  }, [mounted, user]);

  const testDatabase = async () => {
    try {
      const supabase = createClient();
      
      // Test if users table exists and user is in it
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .single();

      if (userError) {
        console.error('User query error:', userError);
        setError(`User table error: ${userError.message}`);
        return;
      }

      // Test if institutions table exists
      const { data: institutions, error: instError } = await supabase
        .from('institutions')
        .select('id, name')
        .limit(5);

      if (instError) {
        console.error('Institutions query error:', instError);
        setError(`Institutions table error: ${instError.message}`);
        return;
      }

      setDbTest({
        user: userData,
        institutions: institutions,
        tablesWorking: true
      });

    } catch (err) {
      console.error('Database test error:', err);
      setError(`Database test failed: ${err}`);
    }
  };

  if (!mounted) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">Not Logged In</h2>
          <p>Please log in to access onboarding.</p>
          <a href="/auth/login" className="text-blue-600 underline">Go to Login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Onboarding Database Test</h1>
        
        <div className="space-y-4">
          <div className="p-4 border rounded">
            <h3 className="font-semibold">User Info:</h3>
            <pre className="text-sm bg-gray-100 p-2 rounded mt-2">
              {JSON.stringify(user, null, 2)}
            </pre>
          </div>

          {error && (
            <div className="p-4 border border-red-300 bg-red-50 rounded">
              <h3 className="font-semibold text-red-700">Database Error:</h3>
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {dbTest && (
            <div className="p-4 border border-green-300 bg-green-50 rounded">
              <h3 className="font-semibold text-green-700">Database Test Results:</h3>
              <pre className="text-sm bg-white p-2 rounded mt-2">
                {JSON.stringify(dbTest, null, 2)}
              </pre>
            </div>
          )}

          <div className="mt-8">
            <h3 className="font-semibold mb-4">Simple Role Selection Test:</h3>
            <div className="space-y-2">
              <button 
                className="block w-full p-3 text-left border rounded hover:bg-gray-50"
                onClick={() => alert('Student role selected!')}
              >
                👨‍🎓 Student
              </button>
              <button 
                className="block w-full p-3 text-left border rounded hover:bg-gray-50"
                onClick={() => alert('Teacher role selected!')}
              >
                👨‍🏫 Teacher
              </button>
              <button 
                className="block w-full p-3 text-left border rounded hover:bg-gray-50"
                onClick={() => alert('Admin role selected!')}
              >
                👨‍💼 Administrator
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}