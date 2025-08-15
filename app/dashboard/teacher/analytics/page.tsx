"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, 
  BookOpen, 
  FileText, 
  Award,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  Star,
  ThumbsUp,
  HelpCircle,
  AlertCircle
} from "lucide-react";

interface AnalyticsData {
  totalClasses: number;
  totalStudents: number;
  totalAssignments: number;
  totalSubmissions: number;
  averageGrade: number;
  submissionRate: number;
}

interface ClassAnalytics {
  id: string;
  name: string;
  student_count: number;
  assignment_count: number;
  submission_count: number;
  submission_rate: number;
  average_grade: number;
}

interface StudentPerformance {
  id: string;
  name: string;
  email: string;
  total_assignments: number;
  completed_assignments: number;
  average_grade: number;
  completion_rate: number;
}

interface PerformanceOverview {
  excellent_students: StudentPerformance[];
  good_students: StudentPerformance[];
  needs_help_students: StudentPerformance[];
  at_risk_students: StudentPerformance[];
}

export default function TeacherAnalyticsPage() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalClasses: 0,
    totalStudents: 0,
    totalAssignments: 0,
    totalSubmissions: 0,
    averageGrade: 0,
    submissionRate: 0
  });
  const [classAnalytics, setClassAnalytics] = useState<ClassAnalytics[]>([]);
  const [studentPerformances, setStudentPerformances] = useState<StudentPerformance[]>([]);
  const [performanceOverview, setPerformanceOverview] = useState<PerformanceOverview>({
    excellent_students: [],
    good_students: [],
    needs_help_students: [],
    at_risk_students: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchAllAnalytics();
    }
  }, [user]);

  const fetchAllAnalytics = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const supabase = createClient();
      
      // Validate user first
      if (!user?.id) {
        throw new Error('No authenticated user found');
      }
      
      // Step 1: Get teacher's classes
      const { data: classes, error: classError } = await supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', user.id);

      if (classError) {
        throw new Error(`Failed to load classes: ${classError.message}`);
      }

      if (!classes || classes.length === 0) {
        // Teacher has no classes - set empty data
        setAnalytics({
          totalClasses: 0,
          totalStudents: 0,
          totalAssignments: 0,
          totalSubmissions: 0,
          averageGrade: 0,
          submissionRate: 0
        });
        setClassAnalytics([]);
        setStudentPerformances([]);
        setLoading(false);
        return;
      }

      const classIds = classes.map(c => c.id);

      // Step 2: Get enrollments
      const { data: enrollments, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('student_id, class_id')
        .in('class_id', classIds);

      if (enrollmentError) {
        console.error('Error loading enrollments:', enrollmentError);
      }

      const enrollmentsData = enrollments || [];

      // Step 3: Get assignments - try different approaches
      let assignmentsData: any[] = [];
      
      // First try with teacher_id if it exists and is valid
      if (user?.id) {
        const { data: assignmentsByTeacher, error: teacherAssignmentError } = await supabase
          .from('assignments')
          .select('id, title, class_id, points_possible, teacher_id')
          .eq('teacher_id', user.id);

        if (!teacherAssignmentError && assignmentsByTeacher) {
          assignmentsData = assignmentsByTeacher;
          console.log('✅ Loaded assignments by teacher_id:', assignmentsData.length);
        } else {
          console.log('⚠️ teacher_id approach failed, trying class_id approach');
          
          // Fallback: get assignments by class_id
          const { data: assignmentsByClass, error: classAssignmentError } = await supabase
            .from('assignments')
            .select('id, title, class_id, points_possible')
            .in('class_id', classIds);

          if (!classAssignmentError && assignmentsByClass) {
            assignmentsData = assignmentsByClass;
            console.log('✅ Loaded assignments by class_id:', assignmentsData.length);
          } else {
            console.error('❌ Error loading assignments:', classAssignmentError);
            console.error('📋 Assignment error details:', JSON.stringify(classAssignmentError, null, 2));
          }
        }
      } else {
        console.log('⚠️ No valid user ID, skipping assignments');
      }

      // Step 4: Get submissions (only if we have assignments)
      let submissionsData: any[] = [];
      if (assignmentsData.length > 0) {
        const assignmentIds = assignmentsData.map(a => a.id);
        const { data: submissions, error: submissionError } = await supabase
          .from('submissions')
          .select('id, assignment_id, student_id, grade, status')
          .in('assignment_id', assignmentIds);

        if (submissionError) {
          console.error('Error loading submissions:', submissionError);
        } else {
          submissionsData = submissions || [];
        }
      }

      // Calculate overall analytics
      const totalStudents = new Set(enrollmentsData.map(e => e.student_id)).size;
      const totalAssignments = assignmentsData.length;
      const totalSubmissions = submissionsData.length;
      const gradedSubmissions = submissionsData.filter(s => s.grade !== null && s.grade !== undefined);
      const averageGrade = gradedSubmissions.length > 0 
        ? gradedSubmissions.reduce((sum, s) => sum + (s.grade || 0), 0) / gradedSubmissions.length 
        : 0;
      const submissionRate = totalAssignments > 0 && totalStudents > 0 
        ? (totalSubmissions / (totalAssignments * totalStudents)) * 100 
        : 0;

      setAnalytics({
        totalClasses: classes.length,
        totalStudents,
        totalAssignments,
        totalSubmissions,
        averageGrade: Math.round(averageGrade * 10) / 10,
        submissionRate: Math.round(submissionRate * 10) / 10
      });

      // Calculate class analytics
      const classAnalyticsData = classes.map(cls => {
        const classEnrollments = enrollmentsData.filter(e => e.class_id === cls.id);
        const classAssignments = assignmentsData.filter(a => a.class_id === cls.id);
        const classAssignmentIds = classAssignments.map(a => a.id);
        const classSubmissions = submissionsData.filter(s => classAssignmentIds.includes(s.assignment_id));
        
        const studentCount = classEnrollments.length;
        const assignmentCount = classAssignments.length;
        const submissionCount = classSubmissions.length;
        const classSubmissionRate = assignmentCount > 0 && studentCount > 0 
          ? (submissionCount / (assignmentCount * studentCount)) * 100 
          : 0;
        
        const classGradedSubmissions = classSubmissions.filter(s => s.grade !== null && s.grade !== undefined);
        const classAverageGrade = classGradedSubmissions.length > 0
          ? classGradedSubmissions.reduce((sum, s) => sum + (s.grade || 0), 0) / classGradedSubmissions.length
          : 0;

        return {
          id: cls.id,
          name: cls.name,
          student_count: studentCount,
          assignment_count: assignmentCount,
          submission_count: submissionCount,
          submission_rate: Math.round(classSubmissionRate * 10) / 10,
          average_grade: Math.round(classAverageGrade * 10) / 10
        };
      });

      setClassAnalytics(classAnalyticsData);

      // Calculate student performance
      const uniqueStudentIds = Array.from(new Set(enrollmentsData.map(e => e.student_id)));
      
      if (uniqueStudentIds.length > 0) {
        try {
          // Try to get student information from multiple sources
          let studentProfiles: any[] = [];
          
          console.log('🔍 Loading student profiles for', uniqueStudentIds.length, 'students');
          
          // Method 1: Try user_profiles table
          const { data: profiles, error: profileError } = await supabase
            .from('user_profiles')
            .select('user_id, first_name, last_name, email')
            .in('user_id', uniqueStudentIds);

          if (!profileError && profiles && profiles.length > 0) {
            studentProfiles = profiles;
            console.log('✅ Loaded', profiles.length, 'profiles from user_profiles');
          } else {
            console.log('⚠️ user_profiles failed:', profileError?.message || 'no data');
            
            // Method 2: Try to get user info from auth metadata
            try {
              const profilePromises = uniqueStudentIds.map(async (studentId) => {
                // Try to get user data from Supabase auth
                const { data: userData, error: userError } = await supabase.auth.admin.getUserById(studentId);
                
                if (!userError && userData?.user) {
                  return {
                    user_id: studentId,
                    first_name: userData.user.user_metadata?.first_name || userData.user.user_metadata?.name?.split(' ')[0] || 'Student',
                    last_name: userData.user.user_metadata?.last_name || userData.user.user_metadata?.name?.split(' ')[1] || '',
                    email: userData.user.email || `student-${studentId.slice(-4)}@example.com`
                  };
                }
                return null;
              });
              
              const resolvedProfiles = await Promise.all(profilePromises);
              const validProfiles = resolvedProfiles.filter(p => p !== null);
              
              if (validProfiles.length > 0) {
                studentProfiles = validProfiles;
                console.log('✅ Loaded', validProfiles.length, 'profiles from auth metadata');
              }
            } catch (authError) {
              console.log('⚠️ Auth metadata approach failed:', authError);
            }
            
            // Method 3: Final fallback with meaningful names
            if (studentProfiles.length === 0) {
              console.log('📝 Using fallback student names');
              studentProfiles = uniqueStudentIds.map((id, index) => ({
                user_id: id,
                first_name: `Student`,
                last_name: `${String.fromCharCode(65 + index)}`, // A, B, C, etc.
                email: `student.${String.fromCharCode(97 + index)}@school.edu` // student.a@school.edu, etc.
              }));
            }
          }

          const studentPerformanceData = uniqueStudentIds.map(studentId => {
            const profile = studentProfiles?.find(p => p.user_id === studentId);
            const studentEnrollments = enrollmentsData.filter(e => e.student_id === studentId);
            const studentClassIds = studentEnrollments.map(e => e.class_id);
            const studentAssignments = assignmentsData.filter(a => studentClassIds.includes(a.class_id));
            const studentSubmissions = submissionsData.filter(s => 
              studentAssignments.some(a => a.id === s.assignment_id) && s.student_id === studentId
            );
            
            const totalAssignments = studentAssignments.length;
            const completedAssignments = studentSubmissions.length;
            const gradedSubmissions = studentSubmissions.filter(s => s.grade !== null && s.grade !== undefined);
            const averageGrade = gradedSubmissions.length > 0
              ? gradedSubmissions.reduce((sum, s) => sum + (s.grade || 0), 0) / gradedSubmissions.length
              : 0;
            const completionRate = totalAssignments > 0 ? (completedAssignments / totalAssignments) * 100 : 0;

            return {
              id: studentId,
              name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : `Student ${studentId.slice(-4)}`,
              email: profile?.email || `student-${studentId.slice(-4)}@example.com`,
              total_assignments: totalAssignments,
              completed_assignments: completedAssignments,
              average_grade: Math.round(averageGrade * 10) / 10,
              completion_rate: Math.round(completionRate * 10) / 10
            };
          });

          setStudentPerformances(studentPerformanceData);
          
          // Calculate performance overview categories
          const excellentStudents = studentPerformanceData.filter(s => 
            s.average_grade >= 90 && s.completion_rate >= 90
          );
          const goodStudents = studentPerformanceData.filter(s => 
            s.average_grade >= 75 && s.average_grade < 90 && s.completion_rate >= 75
          );
          const needsHelpStudents = studentPerformanceData.filter(s => 
            (s.average_grade >= 60 && s.average_grade < 75) || 
            (s.completion_rate >= 50 && s.completion_rate < 75)
          );
          const atRiskStudents = studentPerformanceData.filter(s => 
            s.average_grade < 60 || s.completion_rate < 50
          );

          setPerformanceOverview({
            excellent_students: excellentStudents.sort((a, b) => b.average_grade - a.average_grade),
            good_students: goodStudents.sort((a, b) => b.average_grade - a.average_grade),
            needs_help_students: needsHelpStudents.sort((a, b) => a.average_grade - b.average_grade),
            at_risk_students: atRiskStudents.sort((a, b) => a.completion_rate - b.completion_rate)
          });
        } catch (profileError) {
          console.error('Error processing student profiles:', profileError);
          // Create fallback student data
          const fallbackData = uniqueStudentIds.map((studentId, index) => {
            const studentEnrollments = enrollmentsData.filter(e => e.student_id === studentId);
            const studentClassIds = studentEnrollments.map(e => e.class_id);
            const studentAssignments = assignmentsData.filter(a => studentClassIds.includes(a.class_id));
            const studentSubmissions = submissionsData.filter(s => 
              studentAssignments.some(a => a.id === s.assignment_id) && s.student_id === studentId
            );
            
            const totalAssignments = studentAssignments.length;
            const completedAssignments = studentSubmissions.length;
            const gradedSubmissions = studentSubmissions.filter(s => s.grade !== null && s.grade !== undefined);
            const averageGrade = gradedSubmissions.length > 0
              ? gradedSubmissions.reduce((sum, s) => sum + (s.grade || 0), 0) / gradedSubmissions.length
              : 0;
            const completionRate = totalAssignments > 0 ? (completedAssignments / totalAssignments) * 100 : 0;

            return {
              id: studentId,
              name: `Student ${index + 1}`,
              email: `student${index + 1}@example.com`,
              total_assignments: totalAssignments,
              completed_assignments: completedAssignments,
              average_grade: Math.round(averageGrade * 10) / 10,
              completion_rate: Math.round(completionRate * 10) / 10
            };
          });
          setStudentPerformances(fallbackData);
          
          // Calculate performance overview for fallback data
          const excellentStudents = fallbackData.filter(s => 
            s.average_grade >= 90 && s.completion_rate >= 90
          );
          const goodStudents = fallbackData.filter(s => 
            s.average_grade >= 75 && s.average_grade < 90 && s.completion_rate >= 75
          );
          const needsHelpStudents = fallbackData.filter(s => 
            (s.average_grade >= 60 && s.average_grade < 75) || 
            (s.completion_rate >= 50 && s.completion_rate < 75)
          );
          const atRiskStudents = fallbackData.filter(s => 
            s.average_grade < 60 || s.completion_rate < 50
          );

          setPerformanceOverview({
            excellent_students: excellentStudents.sort((a, b) => b.average_grade - a.average_grade),
            good_students: goodStudents.sort((a, b) => b.average_grade - a.average_grade),
            needs_help_students: needsHelpStudents.sort((a, b) => a.average_grade - b.average_grade),
            at_risk_students: atRiskStudents.sort((a, b) => a.completion_rate - b.completion_rate)
          });
        }
      }

    } catch (error) {
      console.log('ℹ️ Analytics data not available, showing empty state');
      
      // Set empty analytics data instead of showing error
      setAnalytics({
        totalClasses: 0,
        totalStudents: 0,
        totalAssignments: 0,
        totalSubmissions: 0,
        averageGrade: 0,
        submissionRate: 0
      });
      setClassAnalytics([]);
      setStudentPerformances([]);
      
      // Only set error for critical issues
      if (error instanceof Error && error.message.includes('authenticated')) {
        setError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Analytics</h1>
          <p className="text-gray-600">Loading your teaching analytics...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Analytics</h1>
        </div>
        <Card>
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-semibold mb-2">Error Loading Analytics</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={fetchAllAnalytics}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">Analytics</h1>
            <p className="text-gray-600">Overview of your teaching performance</p>
          </div>
          <Button onClick={fetchAllAnalytics} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Classes</p>
                <p className="text-2xl font-bold">{analytics.totalClasses}</p>
              </div>
              <BookOpen className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Students</p>
                <p className="text-2xl font-bold">{analytics.totalStudents}</p>
              </div>
              <Users className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Assignments</p>
                <p className="text-2xl font-bold">{analytics.totalAssignments}</p>
              </div>
              <FileText className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Grade</p>
                <p className="text-2xl font-bold">{analytics.averageGrade}%</p>
              </div>
              <Award className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <Tabs defaultValue="classes" className="space-y-6">
        <TabsList>
          <TabsTrigger value="classes">Class Analytics</TabsTrigger>
          <TabsTrigger value="students">Student Performance</TabsTrigger>
          <TabsTrigger value="performance-overview">Performance Overview</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="classes">
          <Card>
            <CardHeader>
              <CardTitle>Class Performance</CardTitle>
              <CardDescription>
                Performance metrics for each of your classes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {classAnalytics.length === 0 ? (
                <div className="text-center py-8">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-500">No classes found</p>
                  <p className="text-sm text-gray-400 mt-2">Create a class to see analytics</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {classAnalytics.map((cls) => (
                    <div key={cls.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold">{cls.name}</h3>
                          <p className="text-sm text-gray-600">
                            {cls.student_count} students • {cls.assignment_count} assignments
                          </p>
                        </div>
                        <Badge variant="outline">
                          {cls.submission_rate}% submission rate
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">Students</p>
                          <p className="font-semibold">{cls.student_count}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Assignments</p>
                          <p className="font-semibold">{cls.assignment_count}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Submissions</p>
                          <p className="font-semibold">{cls.submission_count}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Avg Grade</p>
                          <p className="font-semibold">{cls.average_grade}%</p>
                        </div>
                      </div>
                      
                      <div className="mt-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span>Submission Rate</span>
                          <span>{cls.submission_rate}%</span>
                        </div>
                        <Progress value={cls.submission_rate} className="h-2" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="students">
          <Card>
            <CardHeader>
              <CardTitle>Student Performance</CardTitle>
              <CardDescription>
                Individual student performance across all your classes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {studentPerformances.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-500">No students found</p>
                  <p className="text-sm text-gray-400 mt-2">Students will appear here once they enroll in your classes</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {studentPerformances.map((student) => (
                    <div key={student.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-medium">{student.name}</h4>
                          <p className="text-sm text-gray-600">{student.email}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant={student.completion_rate >= 80 ? 'default' : student.completion_rate >= 60 ? 'secondary' : 'destructive'}>
                            {student.completion_rate}% complete
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Assignments</p>
                          <p className="font-semibold">{student.completed_assignments}/{student.total_assignments}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Average Grade</p>
                          <p className="font-semibold">{student.average_grade}%</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Completion</p>
                          <p className="font-semibold">{student.completion_rate}%</p>
                        </div>
                      </div>
                      
                      <div className="mt-2">
                        <Progress value={student.completion_rate} className="h-2" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance-overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Excellent Students */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Star className="h-5 w-5 mr-2 text-yellow-500" />
                  Excellent Students ({performanceOverview.excellent_students.length})
                </CardTitle>
                <CardDescription>
                  Students with ≥90% grade and ≥90% completion rate - Ready for commendation
                </CardDescription>
              </CardHeader>
              <CardContent>
                {performanceOverview.excellent_students.length === 0 ? (
                  <div className="text-center py-4">
                    <Star className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-gray-500 text-sm">No excellent students yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {performanceOverview.excellent_students.map((student) => (
                      <div key={student.id} className="border rounded-lg p-3 bg-yellow-50">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-medium text-yellow-800">{student.name}</h4>
                            <p className="text-sm text-yellow-600">{student.email}</p>
                          </div>
                          <div className="text-right">
                            <Badge className="bg-yellow-100 text-yellow-800">
                              {student.average_grade}% avg
                            </Badge>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-yellow-600">Completed</p>
                            <p className="font-semibold text-yellow-800">{student.completed_assignments}/{student.total_assignments}</p>
                          </div>
                          <div>
                            <p className="text-yellow-600">Completion Rate</p>
                            <p className="font-semibold text-yellow-800">{student.completion_rate}%</p>
                          </div>
                        </div>
                        <div className="mt-2">
                          <Progress value={student.completion_rate} className="h-2" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Good Students */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <ThumbsUp className="h-5 w-5 mr-2 text-green-500" />
                  Good Students ({performanceOverview.good_students.length})
                </CardTitle>
                <CardDescription>
                  Students with 75-89% grade and ≥75% completion rate - Performing well
                </CardDescription>
              </CardHeader>
              <CardContent>
                {performanceOverview.good_students.length === 0 ? (
                  <div className="text-center py-4">
                    <ThumbsUp className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-gray-500 text-sm">No good students yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {performanceOverview.good_students.map((student) => (
                      <div key={student.id} className="border rounded-lg p-3 bg-green-50">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-medium text-green-800">{student.name}</h4>
                            <p className="text-sm text-green-600">{student.email}</p>
                          </div>
                          <div className="text-right">
                            <Badge className="bg-green-100 text-green-800">
                              {student.average_grade}% avg
                            </Badge>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-green-600">Completed</p>
                            <p className="font-semibold text-green-800">{student.completed_assignments}/{student.total_assignments}</p>
                          </div>
                          <div>
                            <p className="text-green-600">Completion Rate</p>
                            <p className="font-semibold text-green-800">{student.completion_rate}%</p>
                          </div>
                        </div>
                        <div className="mt-2">
                          <Progress value={student.completion_rate} className="h-2" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Students Needing Help */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <HelpCircle className="h-5 w-5 mr-2 text-orange-500" />
                  Needs Help ({performanceOverview.needs_help_students.length})
                </CardTitle>
                <CardDescription>
                  Students with 60-74% grade or 50-74% completion - Need additional support
                </CardDescription>
              </CardHeader>
              <CardContent>
                {performanceOverview.needs_help_students.length === 0 ? (
                  <div className="text-center py-4">
                    <HelpCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-gray-500 text-sm">No students need help</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {performanceOverview.needs_help_students.map((student) => (
                      <div key={student.id} className="border rounded-lg p-3 bg-orange-50">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-medium text-orange-800">{student.name}</h4>
                            <p className="text-sm text-orange-600">{student.email}</p>
                          </div>
                          <div className="text-right">
                            <Badge className="bg-orange-100 text-orange-800">
                              {student.average_grade}% avg
                            </Badge>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-orange-600">Completed</p>
                            <p className="font-semibold text-orange-800">{student.completed_assignments}/{student.total_assignments}</p>
                          </div>
                          <div>
                            <p className="text-orange-600">Completion Rate</p>
                            <p className="font-semibold text-orange-800">{student.completion_rate}%</p>
                          </div>
                        </div>
                        <div className="mt-2">
                          <Progress value={student.completion_rate} className="h-2" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* At-Risk Students */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertCircle className="h-5 w-5 mr-2 text-red-500" />
                  At Risk ({performanceOverview.at_risk_students.length})
                </CardTitle>
                <CardDescription>
                  Students with &lt;60% grade or &lt;50% completion - Require immediate attention
                </CardDescription>
              </CardHeader>
              <CardContent>
                {performanceOverview.at_risk_students.length === 0 ? (
                  <div className="text-center py-4">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-gray-500 text-sm">No at-risk students</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {performanceOverview.at_risk_students.map((student) => (
                      <div key={student.id} className="border rounded-lg p-3 bg-red-50">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-medium text-red-800">{student.name}</h4>
                            <p className="text-sm text-red-600">{student.email}</p>
                          </div>
                          <div className="text-right">
                            <Badge className="bg-red-100 text-red-800">
                              {student.average_grade}% avg
                            </Badge>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-red-600">Completed</p>
                            <p className="font-semibold text-red-800">{student.completed_assignments}/{student.total_assignments}</p>
                          </div>
                          <div>
                            <p className="text-red-600">Completion Rate</p>
                            <p className="font-semibold text-red-800">{student.completion_rate}%</p>
                          </div>
                        </div>
                        <div className="mt-2">
                          <Progress value={student.completion_rate} className="h-2" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Submission Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Total Submissions</span>
                    <span className="font-semibold">{analytics.totalSubmissions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Submission Rate</span>
                    <span className="font-semibold">{analytics.submissionRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Average Grade</span>
                    <span className="font-semibold">{analytics.averageGrade}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <TrendingUp className="h-4 w-4 mr-2 text-green-500" />
                      <span>Classes</span>
                    </div>
                    <span className="font-semibold">{analytics.totalClasses}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Users className="h-4 w-4 mr-2 text-blue-500" />
                      <span>Students</span>
                    </div>
                    <span className="font-semibold">{analytics.totalStudents}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-purple-500" />
                      <span>Assignments</span>
                    </div>
                    <span className="font-semibold">{analytics.totalAssignments}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}