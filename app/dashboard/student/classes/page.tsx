'use client';

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { one } from '@/lib/supabase/relations';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  BookOpen,
  Users,
  Calendar,
  Clock,
  FileText,
  Award,
  Plus,
} from 'lucide-react';

import { averagePercent } from '@/lib/grades';
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
  /** Percent of points earned on graded work; null when nothing is graded. */
  average_grade: number | null;
  graded_points: number;
  graded_points_possible: number;
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
    if (!user) return;
    try {
      const supabase = createClient();

      // One query for the student's current classes, each with its
      // assignments and the student's own submissions (RLS returns only
      // theirs), then one query for all their teachers' names.
      const { data: enrollments, error } = await supabase
        .from('enrollments')
        .select(
          `
          enrolled_at,
          classes (
            id,
            name,
            description,
            teacher_id,
            assignments (
              id,
              title,
              due_date,
              points_possible,
              submissions ( id, grade, submitted_at )
            )
          )
        `
        )
        .eq('student_id', user.id)
        .in('status', ['enrolled', 'active']);

      if (error) {
        console.error('Error loading enrollments:', error);
        setError(`Failed to load your classes: ${error.message}`);
        return;
      }

      type Submission = {
        id: string;
        grade: number | null;
        submitted_at: string | null;
      };
      type ClassRow = {
        id: string;
        name: string;
        description: string | null;
        teacher_id: string;
        assignments: {
          id: string;
          title: string;
          due_date: string | null;
          points_possible: number;
          submissions: Submission[];
        }[];
      };
      const rows = (enrollments ?? [])
        .map(e => ({
          enrolledAt: e.enrolled_at as string,
          cls: one(e.classes as ClassRow | ClassRow[] | null),
        }))
        .filter((r): r is { enrolledAt: string; cls: ClassRow } => !!r.cls);

      const teacherIds = Array.from(new Set(rows.map(r => r.cls.teacher_id)));
      const { data: teachers } = teacherIds.length
        ? await supabase
            .from('users')
            .select('id, first_name, last_name')
            .in('id', teacherIds)
        : { data: [] };
      const teacherNames = new Map(
        (teachers ?? []).map(t => [
          t.id,
          `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() ||
            'Unknown Teacher',
        ])
      );

      const now = new Date();
      setClasses(
        rows.map(({ enrolledAt, cls }) => {
          const assignments = cls.assignments ?? [];
          const submitted = assignments.filter(a =>
            a.submissions.some(s => s.submitted_at)
          );
          const graded = assignments
            .map(a => ({
              grade: a.submissions[0]?.grade,
              pointsPossible: a.points_possible,
            }))
            .filter(
              (g): g is { grade: number; pointsPossible: number } =>
                g.grade !== null && g.grade !== undefined
            );
          const upcoming = assignments
            .filter(
              a =>
                a.due_date &&
                new Date(a.due_date) > now &&
                !a.submissions.some(s => s.submitted_at)
            )
            .sort(
              (a, b) =>
                new Date(a.due_date!).getTime() -
                new Date(b.due_date!).getTime()
            );

          return {
            id: cls.id,
            name: cls.name,
            description: cls.description ?? '',
            teacher_name: teacherNames.get(cls.teacher_id) ?? 'Unknown Teacher',
            teacher_id: cls.teacher_id,
            enrollment_date: enrolledAt,
            status: 'active' as const,
            total_assignments: assignments.length,
            completed_assignments: submitted.length,
            pending_assignments: assignments.length - submitted.length,
            average_grade: averagePercent(graded),
            graded_points: graded.reduce((sum, g) => sum + g.grade, 0),
            graded_points_possible: graded.reduce(
              (sum, g) => sum + g.pointsPossible,
              0
            ),
            ...(upcoming[0]
              ? {
                  next_assignment_due: upcoming[0].due_date!,
                  next_assignment_title: upcoming[0].title,
                }
              : {}),
          };
        })
      );
    } catch (error) {
      console.error('Error loading classes:', error);
      setError('Failed to load classes');
    } finally {
      setLoadingClasses(false);
    }
  };

  // Points earned over points possible across every class, so bigger
  // assignments weigh more.
  const overallPoints = classes.reduce(
    (acc, c) => ({
      earned: acc.earned + c.graded_points,
      possible: acc.possible + c.graded_points_possible,
    }),
    { earned: 0, possible: 0 }
  );
  const overallPercent =
    overallPoints.possible > 0
      ? (overallPoints.earned / overallPoints.possible) * 100
      : null;

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
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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
              <p className="text-gray-600">
                Manage your enrolled classes, {getUserDisplayName()}
              </p>
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
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Classes Yet
              </h3>
              <p className="text-gray-600 mb-4">
                You&apos;re not enrolled in any classes yet. Join a class to
                start learning!
              </p>
              <Button
                onClick={() => router.push('/dashboard/student/classes/join')}
              >
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
                    <div className="text-sm text-gray-500">
                      Enrolled Classes
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {classes.reduce(
                        (sum, c) => sum + c.completed_assignments,
                        0
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      Completed Assignments
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {classes.reduce(
                        (sum, c) => sum + c.pending_assignments,
                        0
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      Pending Assignments
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div
                      className={`text-2xl font-bold ${
                        overallPercent !== null
                          ? getGradeColor(overallPercent)
                          : 'text-gray-400'
                      }`}
                    >
                      {overallPercent !== null
                        ? getLetterGrade(overallPercent)
                        : 'N/A'}
                    </div>
                    <div className="text-sm text-gray-500">Overall Grade</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Classes List */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {classes.map(classItem => (
                <Card
                  key={classItem.id}
                  className="hover:shadow-lg transition-shadow"
                >
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-lg">
                          {classItem.name}
                        </CardTitle>
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
                    <p className="text-gray-600 text-sm">
                      {classItem.description}
                    </p>

                    {/* Progress */}
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Assignment Progress</span>
                        <span>
                          {classItem.completed_assignments}/
                          {classItem.total_assignments}
                        </span>
                      </div>
                      <Progress
                        value={
                          classItem.total_assignments > 0
                            ? (classItem.completed_assignments /
                                classItem.total_assignments) *
                              100
                            : 0
                        }
                      />
                    </div>

                    {/* Grade */}
                    {classItem.average_grade !== null && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">
                          Current Grade:
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold ${getGradeColor(classItem.average_grade)}`}
                          >
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
                          <span className="font-medium">
                            Next Assignment Due
                          </span>
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
                        <div className="font-medium text-blue-600">
                          {classItem.total_assignments}
                        </div>
                        <div className="text-gray-500">Total</div>
                      </div>
                      <div>
                        <div className="font-medium text-green-600">
                          {classItem.completed_assignments}
                        </div>
                        <div className="text-gray-500">Done</div>
                      </div>
                      <div>
                        <div className="font-medium text-yellow-600">
                          {classItem.pending_assignments}
                        </div>
                        <div className="text-gray-500">Pending</div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() =>
                          router.push(
                            `/dashboard/student/classes/${classItem.id}`
                          )
                        }
                      >
                        <BookOpen className="h-4 w-4 mr-2" />
                        Enter Class
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          router.push(
                            `/dashboard/student/assignments?class=${classItem.id}`
                          )
                        }
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
