"use client";

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BarChart, TrendingUp, Award, FileText, Calendar } from 'lucide-react';

interface Grade {
  id: string;
  assignment_title: string;
  assignment_id: string;
  class_name: string;
  class_id: string;
  points_earned: number;
  points_possible: number;
  percentage: number;
  letter_grade: string;
  submitted_at: string;
  graded_at: string;
  feedback?: string;
}

interface ClassGrade {
  class_id: string;
  class_name: string;
  total_points_earned: number;
  total_points_possible: number;
  percentage: number;
  letter_grade: string;
  assignment_count: number;
}

export default function StudentGradesPage() {
  const { user, loading, getUserDisplayName } = useAuth();
  const router = useRouter();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classGrades, setClassGrades] = useState<ClassGrade[]>([]);
  const [loadingGrades, setLoadingGrades] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const loadGrades = async () => {
    try {
      const supabase = createClient();
      
      if (!user?.id) {
        setError('User not found');
        return;
      }
      
      console.log('Loading grades for student:', user.id);
      
      // Check if submissions table exists
      const { data: testSubmissions, error: submissionTestError } = await supabase
        .from('submissions')
        .select('count')
        .limit(1);
      
      if (submissionTestError) {
        console.error('Submissions table not accessible:', submissionTestError);
        setError('Grades system not available yet. No assignments have been graded.');
        setGrades([]);
        setClassGrades([]);
        return;
      }
      
      // Check if assignments table exists
      const { data: testAssignments, error: assignmentTestError } = await supabase
        .from('assignments')
        .select('count')
        .limit(1);
      
      if (assignmentTestError) {
        console.error('Assignments table not accessible:', assignmentTestError);
        setError('Assignments system not available yet.');
        setGrades([]);
        setClassGrades([]);
        return;
      }
      
      // Get graded submissions for the student (simplified query)
      const { data: submissionsData, error: submissionsError } = await supabase
        .from('submissions')
        .select('id, assignment_id, grade, submitted_at, graded_at, feedback')
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
        setClassGrades([]);
        return;
      }
      
      // Get assignment details
      const assignmentIds = submissionsData.map(s => s.assignment_id);
      const { data: assignmentsData } = await supabase
        .from('assignments')
        .select('id, title, class_id')
        .in('id', assignmentIds);
      
      // Get class details
      const classIds = [...new Set(assignmentsData?.map(a => a.class_id) || [])];
      const { data: classesData } = await supabase
        .from('classes')
        .select('id, name')
        .in('id', classIds);

      // Transform the data
      const transformedGrades: Grade[] = submissionsData.map(submission => {
        const assignment = assignmentsData?.find(a => a.id === submission.assignment_id);
        const classData = classesData?.find(c => c.id === assignment?.class_id);
        const pointsEarned = submission.grade || 0;
        const pointsPossible = 100; // Default since we don't have this column
        const percentage = pointsPossible > 0 ? (pointsEarned / pointsPossible) * 100 : 0;
        
        return {
          id: submission.id,
          assignment_title: assignment?.title || 'Unknown Assignment',
          assignment_id: assignment?.id || '',
          class_name: classData?.name || 'Unknown Class',
          class_id: classData?.id || '',
          points_earned: pointsEarned,
          points_possible: pointsPossible,
          percentage,
          letter_grade: getLetterGrade(percentage),
          submitted_at: submission.submitted_at,
          graded_at: submission.graded_at,
          feedback: submission.feedback
        };
      });

      setGrades(transformedGrades);

      // Calculate class grades
      const classGradeMap = new Map<string, ClassGrade>();
      
      transformedGrades.forEach(grade => {
        const existing = classGradeMap.get(grade.class_id);
        if (existing) {
          existing.total_points_earned += grade.points_earned;
          existing.total_points_possible += grade.points_possible;
          existing.assignment_count += 1;
        } else {
          classGradeMap.set(grade.class_id, {
            class_id: grade.class_id,
            class_name: grade.class_name,
            total_points_earned: grade.points_earned,
            total_points_possible: grade.points_possible,
            percentage: 0,
            letter_grade: '',
            assignment_count: 1
          });
        }
      });

      // Calculate percentages and letter grades for classes
      const classGradesArray = Array.from(classGradeMap.values()).map(classGrade => {
        const percentage = classGrade.total_points_possible > 0 
          ? (classGrade.total_points_earned / classGrade.total_points_possible) * 100 
          : 0;
        
        return {
          ...classGrade,
          percentage,
          letter_grade: getLetterGrade(percentage)
        };
      });

      setClassGrades(classGradesArray);
    } catch (error) {
      console.error('Error loading grades:', error);
      setError('Failed to load grades');
    } finally {
      setLoadingGrades(false);
    }
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

  const getGradeColor = (percentage: number): string => {
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 80) return 'text-blue-600';
    if (percentage >= 70) return 'text-yellow-600';
    if (percentage >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const overallGPA = classGrades.length > 0 
    ? classGrades.reduce((sum, grade) => sum + grade.percentage, 0) / classGrades.length 
    : 0;

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
              <p className="text-gray-600">Track your academic progress, {getUserDisplayName()}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/student')}
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {grades.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <BarChart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Grades Yet</h3>
              <p className="text-gray-600 mb-4">
                You don't have any graded assignments yet. Complete and submit assignments to see your grades here.
              </p>
              <Button onClick={() => router.push('/dashboard/student/assignments')}>
                View Assignments
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Overall Performance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Overall Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className={`text-3xl font-bold ${getGradeColor(overallGPA)}`}>
                      {overallGPA.toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-500">Overall Average</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">
                      {getLetterGrade(overallGPA)}
                    </div>
                    <div className="text-sm text-gray-500">Letter Grade</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-600">
                      {grades.length}
                    </div>
                    <div className="text-sm text-gray-500">Graded Assignments</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Class Grades */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Class Grades
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {classGrades.map((classGrade) => (
                    <div key={classGrade.class_id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-medium">{classGrade.class_name}</h3>
                        <Badge variant="outline" className={getGradeColor(classGrade.percentage)}>
                          {classGrade.letter_grade}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mb-2">
                        <Progress value={classGrade.percentage} className="flex-1" />
                        <span className={`font-medium ${getGradeColor(classGrade.percentage)}`}>
                          {classGrade.percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {classGrade.total_points_earned}/{classGrade.total_points_possible} points 
                        • {classGrade.assignment_count} assignments
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Grades */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Recent Grades
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {grades.slice(0, 10).map((grade) => (
                    <div key={grade.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h3 className="font-medium">{grade.assignment_title}</h3>
                          <p className="text-sm text-gray-600">{grade.class_name}</p>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-bold ${getGradeColor(grade.percentage)}`}>
                            {grade.letter_grade}
                          </div>
                          <div className="text-sm text-gray-500">
                            {grade.points_earned}/{grade.points_possible}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 mb-2">
                        <Progress value={grade.percentage} className="flex-1" />
                        <span className={`text-sm font-medium ${getGradeColor(grade.percentage)}`}>
                          {grade.percentage.toFixed(1)}%
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          Graded: {formatDate(grade.graded_at)}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/dashboard/student/grades/${grade.assignment_id}`)}
                        >
                          View Details
                        </Button>
                      </div>

                      {grade.feedback && (
                        <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                          <p className="text-sm text-blue-800">
                            <strong>Feedback:</strong> {grade.feedback}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}