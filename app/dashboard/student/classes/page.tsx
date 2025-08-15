"use client";

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BookOpen, Users, Calendar, Clock, FileText, Award, Plus } from 'lucide-react';

interface StudentClass {
  id: string;
  name: string;
  description: string;
  teacher_name: string;
  teacher_id: string;
  enrollment_date: string;
  status: 'active' | 'completed' | 'dropped';
  total_assignments: number;
  completed_assignments: number;
  pending_assignments: number;
  average_grade: number;
  next_assignment_due?: string;
  next_assignment_title?: string;
}

export default function StudentClassesPage() {
  const { user, loading, getUserDisplayName } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<StudentClass[]>([]);
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
      
      console.log('Loading classes for student:', user.id);
      
      // First, check if enrollments table exists and is accessible
      const { data: testEnrollments, error: testError } = await supabase
        .from('enrollments')
        .select('count')
        .limit(1);
      
      if (testError) {
        console.error('Enrollments table not accessible:', testError);
        setError('Enrollments system not set up. Please contact your administrator.');
        return;
      }
      
      console.log('Enrollments table accessible, loading student enrollments...');
      
      // Get classes the student is enrolled in with simpler query first
      const { data: enrollments, error } = await supabase
        .from('enrollments')
        .select(`
          id,
          enrolled_at,
          status,
          class_id
        `)
        .eq('student_id', user.id);

      if (error) {
        console.error('Error loading enrollments:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          details: error.details
        });
        setError(`Failed to load enrollments: ${error.message}`);
        return;
      }
      
      console.log('Found enrollments:', enrollments?.length || 0);
      
      if (!enrollments || enrollments.length === 0) {
        setClasses([]);
        return;
      }
      
      // Get class details for each enrollment
      const classIds = enrollments.map(e => e.class_id);
      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select(`
          id,
          name,
          description,
          teacher_id,
          status,
          created_at
        `)
        .in('id', classIds);
        
      if (classesError) {
        console.error('Error loading class details:', classesError);
        setError(`Failed to load class details: ${classesError.message}`);
        return;
      }
      
      console.log('Found classes:', classesData?.length || 0);

      // Combine enrollment and class data
      const classesWithStats = await Promise.all(
        enrollments.map(async (enrollment) => {
          const classData = classesData?.find(c => c.id === enrollment.class_id);
          
          if (!classData) {
            console.warn('Class not found for enrollment:', enrollment.class_id);
            return null;
          }
          
          // Get assignments for this class
          const { data: assignments } = await supabase
            .from('assignments')
            .select(`
              id,
              title,
              due_date,
              submissions(
                id,
                grade,
                submitted_at
              )
            `)
            .eq('class_id', classData.id);

          // Calculate statistics
          const totalAssignments = assignments?.length || 0;
          const submittedAssignments = assignments?.filter(a => 
            a.submissions.some(s => s.submitted_at)
          ).length || 0;
          const gradedAssignments = assignments?.filter(a => 
            a.submissions.some(s => s.grade !== null)
          ).length || 0;
          
          // Calculate average grade
          const grades = assignments?.map(a => a.submissions[0]?.grade).filter(g => g !== null && g !== undefined) || [];
          const averageGrade = grades.length > 0 ? grades.reduce((sum, grade) => sum + grade, 0) / grades.length : 0;

          // Find next assignment due
          const upcomingAssignments = assignments?.filter(a => 
            new Date(a.due_date) > new Date() && !a.submissions.some(s => s.submitted_at)
          ).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()) || [];

          // Get teacher information separately
          const { data: teacherData } = await supabase
            .from('users')
            .select('first_name, last_name')
            .eq('id', classData.teacher_id)
            .single();
            
          const teacherName = teacherData ? `${teacherData.first_name} ${teacherData.last_name}` : 'Unknown Teacher';

          return {
            id: classData.id,
            name: classData.name,
            description: classData.description,
            teacher_name: teacherName,
            teacher_id: classData.teacher_id,
            enrollment_date: enrollment.enrolled_at,
            status: 'active' as const,
            total_assignments: totalAssignments,
            completed_assignments: submittedAssignments,
            pending_assignments: totalAssignments - submittedAssignments,
            average_grade: averageGrade,
            next_assignment_due: upcomingAssignments[0]?.due_date,
            next_assignment_title: upcomingAssignments[0]?.title
          };
        })
      );

      // Filter out null entries and set classes
      const validClasses = classesWithStats.filter(c => c !== null);
      setClasses(validClasses);
      console.log('Loaded classes successfully:', validClasses.length);
    } catch (error) {
      console.error('Error loading classes:', error);
      setError('Failed to load classes');
    } finally {
      setLoadingClasses(false);
    }
  };

  const getGradeColor = (grade: number): string => {
    if (grade >= 90) return 'text-green-600';
    if (grade >= 80) return 'text-blue-600';
    if (grade >= 70) return 'text-yellow-600';
    if (grade >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const getLetterGrade = (percentage: number): string => {
    if (percentage >= 97) return 'A+';
    if (percentage >= 93) return 'A';
    if (percentage >= 90) return 'A-';
    if (percentage >= 87) return 'B+';
    if (percentage >= 83) return 'B';
    if (percentage >= 80) return 'B-';
    if (percentage >= 77) return 'C+';
    if (percentage >= 73) return 'C';
    if (percentage >= 70) return 'C-';
    if (percentage >= 67) return 'D+';
    if (percentage >= 63) return 'D';
    if (percentage >= 60) return 'D-';
    return 'F';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
              <p className="text-gray-600">Manage your enrolled classes, {getUserDisplayName()}</p>
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
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {classes.length}
                    </div>
                    <div className="text-sm text-gray-500">Enrolled Classes</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {classes.reduce((sum, c) => sum + c.completed_assignments, 0)}
                    </div>
                    <div className="text-sm text-gray-500">Completed Assignments</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {classes.reduce((sum, c) => sum + c.pending_assignments, 0)}
                    </div>
                    <div className="text-sm text-gray-500">Pending Assignments</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${getGradeColor(
                      classes.length > 0 
                        ? classes.reduce((sum, c) => sum + c.average_grade, 0) / classes.length 
                        : 0
                    )}`}>
                      {classes.length > 0 
                        ? getLetterGrade(classes.reduce((sum, c) => sum + c.average_grade, 0) / classes.length)
                        : 'N/A'
                      }
                    </div>
                    <div className="text-sm text-gray-500">Overall Grade</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Classes List */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                      <Badge variant="secondary" className="ml-2">
                        Active
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-gray-600 text-sm">{classItem.description}</p>
                    
                    {/* Progress */}
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Assignment Progress</span>
                        <span>{classItem.completed_assignments}/{classItem.total_assignments}</span>
                      </div>
                      <Progress 
                        value={classItem.total_assignments > 0 
                          ? (classItem.completed_assignments / classItem.total_assignments) * 100 
                          : 0
                        } 
                      />
                    </div>

                    {/* Grade */}
                    {classItem.average_grade > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Current Grade:</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${getGradeColor(classItem.average_grade)}`}>
                            {getLetterGrade(classItem.average_grade)}
                          </span>
                          <span className="text-sm text-gray-500">
                            ({classItem.average_grade.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Next Assignment */}
                    {classItem.next_assignment_due && (
                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-center gap-2 text-yellow-800">
                          <Clock className="h-4 w-4" />
                          <span className="font-medium">Next Assignment Due</span>
                        </div>
                        <p className="text-sm text-yellow-700 mt-1">
                          {classItem.next_assignment_title}
                        </p>
                        <p className="text-xs text-yellow-600 mt-1">
                          Due: {formatDateTime(classItem.next_assignment_due)}
                        </p>
                      </div>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4 text-center text-sm">
                      <div>
                        <div className="font-medium text-blue-600">{classItem.total_assignments}</div>
                        <div className="text-gray-500">Total</div>
                      </div>
                      <div>
                        <div className="font-medium text-green-600">{classItem.completed_assignments}</div>
                        <div className="text-gray-500">Done</div>
                      </div>
                      <div>
                        <div className="font-medium text-yellow-600">{classItem.pending_assignments}</div>
                        <div className="text-gray-500">Pending</div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => router.push(`/dashboard/student/classes/${classItem.id}`)}
                      >
                        <BookOpen className="h-4 w-4 mr-2" />
                        Enter Class
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/dashboard/student/assignments?class=${classItem.id}`)}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Assignments
                      </Button>
                    </div>

                    <div className="text-xs text-gray-500 pt-2 border-t">
                      Enrolled: {formatDate(classItem.enrollment_date)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}