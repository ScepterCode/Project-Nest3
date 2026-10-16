'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { formatBytes, normalizeLink, safeFileName } from '@/lib/materials';
import { SUBMISSION_ACCEPT, submissionFileType } from '@/lib/submissions';
import { uploadFile } from '@/lib/storage/resumable-upload';
import { checkLink } from '@/lib/link-check';
import { statusBadgeVariant, statusLabel } from '@/lib/submission-status';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Upload,
  Link,
  FileText,
  Calendar,
  Clock,
  CheckCircle,
} from 'lucide-react';

interface Assignment {
  id: string;
  title: string;
  description: string;
  due_date: string;
  class_id: string;
  teacher_id: string;
  class_name: string;
  teacher_name: string;
}

interface ExistingSubmission {
  id: string;
  content: string;
  file_url?: string;
  link_url?: string;
  submitted_at: string;
  status: string;
  feedback?: string | null;
  revision_count?: number;
}

export default function SubmitAssignmentPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [existingSubmission, setExistingSubmission] =
    useState<ExistingSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form data
  const [submissionType, setSubmissionType] = useState<
    'text' | 'file' | 'link'
  >('text');
  const [textContent, setTextContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkWarning, setLinkWarning] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Warn (without blocking) when a video link can't be opened by others.
  const checkLinkUrl = async () => {
    const link = normalizeLink(linkUrl);
    setLinkWarning(null);
    if (!link) return;
    const result = await checkLink(link);
    setLinkWarning(result.message);
  };

  const assignmentId = params?.id as string;

  useEffect(() => {
    if (assignmentId && user) {
      loadAssignmentData();
    }
  }, [assignmentId, user]);

  const loadAssignmentData = async () => {
    if (!user) return;
    try {
      const supabase = createClient();

      // Load assignment details
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('assignments')
        .select('id, title, description, due_date, class_id, teacher_id')
        .eq('id', assignmentId)
        .single();

      if (assignmentError || !assignmentData) {
        setError('Assignment not found');
        return;
      }

      // Load class and teacher info
      const { data: classData } = await supabase
        .from('classes')
        .select('id, name, teacher_id')
        .eq('id', assignmentData.class_id)
        .single();

      const { data: teacherData } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', classData?.teacher_id)
        .single();

      setAssignment({
        ...assignmentData,
        class_name: classData?.name || 'Unknown Class',
        teacher_name: teacherData
          ? `${teacherData.first_name} ${teacherData.last_name}`
          : 'Unknown Teacher',
      });

      // Check for existing submission
      const { data: submissionData } = await supabase
        .from('submissions')
        .select(
          'id, content, file_url, link_url, submitted_at, status, feedback, revision_count'
        )
        .eq('assignment_id', assignmentId)
        .eq('student_id', user.id)
        .single();

      if (submissionData) {
        setExistingSubmission(submissionData);
        setTextContent(submissionData.content || '');
        setLinkUrl(submissionData.link_url || '');

        // Determine submission type based on existing data
        if (submissionData.file_url) {
          setSubmissionType('file');
        } else if (submissionData.link_url) {
          setSubmissionType('link');
        } else {
          setSubmissionType('text');
        }
      }
    } catch (err) {
      console.error('Error loading assignment:', err);
      setError('Failed to load assignment');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const checked = submissionFileType(file);
    if ('problem' in checked) {
      setError(checked.problem);
      e.target.value = '';
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();

      // Validate submission based on type
      if (submissionType === 'text' && !textContent.trim()) {
        setError('Please enter your submission text');
        return;
      }
      if (
        submissionType === 'file' &&
        !selectedFile &&
        !existingSubmission?.file_url
      ) {
        setError('Please select a file to upload');
        return;
      }
      const link = submissionType === 'link' ? normalizeLink(linkUrl) : null;
      if (submissionType === 'link' && !link) {
        setError(
          'Enter a link to your work, e.g. https://youtu.be/... or a Google Drive link'
        );
        return;
      }

      let fileUrl = existingSubmission?.file_url || null;

      // Handle file upload if there's a new file
      if (submissionType === 'file' && selectedFile) {
        const checked = submissionFileType(selectedFile);
        if ('problem' in checked) {
          setError(checked.problem);
          return;
        }
        // Storage keys can't hold every character a file name can.
        // Stable for the same file, so a retry after a dropped connection
        // resumes instead of starting a new upload.
        const fileName = `${user.id}/${assignmentId}/${selectedFile.lastModified}-${selectedFile.size}-${safeFileName(selectedFile.name)}`;

        // Large files go up in resumable chunks, so a dropped connection
        // carries on instead of starting over.
        setUploadProgress(0);
        try {
          await uploadFile({
            bucket: 'submissions',
            path: fileName,
            file: selectedFile,
            contentType: checked.contentType,
            onProgress: setUploadProgress,
          });
        } catch (uploadError) {
          setUploadProgress(null);
          setError(
            `Failed to upload file: ${uploadError instanceof Error ? uploadError.message : 'please try again'}. If your connection dropped, submit again: the upload continues where it stopped.`
          );
          return;
        }
        setUploadProgress(null);

        // Store the object path, not a URL: the bucket is private, so viewers
        // get a short-lived signed URL (see lib/storage/submission-files.ts).
        fileUrl = fileName;
      }

      // Prepare submission data
      const submissionData = {
        assignment_id: assignmentId,
        student_id: user.id,
        content: submissionType === 'text' ? textContent : null,
        file_url: submissionType === 'file' ? fileUrl : null,
        link_url: link,
        submitted_at: new Date().toISOString(),
        status: 'submitted',
      };

      // Insert or update submission
      if (existingSubmission) {
        const { error: updateError } = await supabase
          .from('submissions')
          .update({
            ...submissionData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSubmission.id);

        if (updateError) {
          setError('Failed to update submission');
          return;
        }
      } else {
        const { error: insertError } = await supabase
          .from('submissions')
          .insert(submissionData);

        if (insertError) {
          setError('Failed to submit assignment');
          return;
        }
      }

      // Create notification for teacher
      try {
        await fetch('/api/notifications/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'assignment_submitted',
            title:
              existingSubmission?.status === 'revision_requested'
                ? 'Revised work handed in'
                : 'New Assignment Submission',
            message:
              existingSubmission?.status === 'revision_requested'
                ? `A student resubmitted "${assignment?.title}" after your requested changes`
                : `A student has submitted "${assignment?.title}"`,
            priority: 'medium',
            target_user_id: assignment?.teacher_id,
            action_url: `/dashboard/teacher/assignments/${assignmentId}/submissions`,
            metadata: {
              assignment_id: assignmentId,
              student_id: user.id,
              submission_type: submissionType,
            },
          }),
        });
      } catch (notificationError) {
        console.warn('Failed to create notification:', notificationError);
      }

      setSuccess(true);
    } catch (err) {
      console.error('Error submitting assignment:', err);
      setError('An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const isOverdue = assignment
    ? new Date(assignment.due_date) < new Date()
    : false;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !assignment) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-semibold mb-2">Error</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button
              onClick={() => router.push('/dashboard/student/assignments')}
            >
              Back to Assignments
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-800 mb-2">
              {existingSubmission
                ? 'Submission Updated!'
                : 'Assignment Submitted!'}
            </h3>
            <p className="text-green-700 mb-4">
              Your submission for &ldquo;{assignment?.title}&rdquo; has been{' '}
              {existingSubmission ? 'updated' : 'submitted'} successfully.
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => router.push('/dashboard/student/assignments')}
              >
                Back to Assignments
              </Button>
              <Button variant="outline" onClick={() => setSuccess(false)}>
                View Submission
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/dashboard/student/assignments')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Assignments
        </Button>
      </div>

      {/* Assignment Info */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-xl">{assignment?.title}</CardTitle>
              <CardDescription className="mt-2">
                {assignment?.class_name} • {assignment?.teacher_name}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isOverdue && <Badge variant="destructive">Overdue</Badge>}
              {existingSubmission && (
                <Badge variant={statusBadgeVariant(existingSubmission.status)}>
                  {statusLabel(existingSubmission.status)}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-gray-700 mb-4">{assignment?.description}</p>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Due:{' '}
              {assignment
                ? new Date(assignment.due_date).toLocaleDateString()
                : ''}
            </div>
            {existingSubmission && (
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Last submitted:{' '}
                {new Date(existingSubmission.submitted_at).toLocaleDateString()}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {existingSubmission?.status === 'revision_requested' && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-base text-red-800">
              Your teacher asked for changes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-red-900">
            {existingSubmission.feedback ? (
              <p className="whitespace-pre-line">
                {existingSubmission.feedback}
              </p>
            ) : (
              <p>Revise your work and hand it in again.</p>
            )}
          </CardContent>
        </Card>
      )}

      {existingSubmission?.status === 'graded' ? (
        <Card>
          <CardContent className="p-6 text-sm text-gray-700">
            This work has been graded, so it can&apos;t be changed. See your
            grade and feedback on the assignment page.
          </CardContent>
        </Card>
      ) : (
        /* Submission Form */
        <Card>
          <CardHeader>
            <CardTitle>
              {existingSubmission?.status === 'revision_requested'
                ? 'Hand in your revised work'
                : existingSubmission
                  ? 'Update Submission'
                  : 'Submit Assignment'}
            </CardTitle>
            <CardDescription>
              Choose how you&apos;d like to submit your work
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {error}
                </div>
              )}

              {/* Submission Type Tabs */}
              <Tabs
                value={submissionType}
                onValueChange={value => setSubmissionType(value as any)}
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="text" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Text
                  </TabsTrigger>
                  <TabsTrigger value="file" className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    File
                  </TabsTrigger>
                  <TabsTrigger value="link" className="flex items-center gap-2">
                    <Link className="h-4 w-4" />
                    Link
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="text" className="space-y-4">
                  <div>
                    <Label htmlFor="textContent">Your Submission</Label>
                    <Textarea
                      id="textContent"
                      placeholder="Enter your assignment submission here..."
                      value={textContent}
                      onChange={e => setTextContent(e.target.value)}
                      rows={10}
                      className="mt-2"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="file" className="space-y-4">
                  <div>
                    <Label htmlFor="fileUpload">
                      Upload file (up to 50 MB)
                    </Label>
                    <Input
                      id="fileUpload"
                      type="file"
                      onChange={handleFileChange}
                      className="mt-2"
                      accept={SUBMISSION_ACCEPT}
                    />
                    {selectedFile && (
                      <p className="text-sm text-gray-600 mt-2">
                        Selected: {selectedFile.name} (
                        {formatBytes(selectedFile.size)})
                      </p>
                    )}
                    {existingSubmission?.file_url && !selectedFile && (
                      <p className="text-sm text-green-600 mt-2">
                        Current file uploaded. Select a new file to replace it.
                      </p>
                    )}
                    {uploadProgress !== null && (
                      <div className="mt-3" aria-live="polite">
                        <div className="h-2 rounded bg-gray-100">
                          <div
                            className="h-2 rounded bg-blue-600 transition-all"
                            style={{
                              width: `${Math.round(uploadProgress * 100)}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          Uploading… {Math.round(uploadProgress * 100)}%. On a
                          weak connection this keeps going after short
                          drop-outs.
                        </p>
                      </div>
                    )}
                    <details className="mt-3 text-sm text-gray-600">
                      <summary className="cursor-pointer">
                        Tips for smaller animation files
                      </summary>
                      <ul className="ml-5 mt-2 list-disc space-y-1">
                        <li>
                          Export video as MP4 (H.264) at 720p; that is plenty
                          for review.
                        </li>
                        <li>
                          Keep loops short and export as GIF or MP4 rather than
                          image sequences.
                        </li>
                        <li>
                          Zip frame sequences or project files before uploading.
                        </li>
                        <li>
                          For long or high-quality pieces, upload to YouTube
                          (Unlisted) or Google Drive and hand in the link
                          instead.
                        </li>
                      </ul>
                    </details>
                  </div>
                </TabsContent>

                <TabsContent value="link" className="space-y-4">
                  <div>
                    <Label htmlFor="linkUrl">Link URL</Label>
                    <Input
                      id="linkUrl"
                      type="text"
                      inputMode="url"
                      placeholder="https://youtu.be/... or a Google Drive link"
                      value={linkUrl}
                      onChange={e => {
                        setLinkUrl(e.target.value);
                        setLinkWarning(null);
                      }}
                      onBlur={checkLinkUrl}
                      className="mt-2"
                    />
                    {linkWarning && (
                      <p
                        className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-800"
                        role="alert"
                      >
                        {linkWarning}
                      </p>
                    )}
                    <p className="text-sm text-gray-500 mt-1">
                      Link to your work: a YouTube, Vimeo or Google Drive video,
                      a Google Doc, etc. Best for videos over 50 MB.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Submit Button */}
              <div className="flex gap-3">
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting
                    ? 'Submitting...'
                    : existingSubmission?.status === 'revision_requested'
                      ? 'Resubmit'
                      : existingSubmission
                        ? 'Update Submission'
                        : 'Submit Assignment'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/dashboard/student/assignments')}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
