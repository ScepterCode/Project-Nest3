"use client";

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ArrowLeft, FileText, Link, Download, Save } from 'lucide-react';

interface Assignment {
  id: string;
  title: string;
  description: string;
  due_date: string;
  class_name: string;
}

interface Submission {
  id: string;
  student_id: string;
  student_name: string;
  content?: string;
  file_url?: string;
  link_url?: string;
  submitted_at: string;
  status: 'submitted' | 'graded';
  grade?: number;
  feedback?: string;
}

export default function AssignmentSubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const resolvedParams = use(params);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gradingSubmission, setGradingSubmission] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && resolvedParams.id) {
      loadAssignmentAndSubmissions();
    }
  }, [user, resolvedParams.id]);

  const loadAssignmentAndSubmissions = async () => {
    try {
      const supabase = createClient();
      
      // Load assignment details
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('assignments')
        .select(`
          id, title, description, due_date,
          classes!inner(name, teacher_id)
        `)
        .eq('id', resolvedParams.id)
        .eq('classes.teacher_id', user?.id)
        .single();

      if (assignmentError) {
        setError('Assignment not found or access denied');
        return;
      }

      setAssignment({
        id: assignmentData.id,
        title: assignmentData.title,
        description: assignmentData.description,
        due_date: assignmentData.due_date,
        class_name: assignmentData.classes.name
      });

      // Load submissions
      const { data: submissionsData, error: submissionsError } = await supabase
        .from('submissions')
        .select(`
          id, student_id, content, file_url, link_url, 
          submitted_at, status, grade, feedback
        `)
        .eq('assignment_id', resolvedParams.id);

      if (submissionsError) {
        console.error('Error loading submissions:', submissionsError);
        setSubmissions([]);
        return;
      }

      // Get student names
      if (submissionsData && submissionsData.length > 0) {
        const studentIds = submissionsData.map(s => s.student_id);
        const { data: studentsData } = await supabase
          .from('user_profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', studentIds);

        const submissionsWithNames = submissionsData.map(submission => {
          const student = studentsData?.find(s => s.user_id === submission.student_id);
          return {
            ...submission,
            student_name: student 
              ? `${student.first_name} ${student.last_name}`
              : 'Unknown Student'
          };
        });

        setSubmissions(submissionsWithNames);
      } else {
        setSubmissions([]);
      }

    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load assignment and submissions');
    } finally {
      setLoadingData(false);
    }
  };

  const handleGradeSubmission = async (submissionId: string, grade: number, feedback: string) => {
    try {
      const supabase = createClient();
      
      const { error } = await supabase
        .from('submissions')
        .update({
          grade,
          feedback,
          status: 'graded',
          graded_at: new Date().toISOString(),
          graded_by: user?.id
        })
        .eq('id', submissionId);

      if (error) {
        console.error('Error grading submission:', error);
        return;
      }

      // Update local state
      setSubmissions(prev => prev.map(sub => 
        sub.id === submissionId 
          ? { ...sub, grade, feedback, status: 'graded' as const }
          : sub
      ));

      setGradingSubmission(null);
    } catch (error) {
      console.error('Error grading submission:', error);
    }
  };

  if (loading || loadingData) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-red-600">{error}</div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Assignment not found</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Assignment
        </Button>
        
        <h1 className="text-3xl font-bold mb-2">Submissions: {assignment.title}</h1>
        <p className="text-gray-600 mb-2">{assignment.class_name}</p>
        <p className="text-sm text-gray-500">
          Due: {new Date(assignment.due_date).toLocaleDateString()}
        </p>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">
          Submissions ({submissions.length})
        </h2>
        
        {submissions.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-gray-500">No submissions yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {submissions.map((submission) => (
              <Card key={submission.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{submission.student_name}</CardTitle>
                      <CardDescription>
                        Submitted: {new Date(submission.submitted_at).toLocaleString()}
                      </CardDescription>
                    </div>
                    <Badge variant={submission.status === 'graded' ? 'default' : 'secondary'}>
                      {submission.status === 'graded' ? `Graded (${submission.grade}/100)` : 'Submitted'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Submission Content */}
                  <div className="mb-4">
                    {submission.content && (
                      <div className="mb-3">
                        <h4 className="font-medium mb-2 flex items-center">
                          <FileText className="h-4 w-4 mr-2" />
                          Text Submission
                        </h4>
                        <div className="bg-gray-50 p-3 rounded border">
                          <p className="whitespace-pre-wrap">{submission.content}</p>
                        </div>
                      </div>
                    )}
                    
                    {submission.file_url && (
                      <div className="mb-3">
                        <h4 className="font-medium mb-2 flex items-center">
                          <Download className="h-4 w-4 mr-2" />
                          File Submission
                        </h4>
                        <Button variant="outline" size="sm" asChild>
                          <a href={submission.file_url} target="_blank" rel="noopener noreferrer">
                            Download File
                          </a>
                        </Button>
                      </div>
                    )}
                    
                    {submission.link_url && (
                      <div className="mb-3">
                        <h4 className="font-medium mb-2 flex items-center">
                          <Link className="h-4 w-4 mr-2" />
                          Link Submission
                        </h4>
                        <Button variant="outline" size="sm" asChild>
                          <a href={submission.link_url} target="_blank" rel="noopener noreferrer">
                            Open Link
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Grading Section */}
                  {gradingSubmission === submission.id ? (
                    <GradingForm
                      submission={submission}
                      onSave={(grade, feedback) => handleGradeSubmission(submission.id, grade, feedback)}
                      onCancel={() => setGradingSubmission(null)}
                    />
                  ) : (
                    <div>
                      {submission.status === 'graded' && (
                        <div className="bg-blue-50 p-3 rounded border mb-3">
                          <h4 className="font-medium mb-2">Grade & Feedback</h4>
                          <p className="font-semibold">Grade: {submission.grade}/100</p>
                          {submission.feedback && (
                            <p className="mt-2 text-sm">{submission.feedback}</p>
                          )}
                        </div>
                      )}
                      
                      <Button
                        onClick={() => setGradingSubmission(submission.id)}
                        variant={submission.status === 'graded' ? 'outline' : 'default'}
                      >
                        {submission.status === 'graded' ? 'Update Grade' : 'Grade Submission'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GradingForm({ 
  submission, 
  onSave, 
  onCancel 
}: { 
  submission: Submission;
  onSave: (grade: number, feedback: string) => void;
  onCancel: () => void;
}) {
  const [grade, setGrade] = useState(submission.grade?.toString() || '');
  const [feedback, setFeedback] = useState(submission.feedback || '');

  const handleSave = () => {
    const gradeNum = parseInt(grade);
    if (isNaN(gradeNum) || gradeNum < 0 || gradeNum > 100) {
      alert('Please enter a valid grade between 0 and 100');
      return;
    }
    onSave(gradeNum, feedback);
  };

  return (
    <div className="bg-gray-50 p-4 rounded border">
      <h4 className="font-medium mb-3">Grade Submission</h4>
      
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">
            Grade (0-100)
          </label>
          <Input
            type="number"
            min="0"
            max="100"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="Enter grade"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">
            Feedback (optional)
          </label>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Provide feedback to the student..."
            rows={3}
          />
        </div>
        
        <div className="flex gap-2">
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Grade
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}