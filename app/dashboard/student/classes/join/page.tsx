'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, BookOpen, Users, CheckCircle } from 'lucide-react';

interface JoinClassResult {
  enrollmentId: string;
  classId: string;
  className: string;
  classDescription: string;
  teacherName: string;
  enrolledAt: string;
}

export default function JoinClassPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [classCode, setClassCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<JoinClassResult | null>(null);

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!classCode.trim()) {
      setError('Please enter a class code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Lookup, capacity check and enrollment happen atomically in the database.
      // Students can't read or insert classes/enrollments directly (see RLS).
      const { data, error: joinError } = await supabase.rpc(
        'join_class_by_code',
        {
          p_code: classCode,
        }
      );

      if (joinError || !data) {
        setError(
          joinError?.message || 'Failed to join the class. Please try again.'
        );
        return;
      }

      setSuccess({
        enrollmentId: data.enrollment_id,
        classId: data.class_id,
        className: data.class_name,
        classDescription: data.class_description || '',
        teacherName: data.teacher_name || 'Unknown Teacher',
        enrolledAt: data.enrolled_at,
      });
      setClassCode('');
    } catch (err) {
      console.error('Error joining class:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setSuccess(null);
    setError(null);
    setClassCode('');
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div>Please log in to join a class.</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/dashboard/student/classes')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Classes
        </Button>
      </div>

      {/* Success State */}
      {success && (
        <Card className="border-green-200 bg-green-50 mb-6">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-green-800">
              Successfully Enrolled!
            </CardTitle>
            <CardDescription className="text-green-700">
              You have been enrolled in the class
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="bg-white p-4 rounded-lg border border-green-200">
              <h3 className="font-semibold text-lg text-gray-900">
                {success.className}
              </h3>
              <p className="text-gray-600 text-sm mt-1">
                {success.classDescription}
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Taught by {success.teacherName}
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => router.push(`/dashboard/student/classes`)}
                className="bg-green-600 hover:bg-green-700"
              >
                <BookOpen className="h-4 w-4 mr-2" />
                View My Classes
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Join Another Class
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Join Form */}
      {!success && (
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-blue-600" />
            </div>
            <CardTitle>Join a Class</CardTitle>
            <CardDescription>
              Enter the class code provided by your teacher to join their class
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinClass} className="space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="classCode">
                  Class Code <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="classCode"
                  placeholder="e.g., MATH 101A or BIOL2024"
                  value={classCode}
                  onChange={e => setClassCode(e.target.value.toUpperCase())}
                  className="text-center font-mono text-lg tracking-wider"
                  disabled={isLoading}
                  required
                />
                <p className="text-xs text-gray-500">
                  Enter the code exactly as provided by your teacher
                </p>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !classCode.trim()}
              >
                {isLoading ? 'Joining Class...' : 'Join Class'}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">
                How to join a class:
              </h4>
              <ol className="text-sm text-gray-600 space-y-1">
                <li>1. Get the class code from your teacher</li>
                <li>2. Enter the code in the field above</li>
                <li>3. Click &ldquo;Join Class&rdquo; to enroll</li>
                <li>4. Start accessing assignments and materials</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
