"use client";

import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserCog, Save, AlertCircle, CheckCircle } from 'lucide-react';

export function RoleAssignmentTool() {
  const { user } = useAuth();
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const roles = [
    { value: 'student', label: 'Student' },
    { value: 'teacher', label: 'Teacher' },
    { value: 'department_admin', label: 'Department Admin' },
    { value: 'institution_admin', label: 'Institution Admin' },
    { value: 'system_admin', label: 'System Admin' }
  ];

  const assignRole = async () => {
    if (!user || !selectedRole) return;

    setLoading(true);
    setMessage(null);

    try {
      const supabase = createClient();
      
      // First, check if user exists in database
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (fetchError && fetchError.code === 'PGRST116') {
        // User doesn't exist, create them
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: user.id,
            email: user.email || '',
            role: selectedRole,
            onboarding_completed: true,
            first_name: user.user_metadata?.first_name || '',
            last_name: user.user_metadata?.last_name || ''
          });

        if (insertError) {
          throw insertError;
        }

        setMessage({
          type: 'success',
          text: `User profile created with ${selectedRole} role! Please refresh the page.`
        });
      } else if (fetchError) {
        throw fetchError;
      } else {
        // User exists, update their role
        const { error: updateError } = await supabase
          .from('users')
          .update({ role: selectedRole })
          .eq('id', user.id);

        if (updateError) {
          throw updateError;
        }

        setMessage({
          type: 'success',
          text: `Role updated to ${selectedRole}! Please refresh the page.`
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to assign role: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            Authentication Required
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>You must be logged in to use the role assignment tool.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCog className="h-5 w-5" />
          Role Assignment Tool
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Use this tool to assign or update your role in the database. This is useful for demo/development purposes.
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Select Role for {user.email}:
              </label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a role..." />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={assignRole} 
              disabled={!selectedRole || loading}
              className="w-full"
            >
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Assigning Role...' : 'Assign Role'}
            </Button>
          </div>
        </div>

        {message && (
          <Alert className={message.type === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
            {message.type === 'success' ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
            <AlertDescription className={message.type === 'success' ? 'text-green-800' : 'text-red-800'}>
              {message.text}
            </AlertDescription>
          </Alert>
        )}

        <div className="bg-blue-50 p-3 rounded text-sm">
          <strong>Note:</strong> After assigning a role, refresh the page to see the changes take effect. 
          The role will be stored in the database and used for all permission checks.
        </div>
      </CardContent>
    </Card>
  );
}