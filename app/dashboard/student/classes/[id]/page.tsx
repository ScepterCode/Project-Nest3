"use client";

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Users, Calendar, Clock, FileText, Award, ArrowLeft, User, Mail, GraduationCap } from 'lucide-react';

interface ClassDetail {
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
  assignments: Assignment[];
  classmates: Classmate[];
}

interface Assignment {
  id: string;
  title: string;
  description: string;
  due_date: string;
  points_possible: number;
  status: 'upcoming' | 'active' | 'submitted' | 'graded' | 'overdue';
  grade?: number;
  submitted_at?: string;
}

interface Classmate {
  id: string;
  name: string;
  email: string;
  enrollment_date: string;
}

export default function StudentClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const resolvedParams = use(params);
  const classId = resolvedParams.id;
  
  const [classDetail, setClassDetail] = useState<ClassDetail | null>(null);
  const [loadingClass, setLoadingClass] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && classId) {
      loadClassDetail();
    }
  }, [user, classId]);

  const loadClassDetail = async () => {
    try {
      const supabase = createClient();
      
      // First, verify the student is enrolled in this class
      const { data: enrollment, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('*')
        .eq('class_id', classId)
        .eq('student_id', user.id)
        .single();

      if (enrollmentError || !enrollment) {
        setError('You are not enrolled in this class or it does not exist.');
        return;
      }

      // Get class details
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select(`
          id,
          name,
          description,
          teacher_id,
          status,
          created_at
        `)
        .eq('id', classId)
        .single();

      if (classError || !classData) {
        setError('Class not found.');
        return;
      }

      // Get teacher information
      const { data: teacherData } = await supabase
        .from('users')
        .select('first_name, last_name, email')
        .eq('id', classData.teacher_id)
        .single();

      const teacherName = teacherData 
        ? `${teacherData.first_name} ${teacherData.last_name}`
        : 'Unknown Teacher';

      // Get assignments for this class
      const { data: assignmentsData } = await supabase
        .from('assignments')
        .select(`
          id,
          title,
          description,
          due_date,
          points_possible,
          status,
          submissions(
            id,
            grade,
            submitted_at,
            status
          )
        `)
        .eq('class_id', classId)
        .order('due_date', { ascending: true });

      // Process assignments
      const assignments: Assignment[] = (assignmentsData || []).map(assignment => {
        const submission = assignment.submissions.find(s => s.student_id === user.id);
        let status: Assignment['status'] = 'upcoming';
        
        if (assignment.due_date && new Date(assignment.due_date) < new Date()) {
          if (submission?.submitted_at) {
            status = submission.grade !== null ? 'graded' : 'submitted';
          } else {
            status = 'overdue';
          }
        } else if (submission?.submitted_at) {
          status = submission.grade !== null ? 'graded' : 'submitted';
        } else {
          status = 'active';
        }

        return {
          id: assignment.id,
          title: assignment.title,
          description: assignment.description,
          due_date: assignment.due_date,
          points_possible: assignment.points_possible,
          status,
          grade: submission?.grade,
          submitted_at: submission?.submitted_at
        };
      });

      // Get classmates
      const { data: classmatesData } = await supabase
        .from('enrollments')
        .select(`
          student_id,
          enrolled_at,
          users(
            first_name,
            last_name,
            email
          )
        `)
        .eq('class_id', classId)
        .eq('status', 'active')
        .neq('student_id', user.id);

      const classmates: Classmate[] = (classmatesData || []).map(enrollment => ({
        id: enrollment.student_id,
        name: enrollment.users 
          ? `${enrollment.users.first_name} ${enrollment.users.last_name}`
          : 'Unknown Student',
        email: enrollment.users?.email || 'unknown@email.com',
        enrollment_date: enrollment.enrolled_at
      }));

      // Calculate statistics
      const totalAssignments = assignments.length;
      const completedAssignments = assignments.filter(a => a.status === 'graded' || a.status === 'submitted').length;
      const gradedAssignments = assignments.filter(a => a.status === 'graded' && a.grade !== null);
      const averageGrade = gradedAssignments.length > 0 
        ? gradedAssignments.reduce((sum, a) => sum + (a.grade || 0), 0) / gradedAssignments.length
        : 0;

      setClassDetail({
        id: classData.id,
        name: classData.name,
        description: classData.description,
        teacher_name: teacherName,
        teacher_id: classData.teacher_id,
        enrollment_date: enrollment.enrolled_at,
        status: 'active',
        total_assignments: totalAssignments,
        completed_assignments: completedAssignments,
        pending_assignments: totalAssignments - completedAssignments,
        average_grade: averageGrade,
        assignments,
        classmates
      });

    } catch (error) {
      console.error('Error loading class detail:', error);
      setError('Failed to load class details');
    } finally {
      setLoadingClass(false);
    }
  };

  const getStatusBadge = (status: Assignment['status']) => {
    const variants = {
      upcoming: { variant: 'secondary' as const, text: 'Upcoming' },
      active: { variant: 'default' as const, text: 'Active' },
      submitted: { variant: 'outline' as const, text: 'Submitted' },
      graded: { variant: 'default' as const, text: 'Graded' },
      overdue: { variant: 'destructive' as const, text: 'Overdue' }
    };
    
    const config = variants[status];
    return <Badge variant={config.variant}>{config.text}</Badge>;
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

  if (loading || loadingClass) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="text-center py-12">
            <div className="text-red-600 mb-4">
              <FileText className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={() => router.push('/dashboard/student/classes')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Classes
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!classDetail) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg">Class not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => router.push('/dashboard/student/classes')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Classes
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{classDetail.name}</h1>
                <p className="text-gray-600">Taught by {classDetail.teacher_name}</p>
              </div>
            </div>
            <Badge variant="secondary">Enrolled</Badge>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {classDetail.total_assignments}
                </div>
                <div className="text-sm text-gray-500">Total Assignments</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {classDetail.completed_assignments}
                </div>
                <div className="text-sm text-gray-500">Completed</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {classDetail.pending_assignments}
                </div>
                <div className="text-sm text-gray-500">Pending</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {classDetail.average_grade > 0 ? `${classDetail.average_grade.toFixed(1)}%` : 'N/A'}
                </div>
                <div className="text-sm text-gray-500">Average Grade</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="assignments" className="space-y-6">
          <TabsList>
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
            <TabsTrigger value="classmates">Classmates</TabsTrigger>
            <TabsTrigger value="details">Class Details</TabsTrigger>
          </TabsList>

          <TabsContent value="assignments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Assignments</CardTitle>
                <CardDescription>
                  View and manage your assignments for this class
                </CardDescription>
              </CardHeader>
              <CardContent>
                {classDetail.assignments.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No assignments yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {classDetail.assignments.map((assignment) => (
                      <div key={assignment.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <h4 className="font-medium">{assignment.title}</h4>
                            <p className="text-sm text-gray-600 mt-1">{assignment.description}</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            {getStatusBadge(assignment.status)}
                            {assignment.grade !== null && (
                              <Badge variant="outline">
                                {assignment.grade}/{assignment.points_possible}
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center text-sm text-gray-500">
                          <div className="flex items-center space-x-4">
                            {assignment.due_date && (
                              <div className="flex items-center space-x-1">
                                <Clock className="h-4 w-4" />
                                <span>Due: {formatDateTime(assignment.due_date)}</span>
                              </div>
                            )}
                            {assignment.submitted_at && (
                              <div className="flex items-center space-x-1">
                                <FileText className="h-4 w-4" />
                                <span>Submitted: {formatDateTime(assignment.submitted_at)}</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => router.push(`/dashboard/student/assignments/${assignment.id}`)}
                            >
                              View Details
                            </Button>
                            {assignment.status === 'active' && (
                              <Button
                                size="sm"
                                onClick={() => router.push(`/dashboard/student/assignments/${assignment.id}/submit`)}
                              >
                                Submit Work
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="classmates" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Classmates ({classDetail.classmates.length})</CardTitle>
                <CardDescription>
                  Other students enrolled in this class
                </CardDescription>
              </CardHeader>
              <CardContent>
                {classDetail.classmates.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No other students enrolled yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {classDetail.classmates.map((classmate) => (
                      <div key={classmate.id} className="border rounded-lg p-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <User className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">{classmate.name}</h4>
                            <p className="text-sm text-gray-600 flex items-center">
                              <Mail className="h-3 w-3 mr-1" />
                              {classmate.email}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              Enrolled: {formatDate(classmate.enrollment_date)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Class Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Description</h4>
                  <p className="text-gray-600">{classDetail.description || 'No description provided'}</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Teacher</h4>
                    <div className="flex items-center space-x-2">
                      <GraduationCap className="h-4 w-4 text-gray-500" />
                      <span>{classDetail.teacher_name}</span>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Enrollment Date</h4>
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span>{formatDate(classDetail.enrollment_date)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Progress</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Assignments Completed</span>
                      <span>{classDetail.completed_assignments}/{classDetail.total_assignments}</span>
                    </div>
                    <Progress 
                      value={classDetail.total_assignments > 0 
                        ? (classDetail.completed_assignments / classDetail.total_assignments) * 100 
                        : 0
                      } 
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}