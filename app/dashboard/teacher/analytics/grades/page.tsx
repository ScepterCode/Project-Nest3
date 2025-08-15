"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Award, TrendingUp, Users, AlertTriangle, RefreshCw } from "lucide-react";

interface GradeStats {
  totalGradedSubmissions: number;
  averageGrade: number;
  highestGrade: number;
  lowestGrade: number;
  passingRate: number;
}

interface GradeDistribution {
  range: string;
  count: number;
  percentage: number;
}

interface AssignmentGrades {
  id: string;
  title: string;
  averageGrade: number;
  submissionCount: number;
  gradedCount: number;
}

export default function GradeAnalyticsPage() {
  const { user } = useAuth();
  const [gradeStats, setGradeStats] = useState<GradeStats>({
    totalGradedSubmissions: 0,
    averageGrade: 0,
    highestGrade: 0,
    lowestGrade: 0,
    passingRate: 0
  });
  const [gradeDistribution, setGradeDistribution] = useState<GradeDistribution[]>([]);
  const [assignmentGrades, setAssignmentGrades] = useState<AssignmentGrades[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchGradeAnalytics();
    }
  }, [user]);

  const fetchGradeAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Get teacher's classes
      const { data: classes, error: classError } = await supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', user?.id);

      if (classError) {
        throw new Error(`Failed to load classes: ${classError.message}`);
      }

      if (!classes || classes.length === 0) {
        // No classes, set empty data
        setGradeStats({
          totalGradedSubmissions: 0,
          averageGrade: 0,
          highestGrade: 0,
          lowestGrade: 0,
          passingRate: 0
        });
        setGradeDistribution([]);
        setAssignmentGrades([]);
        setLoading(false);
        return;
      }

      const classIds = classes.map(c => c.id);

      // Get assignments for these classes
      const { data: assignments, error: assignmentError } = await supabase
        .from('assignments')
        .select('id, title, class_id, points_possible')
        .in('class_id', classIds);

      if (assignmentError) {
        throw new Error(`Failed to load assignments: ${assignmentError.message}`);
      }

      if (!assignments || assignments.length === 0) {
        // No assignments
        setGradeStats({
          totalGradedSubmissions: 0,
          averageGrade: 0,
          highestGrade: 0,
          lowestGrade: 0,
          passingRate: 0
        });
        setGradeDistribution([]);
        setAssignmentGrades([]);
        setLoading(false);
        return;
      }

      const assignmentIds = assignments.map(a => a.id);

      // Get graded submissions
      const { data: submissions, error: submissionError } = await supabase
        .from('submissions')
        .select('id, assignment_id, grade, status')
        .in('assignment_id', assignmentIds)
        .eq('status', 'graded')
        .not('grade', 'is', null);

      if (submissionError) {
        console.error('Error loading submissions:', submissionError);
        // Continue with empty submissions
      }

      const gradedSubmissions = submissions || [];

      if (gradedSubmissions.length === 0) {
        // No graded submissions
        setGradeStats({
          totalGradedSubmissions: 0,
          averageGrade: 0,
          highestGrade: 0,
          lowestGrade: 0,
          passingRate: 0
        });
        setGradeDistribution([]);
        setAssignmentGrades(assignments.map(a => ({
          id: a.id,
          title: a.title,
          averageGrade: 0,
          submissionCount: 0,
          gradedCount: 0
        })));
        setLoading(false);
        return;
      }

      // Calculate grade statistics
      const grades = gradedSubmissions.map(s => s.grade).filter(g => g !== null && g !== undefined);
      const totalGradedSubmissions = grades.length;
      const averageGrade = grades.reduce((sum, grade) => sum + grade, 0) / totalGradedSubmissions;
      const highestGrade = Math.max(...grades);
      const lowestGrade = Math.min(...grades);
      const passingGrades = grades.filter(g => g >= 60); // Assuming 60% is passing
      const passingRate = (passingGrades.length / totalGradedSubmissions) * 100;

      setGradeStats({
        totalGradedSubmissions,
        averageGrade: Math.round(averageGrade * 10) / 10,
        highestGrade,
        lowestGrade,
        passingRate: Math.round(passingRate * 10) / 10
      });

      // Calculate grade distribution
      const distribution = [
        { range: '90-100%', count: 0, percentage: 0 },
        { range: '80-89%', count: 0, percentage: 0 },
        { range: '70-79%', count: 0, percentage: 0 },
        { range: '60-69%', count: 0, percentage: 0 },
        { range: 'Below 60%', count: 0, percentage: 0 }
      ];

      grades.forEach(grade => {
        if (grade >= 90) distribution[0].count++;
        else if (grade >= 80) distribution[1].count++;
        else if (grade >= 70) distribution[2].count++;
        else if (grade >= 60) distribution[3].count++;
        else distribution[4].count++;
      });

      distribution.forEach(d => {
        d.percentage = Math.round((d.count / totalGradedSubmissions) * 100 * 10) / 10;
      });

      setGradeDistribution(distribution);

      // Calculate assignment-level analytics
      const assignmentAnalytics = assignments.map(assignment => {
        const assignmentSubmissions = gradedSubmissions.filter(s => s.assignment_id === assignment.id);
        const assignmentGrades = assignmentSubmissions.map(s => s.grade).filter(g => g !== null);
        const averageGrade = assignmentGrades.length > 0
          ? assignmentGrades.reduce((sum, grade) => sum + grade, 0) / assignmentGrades.length
          : 0;

        return {
          id: assignment.id,
          title: assignment.title,
          averageGrade: Math.round(averageGrade * 10) / 10,
          submissionCount: assignmentSubmissions.length,
          gradedCount: assignmentSubmissions.length
        };
      });

      setAssignmentGrades(assignmentAnalytics);

    } catch (error) {
      console.error('Error fetching grade analytics:', error);
      setError(error instanceof Error ? error.message : 'Failed to load grade analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <Link href="/dashboard/teacher/analytics">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Analytics
            </Button>
          </Link>
          <h1 className="text-3xl font-bold mb-2">Grade Analytics</h1>
          <p className="text-gray-600">Loading grade data...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
        <Link href="/dashboard/teacher/analytics">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Analytics
          </Button>
        </Link>
        <Card>
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-semibold mb-2">Error Loading Grade Analytics</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={fetchGradeAnalytics}>
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
        <Link href="/dashboard/teacher/analytics">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Analytics
          </Button>
        </Link>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">Grade Analytics</h1>
            <p className="text-gray-600">Detailed analysis of student grades</p>
          </div>
          <Button onClick={fetchGradeAnalytics} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Grade Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Graded</p>
                <p className="text-2xl font-bold">{gradeStats.totalGradedSubmissions}</p>
              </div>
              <Award className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Average Grade</p>
                <p className="text-2xl font-bold">{gradeStats.averageGrade}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Highest Grade</p>
                <p className="text-2xl font-bold">{gradeStats.highestGrade}%</p>
              </div>
              <Award className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Passing Rate</p>
                <p className="text-2xl font-bold">{gradeStats.passingRate}%</p>
              </div>
              <Users className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Grade Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Grade Distribution</CardTitle>
            <CardDescription>
              Distribution of grades across all assignments
            </CardDescription>
          </CardHeader>
          <CardContent>
            {gradeDistribution.length === 0 ? (
              <div className="text-center py-8">
                <Award className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-500">No graded submissions yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {gradeDistribution.map((dist, index) => (
                  <div key={dist.range}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{dist.range}</span>
                      <span>{dist.count} ({dist.percentage}%)</span>
                    </div>
                    <Progress 
                      value={dist.percentage} 
                      className="h-2"
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Grade Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Grade Summary</CardTitle>
            <CardDescription>
              Key statistics about student performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span>Total Graded Submissions</span>
                <span className="font-semibold">{gradeStats.totalGradedSubmissions}</span>
              </div>
              <div className="flex justify-between">
                <span>Average Grade</span>
                <span className="font-semibold">{gradeStats.averageGrade}%</span>
              </div>
              <div className="flex justify-between">
                <span>Highest Grade</span>
                <span className="font-semibold">{gradeStats.highestGrade}%</span>
              </div>
              <div className="flex justify-between">
                <span>Lowest Grade</span>
                <span className="font-semibold">{gradeStats.lowestGrade}%</span>
              </div>
              <div className="flex justify-between">
                <span>Passing Rate (≥60%)</span>
                <span className="font-semibold">{gradeStats.passingRate}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assignment Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Assignment Performance</CardTitle>
          <CardDescription>
            Average grades for each assignment
          </CardDescription>
        </CardHeader>
        <CardContent>
          {assignmentGrades.length === 0 ? (
            <div className="text-center py-8">
              <Award className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-500">No assignments found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {assignmentGrades.map((assignment) => (
                <div key={assignment.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-medium">{assignment.title}</h4>
                      <p className="text-sm text-gray-600">
                        {assignment.gradedCount} graded submissions
                      </p>
                    </div>
                    <Badge variant={assignment.averageGrade >= 80 ? 'default' : assignment.averageGrade >= 60 ? 'secondary' : 'destructive'}>
                      {assignment.averageGrade}% avg
                    </Badge>
                  </div>
                  <div className="mt-2">
                    <Progress value={assignment.averageGrade} className="h-2" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}