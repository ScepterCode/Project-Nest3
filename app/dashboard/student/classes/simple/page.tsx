"use client";

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookOpen, Users, Plus, ArrowLeft } from 'lucide-react';

interface SimpleClass {
  id: string;
  name: string;
  description: string;
  teacher_name: string;
  enrollment_date: string;
  status: string;
}

export default function SimpleStudentClassesPage() {
  const { user, loading, getUserDisplayName } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<SimpleClass[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      loadClasses();
    }
  }, [user]);

  const loadClasses = async () => {
    try {
      const supabase = createClient();
      
      console.log('Loading simple classes for student:', user.id);
      
      // Check if enrollments table exists
      const { data: testEnrollments, error: testError } = await supabase
        .from('enrollments')
        .select('count')
        .limit(1);
      
      if (testError) {
        console.error('Enrollments table not accessible:', testError);
        setError('Enrollments system not available. You may not have any classes yet.');
        setClasses([]);
        return;
      }
      
      // Get student's enrollments
      const { data: enrollments, error: enrollError } = await supabase
        .from('enrollments')
        .select('id, class_id, enrolled_at, status')
        .eq('student_id', user.id);

      if (enrollError) {
        console.error('Error loading enrollments:', enrollError);
        setError('Failed to load your enrollments');
        return;
      }
      
      if (!enrollments || enrollments.length === 0) {
        console.log('No enrollments found');
        setClasses([]);
        return;
      }
      
      console.log('Found enrollments:', enrollments.length);
      
      // Get class details
      const classIds = enrollments.map(e => e.class_id);
      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('id, name, description, teacher_id, status')
        .in('id', classIds);
        
      if (classesError) {
        console.error('Error loading classes:', classesError);
        setError('Failed to load class details');
        return;
      }
      
      // Get teacher names
      const teacherIds = [...new Set(classesData?.map(c => c.teacher_id) || [])];
      const { data: teachersData } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .in('id', teacherIds);
      
      // Combine data
      const combinedClasses = enrollments.map(enrollment => {
        const classData = classesData?.find(c => c.id === enrollment.class_id);
        const teacherData = teachersData?.find(t => t.id === classData?.teacher_id);
        
        if (!classData) return null;
        
        return {
          id: classData.id,
          name: classData.name,
          description: classData.description || 'No description available',
          teacher_name: teacherData ? `${teacherData.first_name} ${teacherData.last_name}` : 'Unknown Teacher',
          enrollment_date: enrollment.enrolled_at,
          status: classData.status
        };
      }).filter(c => c !== null) as SimpleClass[];
      
      setClasses(combinedClasses);
      console.log('Loaded classes successfully:', combinedClasses.length);
      
    } catch (error) {
      console.error('Error loading classes:', error);
      setError('An unexpected error occurred while loading your classes');
    } finally {
      setLoadingClasses(false);
    }
  };

  if (loading || loadingClasses) {
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
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Classes</h1>
              <p className="text-gray-600">Your enrolled classes, {getUserDisplayName()}</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => router.push('/dashboard/student/classes/join')}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Join Class
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push('/dashboard/student')}
              >
                Back to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
            <Button 
              onClick={() => window.location.reload()} 
              className="mt-2"
              size="sm"
            >
              Try Again
            </Button>
          </div>
        )}

        {classes.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Classes Yet</h3>
              <p className="text-gray-600 mb-4">
                You're not enrolled in any classes yet. Join a class to start learning!
              </p>
              <Button onClick={() => router.push('/dashboard/student/classes/join')}>
                <Plus className="h-4 w-4 mr-2" />
                Join Your First Class
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classes.map((classItem) => (
              <Card key={classItem.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{classItem.name}</CardTitle>
                      <CardDescription className="mt-1">
                        Taught by {classItem.teacher_name}
                      </CardDescription>
                    </div>
                    <Badge variant={classItem.status === 'active' ? 'default' : 'secondary'}>
                      {classItem.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-600 text-sm">{classItem.description}</p>
                  
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => router.push(`/dashboard/student/classes/${classItem.id}`)}
                    >
                      <BookOpen className="h-4 w-4 mr-2" />
                      Enter Class
                    </Button>
                  </div>

                  <div className="text-xs text-gray-500 pt-2 border-t">
                    Enrolled: {new Date(classItem.enrollment_date).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}