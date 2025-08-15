"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Calendar, Users, Clock } from "lucide-react";
import { DatabaseStatusBanner } from "@/components/database-status-banner";

interface Assignment {
  id: string;
  title: string;
  description: string;
  due_date: string;
  status: string;
  class_name: string;
  submission_count: number;
  total_students: number;
  created_at: string;
}

export default function TeacherAssignmentsPage() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAssignments = async () => {
      if (!user) return;

      try {
        const supabase = createClient();
        // Get assignments using manual joins
        const { data: assignmentsData, error } = await supabase
          .from('assignments')
          .select('*')
          .eq('teacher_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching assignments:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
            fullError: error
          });
          setAssignments([]);
        } else if (assignmentsData) {
          // Get class info and submission counts for each assignment
          const assignmentsWithCounts = await Promise.all(
            assignmentsData.map(async (assignment) => {
              // Get class info manually
              const { data: classInfo } = await supabase
                .from('classes')
                .select('name')
                .eq('id', assignment.class_id)
                .single();
              
              // Get total students in class
              const { data: enrollments } = await supabase
                .from('enrollments')
                .select('student_id')
                .eq('class_id', assignment.class_id);
              
              const totalStudents = enrollments?.length || 0;

              // Get submission count for this assignment
              const { data: submissions } = await supabase
                .from('submissions')
                .select('id')
                .eq('assignment_id', assignment.id);
              
              const submissionCount = submissions?.length || 0;

              return {
                ...assignment,
                class_name: classInfo?.name || 'Unknown Class',
                submission_count: submissionCount,
                total_students: totalStudents
              };
            })
          );
          
          setAssignments(assignmentsWithCounts);
        } else {
          setAssignments([]);
        }
      } catch (error) {
        console.error('Database connection error:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          fullError: error
        });
        setAssignments([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAssignments();
  }, [user]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'default';
      case 'draft': return 'secondary';
      case 'closed': return 'destructive';
      default: return 'secondary';
    }
  };

  const getDaysUntilDue = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DatabaseStatusBanner />
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Assignments</h1>
          <p className="text-gray-600">Create and manage assignments for your classes</p>
        </div>
        <Link href="/dashboard/teacher/assignments/create">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Assignment
          </Button>
        </Link>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No assignments yet</h3>
            <p className="text-gray-600 text-center mb-4">
              Create your first assignment to start collecting student work.
            </p>
            <Link href="/dashboard/teacher/assignments/create">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Assignment
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assignments.map((assignment) => {
            const daysUntilDue = getDaysUntilDue(assignment.due_date);
            
            return (
              <Card key={assignment.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{assignment.title}</CardTitle>
                      <CardDescription>{assignment.class_name}</CardDescription>
                    </div>
                    <Badge variant={getStatusColor(assignment.status)}>
                      {assignment.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                    {assignment.description || 'No description available'}
                  </p>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center text-gray-500">
                        <Calendar className="h-4 w-4 mr-1" />
                        Due: {new Date(assignment.due_date).toLocaleDateString()}
                      </div>
                      {daysUntilDue >= 0 && (
                        <div className="flex items-center text-orange-600">
                          <Clock className="h-4 w-4 mr-1" />
                          {daysUntilDue === 0 ? 'Due today' : `${daysUntilDue} days left`}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center text-sm text-gray-500">
                      <Users className="h-4 w-4 mr-1" />
                      {assignment.submission_count || 0} / {assignment.total_students || 0} submitted
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link href={`/dashboard/teacher/assignments/${assignment.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        View Details
                      </Button>
                    </Link>
                    <Link href={`/dashboard/teacher/assignments/${assignment.id}/grade-submissions`}>
                      <Button size="sm">
                        Grade ({assignment.submission_count}/{assignment.total_students})
                      </Button>
                    </Link>
                  </div>
                  <div className="mt-2">
                    <Link href={`/dashboard/teacher/assignments/${assignment.id}/peer-review`} className="w-full">
                      <Button variant="outline" size="sm" className="w-full">
                        Create Peer Review
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}