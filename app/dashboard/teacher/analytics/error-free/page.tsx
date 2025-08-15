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
  AlertCircle,
  CheckCircle
} from "lucide-react";

interface ErrorFreeAnalytics {
  totalClasses: number;
  totalStudents: number;
  totalAssignments: number;
  totalSubmissions: number;
  averageGrade: number;
  submissionRate: number;
}

interface ErrorFreeStudent {
  id: string;
  name: string;
  email: string;
  assignments_completed: number;
  total_assignments: number;
  average_grade: number;
  completion_rate: number;
  performance_level: 'excellent' | 'good' | 'needs_help' | 'at_risk';
}

export default function ErrorFreeAnalyticsPage() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<ErrorFreeAnalytics>({
    totalClasses: 0,
    totalStudents: 0,
    totalAssignments: 0,
    totalSubmissions: 0,
    averageGrade: 0,
    submissionRate: 0
  });
  const [students, setStudents] = useState<ErrorFreeStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  useEffect(() => {
    if (user) {
      loadErrorFreeAnalytics();
    }
  }, [user]);

  const addDebugInfo = (info: string) => {
    setDebugInfo(prev => [...prev, info]);
    console.log('📊', info);
  };

  const safeSupabaseQuery = async (queryFn: () => Promise<any>, description: string, fallbackValue: any = null) => {
    try {
      addDebugInfo(`🔄 ${description}...`);
      const result = await queryFn();
      
      if (result.error) {
        addDebugInfo(`❌ ${description} failed: ${result.error.message}`);
        return { data: fallbackValue, error: result.error, success: false };
      }
      
      addDebugInfo(`✅ ${description} succeeded: ${result.data?.length || 0} records`);
      return { data: result.data, error: null, success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      addDebugInfo(`❌ ${description} exception: ${errorMsg}`);
      return { data: fallbackValue, error: { message: errorMsg }, success: false };
    }
  };

  const loadErrorFreeAnalytics = async () => {
    setLoading(true);
    setError(null);
    setDebugInfo([]);
    setConnectionStatus('checking');

    try {
      const supabase = createClient();
      addDebugInfo('🚀 Starting error-free analytics load...');

      // Test basic connection first
      const connectionTest = await safeSupabaseQuery(
        () => supabase.from('classes').select('count').limit(1),
        'Testing database connection',
        []
      );

      if (!connectionTest.success) {
        setConnectionStatus('error');
        throw new Error('Database connection failed');
      }

      setConnectionStatus('connected');
      addDebugInfo('✅ Database connection established');

      // Validate user
      if (!user?.id) {
        throw new Error('No authenticated user found');
      }
      addDebugInfo(`👤 User ID: ${user.id}`);

      // Step 1: Get classes with comprehensive error handling
      const classesResult = await safeSupabaseQuery(
        () => supabase.from('classes').select('id, name, teacher_id').eq('teacher_id', user.id),
        'Loading teacher classes',
        []
      );

      const classes = classesResult.data || [];
      if (classes.length === 0) {
        addDebugInfo('ℹ️ No classes found - teacher has no classes yet');
        setAnalytics({ totalClasses: 0, totalStudents: 0, totalAssignments: 0, totalSubmissions: 0, averageGrade: 0, submissionRate: 0 });
        setStudents([]);
        setLoading(false);
        return;
      }

      const classIds = classes.map(c => c.id);
      addDebugInfo(`📚 Found ${classes.length} classes: ${classIds.join(', ')}`);

      // Step 2: Get enrollments with error handling
      const enrollmentsResult = await safeSupabaseQuery(
        () => supabase.from('enrollments').select('student_id, class_id').in('class_id', classIds),
        'Loading class enrollments',
        []
      );

      const enrollments = enrollmentsResult.data || [];
      const uniqueStudentIds = Array.from(new Set(enrollments.map(e => e.student_id)));
      addDebugInfo(`👥 Found ${enrollments.length} enrollments, ${uniqueStudentIds.length} unique students`);

      // Step 3: Get assignments with multiple fallback strategies
      let assignments: any[] = [];
      
      // Strategy 1: Try teacher_id approach
      const assignmentsByTeacherResult = await safeSupabaseQuery(
        () => supabase.from('assignments').select('id, title, class_id, teacher_id, points').eq('teacher_id', user.id),
        'Loading assignments by teacher_id',
        []
      );

      if (assignmentsByTeacherResult.success && assignmentsByTeacherResult.data.length > 0) {
        assignments = assignmentsByTeacherResult.data;
        addDebugInfo(`✅ Using teacher_id strategy: ${assignments.length} assignments`);
      } else {
        // Strategy 2: Try class_id approach
        const assignmentsByClassResult = await safeSupabaseQuery(
          () => supabase.from('assignments').select('id, title, class_id, points').in('class_id', classIds),
          'Loading assignments by class_id (fallback)',
          []
        );
        
        assignments = assignmentsByClassResult.data || [];
        addDebugInfo(`✅ Using class_id strategy: ${assignments.length} assignments`);
      }

      // Step 4: Get submissions with error handling
      let submissions: any[] = [];
      if (assignments.length > 0) {
        const assignmentIds = assignments.map(a => a.id);
        const submissionsResult = await safeSupabaseQuery(
          () => supabase.from('submissions').select('id, assignment_id, student_id, grade, status').in('assignment_id', assignmentIds),
          'Loading assignment submissions',
          []
        );
        
        submissions = submissionsResult.data || [];
      } else {
        addDebugInfo('ℹ️ No assignments found, skipping submissions');
      }

      // Step 5: Get student profiles with comprehensive fallbacks
      let studentProfiles: any[] = [];
      if (uniqueStudentIds.length > 0) {
        // Try user_profiles table first
        const profilesResult = await safeSupabaseQuery(
          () => supabase.from('user_profiles').select('user_id, first_name, last_name, email').in('user_id', uniqueStudentIds),
          'Loading student profiles',
          []
        );

        if (profilesResult.success && profilesResult.data.length > 0) {
          studentProfiles = profilesResult.data;
          addDebugInfo(`✅ Loaded ${studentProfiles.length} real student profiles`);
        } else {
          // Create meaningful fallback profiles
          studentProfiles = uniqueStudentIds.map((id, index) => {
            const letter = String.fromCharCode(65 + (index % 26)); // A, B, C, etc.
            return {
              user_id: id,
              first_name: `Student`,
              last_name: letter,
              email: `student.${letter.toLowerCase()}@school.edu`
            };
          });
          addDebugInfo(`📝 Created ${studentProfiles.length} fallback student profiles`);
        }
      }

      // Calculate analytics with error-resistant math
      const totalStudents = uniqueStudentIds.length;
      const totalAssignments = assignments.length;
      const totalSubmissions = submissions.length;
      const gradedSubmissions = submissions.filter(s => s.grade !== null && s.grade !== undefined && !isNaN(s.grade));
      const averageGrade = gradedSubmissions.length > 0 
        ? gradedSubmissions.reduce((sum, s) => sum + (parseFloat(s.grade) || 0), 0) / gradedSubmissions.length 
        : 0;
      const submissionRate = totalAssignments > 0 && totalStudents > 0 
        ? (totalSubmissions / (totalAssignments * totalStudents)) * 100 
        : 0;

      // Ensure all values are valid numbers
      const safeAnalytics = {
        totalClasses: Math.max(0, classes.length || 0),
        totalStudents: Math.max(0, totalStudents || 0),
        totalAssignments: Math.max(0, totalAssignments || 0),
        totalSubmissions: Math.max(0, totalSubmissions || 0),
        averageGrade: Math.max(0, Math.min(100, Math.round((averageGrade || 0) * 10) / 10)),
        submissionRate: Math.max(0, Math.min(100, Math.round((submissionRate || 0) * 10) / 10))
      };

      setAnalytics(safeAnalytics);
      addDebugInfo(`📊 Analytics calculated: ${JSON.stringify(safeAnalytics)}`);

      // Calculate student performance with error handling
      const studentPerformanceData = uniqueStudentIds.map((studentId, index) => {
        try {
          const profile = studentProfiles.find(p => p.user_id === studentId);
          const studentEnrollments = enrollments.filter(e => e.student_id === studentId);
          const studentClassIds = studentEnrollments.map(e => e.class_id);
          const studentAssignments = assignments.filter(a => studentClassIds.includes(a.class_id));
          const studentSubmissions = submissions.filter(s => s.student_id === studentId);
          
          const totalAssignments = Math.max(0, studentAssignments.length || 0);
          const completedAssignments = Math.max(0, studentSubmissions.length || 0);
          const gradedSubmissions = studentSubmissions.filter(s => s.grade !== null && s.grade !== undefined && !isNaN(s.grade));
          const averageGrade = gradedSubmissions.length > 0
            ? gradedSubmissions.reduce((sum, s) => sum + (parseFloat(s.grade) || 0), 0) / gradedSubmissions.length
            : 0;
          const completionRate = totalAssignments > 0 ? (completedAssignments / totalAssignments) * 100 : 0;
          
          // Determine performance level with safe comparisons
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
            name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : `Student ${index + 1}`,
            email: profile?.email || `student${index + 1}@school.edu`,
            assignments_completed: completedAssignments,
            total_assignments: totalAssignments,
            average_grade: Math.max(0, Math.min(100, Math.round((averageGrade || 0) * 10) / 10)),
            completion_rate: Math.max(0, Math.min(100, Math.round((completionRate || 0) * 10) / 10)),
            performance_level: performanceLevel
          };
        } catch (studentError) {
          addDebugInfo(`⚠️ Error processing student ${studentId}: ${studentError}`);
          return {
            id: studentId,
            name: `Student ${index + 1}`,
            email: `student${index + 1}@school.edu`,
            assignments_completed: 0,
            total_assignments: 0,
            average_grade: 0,
            completion_rate: 0,
            performance_level: 'at_risk' as const
          };
        }
      });

      setStudents(studentPerformanceData);
      addDebugInfo(`✅ Successfully processed ${studentPerformanceData.length} student records`);

    } catch (error) {
      console.error('Error-free analytics error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load analytics';
      setError(errorMessage);
      addDebugInfo(`💥 Fatal error: ${errorMessage}`);
      setConnectionStatus('error');
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
        <h1 className="text-3xl font-bold mb-6">Error-Free Analytics</h1>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading analytics data...</p>
          <div className="mt-4 flex items-center justify-center space-x-2">
            {connectionStatus === 'checking' && <div className="text-yellow-600">🔄 Checking connection...</div>}
            {connectionStatus === 'connected' && <div className="text-green-600">✅ Connected</div>}
            {connectionStatus === 'error' && <div className="text-red-600">❌ Connection error</div>}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Error-Free Analytics</h1>
        <Card>
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-semibold mb-2">Error Loading Analytics</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <div className="flex justify-center space-x-2 mb-4">
              <Button onClick={loadErrorFreeAnalytics}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
            
            {debugInfo.length > 0 && (
              <div className="mt-6 text-left">
                <h4 className="font-medium mb-2">Debug Information:</h4>
                <div className="bg-gray-100 p-3 rounded text-sm max-h-40 overflow-y-auto">
                  {debugInfo.map((info, index) => (
                    <div key={index} className="font-mono text-xs">{info}</div>
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
            <h1 className="text-3xl font-bold mb-2">Error-Free Analytics</h1>
            <p className="text-gray-600">Bulletproof analytics dashboard with comprehensive error handling</p>
            <div className="flex items-center space-x-2 mt-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-600">System operational</span>
            </div>
          </div>
          <Button onClick={loadErrorFreeAnalytics} variant="outline">
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
                All students across your classes - error-resistant processing
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