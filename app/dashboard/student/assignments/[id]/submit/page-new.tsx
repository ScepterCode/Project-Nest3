"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Upload, Link, FileText, Calendar } from 'lucide-react';

interface Assignment {
  id: string;
  title: string;
  description: string;
  due_date: string;
  class_name: string;
}

export default function SubmitAssignmentPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Form states
  const [textContent, setTextContent] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState('text');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && params.id) {
      loadAssignmentData();
    }
  }, [user, params.id]);

  const loadAssignmentData = async () => {
    try {
      const supabase = createClient();
      
      // Load assignment details with class info
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('assignments')
        .select(`
          id, title, description, due_date,
          classes!inner(name)
        `)
        .eq('id', params.id)
        .single();

      if (assignmentError) {
        setError('Assignment not found');
        return;
      }

      setAssignment({
        id: assignmentData.id,
        title: assignmentData.title,
        description: assignmentData.description,
        due_date: assignmentData.due_date,
        class_name: assignmentData.classes?.name || 'Unknown Class'
      });

    } catch (error) {
      console.error('Error loading assignment:', error);
      setError('Failed to load assignment');
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      
      // Validate input
      if (activeTab === 'text' && !textContent.trim()) {
        setError('Please enter your response');
        return;
      }
      if (activeTab === 'link' && !linkUrl.trim()) {
        setError('Please enter a valid URL');
        return;
      }
      if (activeTab === 'file' && !selectedFile) {
        setError('Please select a file to upload');
        return;
      }

      // Prepare submission data
      let submissionData: any = {
        assignment_id: params.id,
        student_id: user?.id,
        status: 'submitted'
      };

      // Add content based on active tab
      if (activeTab === 'text') {
        submissionData.content = textContent.trim();
      } else if (activeTab === 'link') {
        submissionData.link_url = linkUrl.trim();
      } else if (activeTab === 'file' && selectedFile) {
        // Check file size (200KB limit)
        if (selectedFile.size > 200 * 1024) {
          setError('File size must be less than 200KB');
          return;
        }

        // Upload file
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${user?.id}/${params.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('submissions')
          .upload(fileName, selectedFile);

        if (uploadError) {
          setError('Failed to upload file: ' + uploadError.message);
          return;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('submissions')
          .getPublicUrl(fileName);

        submissionData.file_url = publicUrl;
      }

      // Submit to database
      const { error: insertError } = await supabase
        .from('submissions')
        .insert([submissionData]);

      if (insertError) {
        setError('Failed to submit assignment: ' + insertError.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard/student/assignments');
      }, 2000);

    } catch (error: any) {
      console.error('Submission error:', error);
      setError('Failed to submit assignment: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || loadingData) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading assignment...</div>
      </div>
    );
  }

  if (error && !assignment) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-red-600">{error}</div>
        <div className="text-center mt-4">
          <Button onClick={() => router.push('/dashboard/student/assignments')}>
            Back to Assignments
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="text-center py-12">
            <div className="text-green-600 text-6xl mb-4">✓</div>
            <h2 className="text-2xl font-bold mb-2">Assignment Submitted Successfully!</h2>
            <p className="text-gray-600">Redirecting to assignments...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => router.push('/dashboard/student/assignments')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Assignments
        </Button>
        
        <h1 className="text-3xl font-bold mb-2">Submit Assignment</h1>
        {assignment && (
          <div className="text-gray-600">
            <p className="text-lg">{assignment.title}</p>
            <p>{assignment.class_name}</p>
            <p className="flex items-center gap-2 mt-1">
              <Calendar className="h-4 w-4" />
              Due: {new Date(assignment.due_date).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Submit Your Work</CardTitle>
          <CardDescription>
            Choose how you'd like to submit your assignment
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
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
                  <Label htmlFor="content">Your Response</Label>
                  <Textarea
                    id="content"
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="Enter your assignment response here..."
                    rows={8}
                    className="mt-1"
                    required={activeTab === 'text'}
                  />
                </div>
              </TabsContent>

              <TabsContent value="file" className="space-y-4">
                <div>
                  <Label htmlFor="file">Upload File</Label>
                  <Input
                    id="file"
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                    className="mt-1"
                    required={activeTab === 'file'}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Max file size: 200KB. Supported formats: PDF, DOC, DOCX, TXT, JPG, PNG
                  </p>
                  {selectedFile && (
                    <p className="text-sm text-blue-600 mt-1">
                      Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)}KB)
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="link" className="space-y-4">
                <div>
                  <Label htmlFor="link">Link URL</Label>
                  <Input
                    id="link"
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://docs.google.com/document/..."
                    className="mt-1"
                    required={activeTab === 'link'}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Link to Google Docs, GitHub, or other online resources
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex gap-2 mt-6">
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? 'Submitting...' : 'Submit Assignment'}
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
    </div>
  );
}