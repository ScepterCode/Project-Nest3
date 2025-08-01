"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, User, Database, AlertCircle } from 'lucide-react';

export function RoleDebug() {
  const { user } = useAuth();
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const checkRoleStatus = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const supabase = createClient();
      
      // Check user metadata
      const userMetadata = {
        id: user.id,
        email: user.email,
        metadataRole: user.user_metadata?.role,
        emailConfirmed: user.email_confirmed_at,
        createdAt: user.created_at
      };

      // Check database role
      const { data: dbUser, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      // Test role gate logic
      const testRoles = ['student', 'teacher', 'department_admin', 'institution_admin'];
      const roleTests = {};
      
      for (const role of testRoles) {
        if (dbUser?.role) {
          roleTests[role] = dbUser.role === role;
        } else {
          roleTests[role] = false;
        }
      }

      setDebugInfo({
        userMetadata,
        database: {
          user: dbUser,
          error: dbError?.message,
          hasUser: !!dbUser
        },
        roleTests,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      setDebugInfo({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkRoleStatus();
  }, [user]);

  if (!user) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            No User Found
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>No authenticated user found. Please log in.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Role Debug Information
          <Button
            variant="outline"
            size="sm"
            onClick={checkRoleStatus}
            disabled={loading}
            className="ml-auto"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {debugInfo ? (
          <>
            {/* User Metadata */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <User className="h-4 w-4" />
                Auth User Metadata
              </h3>
              <div className="bg-gray-50 p-3 rounded text-sm space-y-1">
                <div><strong>ID:</strong> {debugInfo.userMetadata?.id}</div>
                <div><strong>Email:</strong> {debugInfo.userMetadata?.email}</div>
                <div>
                  <strong>Metadata Role:</strong> 
                  <Badge variant="outline" className="ml-2">
                    {debugInfo.userMetadata?.metadataRole || 'None'}
                  </Badge>
                </div>
                <div><strong>Email Confirmed:</strong> {debugInfo.userMetadata?.emailConfirmed ? 'Yes' : 'No'}</div>
              </div>
            </div>

            {/* Database Info */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Database className="h-4 w-4" />
                Database User Record
              </h3>
              {debugInfo.database?.error ? (
                <div className="bg-red-50 border border-red-200 p-3 rounded text-sm">
                  <strong className="text-red-600">Error:</strong> {debugInfo.database.error}
                </div>
              ) : debugInfo.database?.user ? (
                <div className="bg-green-50 p-3 rounded text-sm space-y-1">
                  <div><strong>Database Role:</strong> 
                    <Badge variant="default" className="ml-2">
                      {debugInfo.database.user.role}
                    </Badge>
                  </div>
                  <div><strong>Onboarding Complete:</strong> {debugInfo.database.user.onboarding_completed ? 'Yes' : 'No'}</div>
                  <div><strong>Institution ID:</strong> {debugInfo.database.user.institution_id || 'None'}</div>
                  <div><strong>Department ID:</strong> {debugInfo.database.user.department_id || 'None'}</div>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-sm">
                  <strong className="text-yellow-600">Warning:</strong> No user record found in database
                </div>
              )}
            </div>

            {/* Role Tests */}
            <div>
              <h3 className="font-semibold mb-2">Role Gate Tests</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(debugInfo.roleTests || {}).map(([role, hasRole]) => (
                  <div key={role} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="capitalize">{role}:</span>
                    <Badge variant={hasRole ? "default" : "secondary"}>
                      {hasRole ? "✓ Pass" : "✗ Fail"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            <div>
              <h3 className="font-semibold mb-2">Recommendations</h3>
              <div className="bg-blue-50 p-3 rounded text-sm">
                {!debugInfo.database?.user ? (
                  <p>❌ <strong>Issue:</strong> No user record in database. Run the database setup SQL to create user profiles.</p>
                ) : debugInfo.database.user.role !== 'teacher' ? (
                  <p>❌ <strong>Issue:</strong> User role is "{debugInfo.database.user.role}" but you need "teacher" role for teacher features.</p>
                ) : (
                  <p>✅ <strong>Good:</strong> User has teacher role in database. Role gates should work correctly.</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading debug information...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}