"use client";

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BarChart, Award, FileText, BookOpen } from 'lucide-react';

interface SimpleGrade {
  id: string;
  assignment_title: string;
  class_name: string;
  grade: number;
  percentage: number;
  letter_grade: string;
  graded_at: string;
}

export default function SimpleStudentGradesPage() {
  const { user, loading, getUserDisplayName } = useAuth();
  const router = useRouter();
  const [grades, setGrades] = useState<SimpleGrade[]>([]);
  const [loadingGrades, setLoadingGrades] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overallGPA, setOverallGPA] = useState<number>(0);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      loadGrades();
    }
  }, [user]);

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

  const getGradeColor = (percentage: number): string => {
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 80) return 'text-blue-600';
    if (percentage >= 70) return 'text-yellow-600';
    if (percentage >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const loadGrades = async () => {
    try {
      const supabase = createClient();
      
      console.log('Loading simple grades for student:', user.id);
      
      // Check if submissions table exists
      const { data: testSubmissions, error: submissionTestError } = await supabase
        .from('submissions')
        .select('count')
        .limit(1);
      
      if (submissionTestError) {
        console.error('Submissions table not accessible:', submissionTestError);
        setError('Grades system not available yet. No assignments have been graded.');
        setGrades([]);
        return;
      }
      
      // Get graded submissions (simplified)
      const { data: submissionsData, error: submissionsError } = await supabase
        .from('submissions')
        .select('id, assignment_id, grade, graded_at')
        .eq('student_id', user.id)
        .not('grade', 'is', null)
        .order('graded_at', { ascending: false });

      if (submissionsError) {
        console.error('Error loading submissions:', submissionsError);
        setError(`Failed to load grades: ${submissionsError.message}`);
        return;
      }
      
      console.log('Found graded submissions:', submissionsData?.length || 0);
      
      if (!submissionsData || submissionsData.length === 0) {
        setGrades([]);
        return;
      }
      
      // Get assignment and class details
      const assignmentIds = submissionsData.map(s => s.assignment_id);
      const { data: assignmentsData } = await supabase
        .from('assignments')
        .select('id, title, class_id')
        .in('id', assignmentIds);
      
      const classIds = [...new Set(assignmentsData?.map(a => a.class_id) || [])];
      const { data: classesData } = await supabase
        .from('classes')
        .select('id, name')
        .in('id', classIds);
      
      // Transform the data
      const transformedGrades: SimpleGrade[] = submissionsData.map(submission => {
        const assignment = assignmentsData?.find(a => a.id === submission.assignment_id);
        const classData = classesData?.find(c => c.id === assignment?.class_id);
        const grade = submission.grade || 0;
        const percentage = grade; // Assume grade is already a percentage
        
        return {
          id: submission.id,
          assignment_title: assignment?.title || 'Unknown Assignment',
          class_name: classData?.name || 'Unknown Class',
          grade: grade,
          percentage: percentage,
          letter_grade: getLetterGrade(percentage),
          graded_at: submission.graded_at
        };
      });

      setGrades(transformedGrades);
      
      // Calculate overall GPA
      if (transformedGrades.length > 0) {
        const totalPercentage = transformedGrades.reduce((sum, grade) => sum + grade.percentage, 0);
        const averagePercentage = totalPercentage / transformedGrades.length;
        setOverallGPA(averagePercentage);
      }
      
      console.log('Loaded grades successfully:', transformedGrades.length);
      
    } catch (error) {
      console.error('Error loading grades:', error);
      setError('An unexpected error occurred while loading grades');
    } finally {
      setLoadingGrades(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading || loadingGrades) {
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
              <h1 className="text-2xl font-bold text-gray-900">My Grades</h1>
              <p className="text-gray-600">Your grades from all classes, {getUserDisplayName()}</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => router.push('/dashboard/student/assignments')}
                variant="outline"
              >
                <FileText className="h-4 w-4 mr-2" />
                Assignments
              </Button>
              <Button
                onClick={() => router.push('/dashboard/student')}
                variant="outline"
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
            <div className="mt-2 flex gap-2">
              <Button 
                onClick={() => window.location.reload()} 
                size="sm"
              >
                Try Again
              </Button>
              <Button 
                onClick={() => router.push('/dashboard/student/assignments')} 
                size="sm"
                variant="outline"
              >
                View Assignments
              </Button>
            </div>
          </div>
        )}

        {/* Overall Grade Summary */}
        {grades.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overall Grade</CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getGradeColor(overallGPA)}`}>
                  {getLetterGrade(overallGPA)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {overallGPA.toFixed(1)}% average
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Assignments Graded</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{grades.length}</div>
                <p className="text-xs text-muted-foreground">
                  Total graded assignments
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Progress</CardTitle>
                <BarChart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallGPA.toFixed(0)}%</div>
                <Progress value={overallGPA} className="mt-2" />
              </CardContent>
            </Card>
          </div>
        )}

        {grades.length === 0 && !error ? (
          <Card>
            <CardContent className="text-center py-12">
              <Award className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Grades Yet</h3>
              <p className="text-gray-600 mb-4">
                You don't have any graded assignments yet. Complete and submit assignments to see your grades here.
              </p>
              <Button onClick={() => router.push('/dashboard/student/assignments')}>
                <FileText className="h-4 w-4 mr-2" />
                View Assignments
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Recent Grades</h2>
            {grades.map((grade) => (
              <Card key={grade.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{grade.assignment_title}</h3>
                      <p className="text-gray-600 text-sm">{grade.class_name}</p>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${getGradeColor(grade.percentage)}`}>
                        {grade.letter_grade}
                      </div>
                      <p className="text-sm text-gray-500">
                        {grade.percentage.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex justify-between items-center text-sm text-gray-500">
                    <span>Graded: {formatDate(grade.graded_at)}</span>
                    <Badge variant={grade.percentage >= 70 ? 'default' : 'destructive'}>
                      {grade.grade} points
                    </Badge>
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