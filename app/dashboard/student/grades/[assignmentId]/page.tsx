'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { one } from '@/lib/supabase/relations';
import { ArrowLeft, Calendar, FileText, MessageSquare } from 'lucide-react';

interface RubricLevel {
  id?: string;
  name: string;
  description?: string;
  points: number;
}

interface RubricCriterion {
  id: string;
  name: string;
  description?: string;
  weight?: number;
  levels?: RubricLevel[];
}

interface GradeDetail {
  title: string;
  description: string | null;
  className: string;
  dueDate: string | null;
  maxPoints: number;
  rubric: { name?: string; criteria?: RubricCriterion[] } | null;
  submission: {
    status: string;
    grade: number | null;
    feedback: string | null;
    submittedAt: string | null;
    gradedAt: string | null;
    rubricScores: Record<string, number>;
  } | null;
}

const letterGrade = (percent: number) =>
  percent >= 93
    ? 'A'
    : percent >= 90
      ? 'A-'
      : percent >= 87
        ? 'B+'
        : percent >= 83
          ? 'B'
          : percent >= 80
            ? 'B-'
            : percent >= 77
              ? 'C+'
              : percent >= 73
                ? 'C'
                : percent >= 70
                  ? 'C-'
                  : percent >= 67
                    ? 'D+'
                    : percent >= 60
                      ? 'D'
                      : 'F';

const gradeColor = (percent: number) =>
  percent >= 90
    ? 'text-green-600'
    : percent >= 80
      ? 'text-blue-600'
      : percent >= 70
        ? 'text-yellow-600'
        : percent >= 60
          ? 'text-orange-600'
          : 'text-red-600';

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString() : '—';

export default function StudentGradeDetailPage() {
  const params = useParams();
  const assignmentId = params.assignmentId as string;
  const { user } = useAuth();
  const [detail, setDetail] = useState<GradeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !assignmentId) return;
    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      // RLS: students only see assignments in classes they're enrolled in,
      // and only their own submission.
      const [
        { data: assignment, error: assignmentError },
        { data: submission },
      ] = await Promise.all([
        supabase
          .from('assignments')
          .select(
            'title, description, due_date, points, points_possible, rubric, classes(name)'
          )
          .eq('id', assignmentId)
          .single(),
        supabase
          .from('submissions')
          .select(
            'status, grade, feedback, submitted_at, graded_at, rubric_scores'
          )
          .eq('assignment_id', assignmentId)
          .eq('student_id', user.id)
          .maybeSingle(),
      ]);

      if (assignmentError || !assignment) {
        setError(
          "This assignment wasn't found, or you're not enrolled in its class."
        );
        setLoading(false);
        return;
      }

      setDetail({
        title: assignment.title,
        description: assignment.description,
        className:
          one(
            assignment.classes as { name: string } | { name: string }[] | null
          )?.name ?? '',
        dueDate: assignment.due_date,
        maxPoints: assignment.points_possible || assignment.points || 100,
        rubric: assignment.rubric ?? null,
        submission: submission
          ? {
              status: submission.status,
              grade: submission.grade,
              feedback: submission.feedback,
              submittedAt: submission.submitted_at,
              gradedAt: submission.graded_at,
              rubricScores:
                (
                  submission.rubric_scores as {
                    scores?: Record<string, number>;
                  } | null
                )?.scores ?? {},
            }
          : null,
      });
      setLoading(false);
    };
    load();
  }, [user, assignmentId]);

  const backLink = (
    <Link href="/dashboard/student/grades">
      <Button variant="ghost" size="sm">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Grades
      </Button>
    </Link>
  );

  if (loading) {
    return <div className="p-6 text-sm text-gray-600">Loading grade…</div>;
  }

  if (error || !detail) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        {backLink}
        <Card>
          <CardContent className="p-6 text-gray-600">
            {error ?? 'Grade not found.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { submission } = detail;
  const isGraded = submission?.status === 'graded' && submission.grade !== null;
  const percent = isGraded
    ? Math.round((submission!.grade! / detail.maxPoints) * 100)
    : 0;
  const criteria = detail.rubric?.criteria ?? [];
  const scoredCriteria = criteria.filter(
    c => submission?.rubricScores[c.id] !== undefined
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          {backLink}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold">{detail.title}</h1>
              <p className="text-gray-600 dark:text-gray-400">
                {detail.className ? `${detail.className} · ` : ''}Grade details
              </p>
            </div>
            {isGraded && (
              <Badge variant="outline">
                <Calendar className="h-3 w-3 mr-1" />
                Graded {formatDate(submission!.gradedAt)}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-6 lg:col-span-1">
            <Card>
              <CardHeader className="text-center">
                <CardTitle>Your Grade</CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                {isGraded ? (
                  <>
                    <div
                      className={`text-4xl font-bold ${gradeColor(percent)}`}
                    >
                      {letterGrade(percent)}
                    </div>
                    <div className="text-2xl text-gray-600">
                      {submission!.grade}/{detail.maxPoints}
                    </div>
                    <div className="text-lg text-gray-500">{percent}%</div>
                    <Progress value={percent} className="h-3" />
                  </>
                ) : (
                  <p className="text-gray-600">
                    {submission
                      ? 'Not graded yet. Check back after your teacher reviews it.'
                      : "You haven't submitted this assignment."}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <FileText className="h-5 w-5" />
                  <span>Assignment Details</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Due</span>
                  <span>{formatDate(detail.dueDate)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Submitted</span>
                  <span>{formatDate(submission?.submittedAt ?? null)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Max points</span>
                  <span>{detail.maxPoints}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Status</span>
                  <Badge variant={isGraded ? 'default' : 'secondary'}>
                    {isGraded
                      ? 'Graded'
                      : submission
                        ? 'Submitted'
                        : 'Not submitted'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <MessageSquare className="h-5 w-5" />
                  <span>Teacher Feedback</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isGraded && submission!.feedback ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {submission!.feedback}
                  </p>
                ) : (
                  <p className="text-sm text-gray-600">No feedback yet.</p>
                )}
              </CardContent>
            </Card>

            {isGraded && scoredCriteria.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Rubric Breakdown</CardTitle>
                  <CardDescription>
                    {detail.rubric?.name ?? 'How each criterion was scored'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {scoredCriteria.map((criterion, index) => {
                    const earned = submission!.rubricScores[criterion.id] ?? 0;
                    const levels = criterion.levels ?? [];
                    const maxPoints = levels.length
                      ? Math.max(...levels.map(l => l.points))
                      : earned;
                    const level = levels.find(l => l.points === earned);
                    return (
                      <div key={criterion.id} className="space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="font-semibold">{criterion.name}</h4>
                            {criterion.description && (
                              <p className="text-sm text-gray-600">
                                {criterion.description}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold">
                              {earned}/{maxPoints}
                            </div>
                            {criterion.weight !== undefined && (
                              <Badge variant="outline">
                                {criterion.weight}% weight
                              </Badge>
                            )}
                          </div>
                        </div>
                        {level && (
                          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                            <span className="font-medium text-sm">
                              {level.name}
                            </span>
                            {level.description && (
                              <p className="text-sm text-gray-600 mt-1">
                                {level.description}
                              </p>
                            )}
                          </div>
                        )}
                        <Progress
                          value={maxPoints ? (earned / maxPoints) * 100 : 0}
                          className="h-2"
                        />
                        {index < scoredCriteria.length - 1 && <Separator />}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
