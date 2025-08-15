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
  RefreshCw,
  AlertTriangle,
  Star,
  AlertCircle
} from "lucide-react";

interface RobustAnalytics {
  totalClasses: number;
  totalStudents: number;
  totalAssignments: number;
  totalSubmissions: number;
  averageGrade: number;
  submissionRate: number;
}

interface RobustStudent {
  id: string;
  name: string;
  email: string;
  assignments_completed: number;
  total_assignments: number;
  average_grade: number;
  completion_rate: number;
  performance_level: 'excellent' | 'good' | 'needs_help' | 'at_risk';
}

export default function RobustAnalyticsPage() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<RobustAnalytics>({
    totalClasses: 0,
    totalStudents: 0,
    totalAssignments: 0,
    totalSubmissions: 0,
    averageGrade: 0,
    submissionRate: 0
  });
  const [students, setStudents] = useState<RobustStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      loadRobustAnalytics();
    }
  }, [user]);

  const addDebugInfo = (info: string) => {
    setDebugInfo(prev => [...prev, info]);
    console.log('📊', info);
  };

  const safeQuery = async (queryFn: () => Promise<any>, description: string) => {
    try {
      const result = await queryFn();
      if (result.error) {
        addDebugInfo(`❌ ${description}: ${result.error.message}`);
        return { data: null, error: result.error };
      }
      addDebugInfo(`✅ ${description}: ${result.data?.length || 0} records`);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      addDebugInfo(`❌ ${description} failed: ${errorMsg}`);
      return { data: null, error: { message: errorMsg } };
    }
  };

  const loadRobustAnalytics = async () => {
    setLoading(true);
    setError(null);
    setDebugInfo([]);

    try {
      const supabase = createClient();
      addDebugInfo('Starting robust analytics load...');

      // Validate user
      if (!user?.id) {
        throw new Error('No authenticated user found');
      }
      addDebugInfo(`User ID: ${user.id}`);

      // Step 1: Get classes with error handling
      const classesResult = await safeQuery(
        () => supabase.from('classes').select('id, name, teacher_id').eq('teacher_id', user.id),
        'Loading classes'
      );

      if (classesResult.error || !classesResult.data) {
        throw new Error(`Failed to load classes: ${classesResult.error?.message || 'No data'}`);
      }

      const classes = classesResult.data;
      if (classes.length === 0) {
        addDebugInfo('No classes found - teacher has no classes yet');
        setAnalytics({ totalClasses: 0, totalStudents: 0, totalAssignments: 0, totalSubmissions: 0, averageGrade: 0, submissionRate: 0 });
        setStudents([]);
        setLoading(false);
        return;
      }

      const classIds = classes.map(c => c.id);
      addDebugInfo(`Found ${classes.length} classes: ${classIds.join(', ')}`);

      // Step 2: Get enrollments
      const enrollmentsResult = await safeQuery(
        () => supabase.from('enrollments').select('student_id, class_id').in('class_id', classIds),
        'Loading enrollments'
      );

      const enrollments = enrollmentsResult.data || [];
      const uniqueStudentIds = Array.from(new Set(enrollments.map(e => e.student_id)));
      addDebugInfo(`Found ${enrollments.length} enrollments, ${uniqueStudentIds.length} unique students`);

      // Step 3: Get assignments with multiple fallback strategies
      let assignments: any[] = [];
      
      // Strategy 1: Try teacher_id
      const assignmentsByTeacherResult = await safeQuery(
        () => supabase.from('assignments').select('id, title, class_id, teacher_id, points').eq('teacher_id', user.id),
        'Loading assignments by teacher_id'
      );

      if (assignmentsByTeacherResult.data && assignmentsByTeacherResult.data.length > 0) {
        assignments = assignmentsByTeacherResult.data;
      } else {
        // Strategy 2: Try class_id
        const assignmentsByClassResult = await safeQuery(
          () => supabase.from('assignments').select('id, title, class_id, points').in('class_id', classIds),
          'Loading assignments by class_id'
        );
        assignments = assignmentsByClassResult.data || [];
      }

      addDebugInfo(`Final assignments count: ${assignments.length}`);

      // Step 4: Get submissions
      let submissions: any[] = [];
      if (assignments.length > 0) {
        const assignmentIds = assignments.map(a => a.id);
        const submissionsResult = await safeQuery(
          () => supabase.from('submissions').select('id, assignment_id, student_id, grade, status').in('assignment_id', assignmentIds),
          'Loading submissions'
        );
        submissions = submissionsResult.data || [];
      }

      // Step 5: Get student profiles with fallbacks
      let studentProfiles: any[] = [];
      if (uniqueStudentIds.length > 0) {
        const profilesResult = await safeQuery(
          () => supabase.from('user_profiles').select('user_id, first_name, last_name, email').in('user_id', uniqueStudentIds),
          'Loading student profiles'
        );

        if (profilesResult.data && profilesResult.data.length > 0) {
          studentProfiles = profilesResult.data;
        } else {
          // Create meaningful fallback profiles
          studentProfiles = uniqueStudentIds.map((id, index) => {
            const letter = String.fromCharCode(65 + (index % 26));
            return {
              user_id: id,
              first_name: `Student`,
              last_name: letter,
              email: `student.${letter.toLowerCase()}@school.edu`
            };
          });
          addDebugInfo(`Created ${studentProfiles.length} fallback student profiles`);
        }
      }

      // Calculate analytics
      const totalStudents = uniqueStudentIds.length;
      const totalAssignments = assignments.length;
      const totalSubmissions = submissions.length;
      const gradedSubmissions = submissions.filter(s => s.grade !== null && s.grade !== undefined);
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

      // Calculate student performance
      const studentPerformanceData = uniqueStudentIds.map(studentId => {
        const profile = studentProfiles.find(p => p.user_id === studentId);
        const studentEnrollments = enrollments.filter(e => e.student_id === studentId);
        const studentClassIds = studentEnrollments.map(e => e.class_id);
        const studentAssignments = assignments.filter(a => studentClassIds.includes(a.class_id));
        const studentSubmissions = submissions.filter(s => s.student_id === studentId);
        
        const totalAssignments = studentAssignments.length;
        const completedAssignments = studentSubmissions.length;
        const gradedSubmissions = studentSubmissions.filter(s => s.grade !== null && s.grade !== undefined);
        const averageGrade = gradedSubmissions.length > 0
          ? gradedSubmissions.reduce((sum, s) => sum + (s.grade || 0), 0) / gradedSubmissions.length
          : 0;
        const completionRate = totalAssignments > 0 ? (completedAssignments / totalAssignments) * 100 : 0;
        
        // Determine performance level
        let performanceLevel: 'excellent' | 'good' | 'needs_help' | 'at_risk' = 'at_risk';
        if (averageGrade >= 90 && completionRate >= 90) {
          performanceLevel = 'excellent';
        } else if (averageGrade >= 75 && completionRate >= 75) {
          performanceLevel = 'good';
        } else if (averageGrade >= 60 || completionRate >= 50) {
          performanceLevel = 'needs_help';
        }

        return {
          id: studentId,
          name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : `Student ${studentId.slice(-4)}`,
          email: profile?.email || `student-${studentId.slice(-4)}@school.edu`,
          assignments_completed: completedAssignments,
          total_assignments: totalAssignments,
          average_grade: Math.round(averageGrade * 10) / 10,
          completion_rate: Math.round(completionRate * 10) / 10,
          performance_level: performanceLevel
        };
      });

      setStudents(studentPerformanceData);
      addDebugInfo(`Successfully processed analytics for ${studentPerformanceData.length} students`);

    } catch (error) {
      console.error('Robust analytics error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load analytics';
      setError(errorMessage);
      addDebugInfo(`Fatal error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const getPerformanceColor = (level: string) => {
    switch (level) {
      case 'excellent': return 'bg-yellow-50 border-yellow-200';
      case 'good': return 'bg-green-50 border-green-200';
      case 'needs_help': return 'bg-orange-50 border-orange-200';
      case 'at_risk': return 'bg-red-50 border-red-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const getPerformanceBadge = (level: string, grade: number) => {
    switch (level) {
      case 'excellent': return <Badge className="bg-yellow-100 text-yellow-800">Excellent ({grade}%)</Badge>;
      case 'good': return <Badge className="bg-green-100 text-green-800">Good ({grade}%)</Badge>;
      case 'needs_help': return <Badge className="bg-orange-100 text-orange-800">Needs Help ({grade}%)</Badge>;
      case 'at_risk': return <Badge className="bg-red-100 text-red-800">At Risk ({grade}%)</Badge>;
      default: return <Badge variant="secondary">No Data</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Robust Analytics</h1>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading analytics data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Robust Analytics</h1>
        <Card>
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-semibold mb-2">Error Loading Analytics</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={loadRobustAnalytics}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            
            {debugInfo.length > 0 && (
              <div className="mt-6 text-left">
                <h4 className="font-medium mb-2">Debug Information:</h4>
                <div className="bg-gray-100 p-3 rounded text-sm max-h-40 overflow-y-auto">
                  {debugInfo.map((info, index) => (
                    <div key={index} className="font-mono">{info}</div>
                  ))}
                </div>
              </div>
            )}
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
            <h1 className="text-3xl font-bold mb-2">Robust Analytics</h1>
            <p className="text-gray-600">Error-resistant analytics dashboard</p>
          </div>
          <Button onClick={loadRobustAnalytics} variant="outline">
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

      {/* Student Performance */}
      <Tabs defaultValue="all-students" className="space-y-6">
        <TabsList>
          <TabsTrigger value="all-students">All Students</TabsTrigger>
          <TabsTrigger value="performance-levels">Performance Levels</TabsTrigger>
          <TabsTrigger value="debug">Debug Info</TabsTrigger>
        </TabsList>

        <TabsContent value="all-students">
          <Card>
            <CardHeader>
              <CardTitle>Student Performance ({students.length})</CardTitle>
              <CardDescription>
                All students across your classes with robust error handling
              </CardDescription>
            </CardHeader>
            <CardContent>
              {students.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-500">No students found</p>
                  <p className="text-sm text-gray-400 mt-2">Students will appear here once they enroll in your classes</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {students.map((student) => (
                    <div key={student.id} className={`border rounded-lg p-4 ${getPerformanceColor(student.performance_level)}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-medium">{student.name}</h4>
                          <p className="text-sm text-gray-600">{student.email}</p>
                        </div>
                        <div className="text-right">
                          {getPerformanceBadge(student.performance_level, student.average_grade)}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Assignments</p>
                          <p className="font-semibold">{student.assignments_completed}/{student.total_assignments}</p>
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

        <TabsContent value="performance-levels">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Excellent Students */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Star className="h-5 w-5 mr-2 text-yellow-500" />
                  Excellent Students
                </CardTitle>
                <CardDescription>≥90% grade and completion - Ready for commendation</CardDescription>
              </CardHeader>
              <CardContent>
                {students.filter(s => s.performance_level === 'excellent').length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No excellent students yet</p>
                ) : (
                  <div className="space-y-2">
                    {students.filter(s => s.performance_level === 'excellent').map(student => (
                      <div key={student.id} className="p-3 bg-yellow-50 rounded border">
                        <div className="font-medium">{student.name}</div>
                        <div className="text-sm text-gray-600">{student.average_grade}% avg • {student.assignments_completed}/{student.total_assignments} completed</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* At Risk Students */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertCircle className="h-5 w-5 mr-2 text-red-500" />
                  At Risk Students
                </CardTitle>
                <CardDescription>&lt;60% grade or &lt;50% completion - Need immediate help</CardDescription>
              </CardHeader>
              <CardContent>
                {students.filter(s => s.performance_level === 'at_risk').length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No at-risk students</p>
                ) : (
                  <div className="space-y-2">
                    {students.filter(s => s.performance_level === 'at_risk').map(student => (
                      <div key={student.id} className="p-3 bg-red-50 rounded border">
                        <div className="font-medium">{student.name}</div>
                        <div className="text-sm text-gray-600">{student.average_grade}% avg • {student.assignments_completed}/{student.total_assignments} completed</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="debug">
          <Card>
            <CardHeader>
              <CardTitle>Debug Information</CardTitle>
              <CardDescription>Technical details about data loading process</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-100 p-4 rounded max-h-96 overflow-y-auto">
                {debugInfo.length === 0 ? (
                  <p>No debug information available</p>
                ) : (
                  <div className="space-y-1 text-sm font-mono">
                    {debugInfo.map((info, index) => (
                      <div key={index}>{info}</div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}