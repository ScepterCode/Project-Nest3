"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Upload, Link, FileText, Calendar, Clock, CheckCircle } from "lucide-react"

interface Assignment {
  id: string
  title: string
  description: string
  due_date: string
  class_id: string
  class_name: string
  teacher_name: string
}

interface ExistingSubmission {
  id: string
  content: string
  file_url?: string
  link_url?: string
  submitted_at: string
  status: string
}

export default function SubmitAssignmentPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [existingSubmission, setExistingSubmission] = useState<ExistingSubmission | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Form data
  const [submissionType, setSubmissionType] = useState<'text' | 'file' | 'link'>('text')
  const [textContent, setTextContent] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [linkUrl, setLinkUrl] = useState('')

  const assignmentId = params?.id as string

  useEffect(() => {
    if (assignmentId && user) {
      loadAssignmentData()
    }
  }, [assignmentId, user])

  const loadAssignmentData = async () => {
    try {
      const supabase = createClient()
      
      // Load assignment details
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('assignments')
        .select('id, title, description, due_date, class_id')
        .eq('id', assignmentId)
        .single()

      if (assignmentError || !assignmentData) {
        setError('Assignment not found')
        return
      }

      // Load class and teacher info
      const { data: classData } = await supabase
        .from('classes')
        .select('id, name, teacher_id')
        .eq('id', assignmentData.class_id)
        .single()

      const { data: teacherData } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', classData?.teacher_id)
        .single()

      setAssignment({
        ...assignmentData,
        class_name: classData?.name || 'Unknown Class',
        teacher_name: teacherData ? `${teacherData.first_name} ${teacherData.last_name}` : 'Unknown Teacher'
      })

      // Check for existing submission
      const { data: submissionData } = await supabase
        .from('submissions')
        .select('id, content, file_url, link_url, submitted_at, status')
        .eq('assignment_id', assignmentId)
        .eq('student_id', user.id)
        .single()

      if (submissionData) {
        setExistingSubmission(submissionData)
        setTextContent(submissionData.content || '')
        setLinkUrl(submissionData.link_url || '')
        
        // Determine submission type based on existing data
        if (submissionData.file_url) {
          setSubmissionType('file')
        } else if (submissionData.link_url) {
          setSubmissionType('link')
        } else {
          setSubmissionType('text')
        }
      }

    } catch (err) {
      console.error('Error loading assignment:', err)
      setError('Failed to load assignment')
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Check file size (200KB = 200 * 1024 bytes)
    const maxSize = 200 * 1024
    if (file.size > maxSize) {
      setError('File size must be less than 200KB')
      return
    }

    setSelectedFile(file)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()

      // Validate submission based on type
      if (submissionType === 'text' && !textContent.trim()) {
        setError('Please enter your submission text')
        return
      }
      if (submissionType === 'file' && !selectedFile && !existingSubmission?.file_url) {
        setError('Please select a file to upload')
        return
      }
      if (submissionType === 'link' && !linkUrl.trim()) {
        setError('Please enter a link URL')
        return
      }

      let fileUrl = existingSubmission?.file_url || null

      // Handle file upload if there's a new file
      if (submissionType === 'file' && selectedFile) {
        const fileName = `${user.id}/${assignmentId}/${Date.now()}-${selectedFile.name}`
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('submissions')
          .upload(fileName, selectedFile)

        if (uploadError) {
          setError('Failed to upload file')
          return
        }

        const { data: urlData } = supabase.storage
          .from('submissions')
          .getPublicUrl(uploadData.path)

        fileUrl = urlData.publicUrl
      }

      // Prepare submission data
      const submissionData = {
        assignment_id: assignmentId,
        student_id: user.id,
        content: submissionType === 'text' ? textContent : null,
        file_url: submissionType === 'file' ? fileUrl : null,
        link_url: submissionType === 'link' ? linkUrl : null,
        submitted_at: new Date().toISOString(),
        status: 'submitted'
      }

      // Insert or update submission
      if (existingSubmission) {
        const { error: updateError } = await supabase
          .from('submissions')
          .update({
            ...submissionData,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSubmission.id)

        if (updateError) {
          setError('Failed to update submission')
          return
        }
      } else {
        const { error: insertError } = await supabase
          .from('submissions')
          .insert(submissionData)

        if (insertError) {
          setError('Failed to submit assignment')
          return
        }
      }

      // Create notification for teacher
      try {
        await fetch('/api/notifications/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'assignment_submitted',
            title: 'New Assignment Submission',
            message: `A student has submitted "${assignment?.title}"`,
            priority: 'medium',
            target_user_id: assignment?.teacher_id,
            metadata: {
              assignment_id: assignmentId,
              student_id: user.id,
              submission_type: submissionType
            }
          })
        })
      } catch (notificationError) {
        console.warn('Failed to create notification:', notificationError)
      }

      setSuccess(true)
      
    } catch (err) {
      console.error('Error submitting assignment:', err)
      setError('An unexpected error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  const isOverdue = assignment ? new Date(assignment.due_date) < new Date() : false

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error && !assignment) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-semibold mb-2">Error</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={() => router.push('/dashboard/student/assignments')}>
              Back to Assignments
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-800 mb-2">
              {existingSubmission ? 'Submission Updated!' : 'Assignment Submitted!'}
            </h3>
            <p className="text-green-700 mb-4">
              Your submission for "{assignment?.title}" has been {existingSubmission ? 'updated' : 'submitted'} successfully.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => router.push('/dashboard/student/assignments')}>
                Back to Assignments
              </Button>
              <Button variant="outline" onClick={() => setSuccess(false)}>
                View Submission
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
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
              {isOverdue && (
                <Badge variant="destructive">Overdue</Badge>
              )}
              {existingSubmission && (
                <Badge variant="default">
                  {existingSubmission.status === 'submitted' ? 'Submitted' : 'Draft'}
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
              Due: {assignment ? new Date(assignment.due_date).toLocaleDateString() : ''}
            </div>
            {existingSubmission && (
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Last submitted: {new Date(existingSubmission.submitted_at).toLocaleDateString()}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Submission Form */}
      <Card>
        <CardHeader>
          <CardTitle>
            {existingSubmission ? 'Update Submission' : 'Submit Assignment'}
          </CardTitle>
          <CardDescription>
            Choose how you'd like to submit your work
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
            <Tabs value={submissionType} onValueChange={(value) => setSubmissionType(value as any)}>
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
                    onChange={(e) => setTextContent(e.target.value)}
                    rows={10}
                    className="mt-2"
                  />
                </div>
              </TabsContent>

              <TabsContent value="file" className="space-y-4">
                <div>
                  <Label htmlFor="fileUpload">Upload File (Max 200KB)</Label>
                  <Input
                    id="fileUpload"
                    type="file"
                    onChange={handleFileChange}
                    className="mt-2"
                    accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                  />
                  {selectedFile && (
                    <p className="text-sm text-gray-600 mt-2">
                      Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)}KB)
                    </p>
                  )}
                  {existingSubmission?.file_url && !selectedFile && (
                    <p className="text-sm text-green-600 mt-2">
                      Current file uploaded. Select a new file to replace it.
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="link" className="space-y-4">
                <div>
                  <Label htmlFor="linkUrl">Link URL</Label>
                  <Input
                    id="linkUrl"
                    type="url"
                    placeholder="https://example.com/your-work"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Provide a link to your work (Google Docs, GitHub, etc.)
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            {/* Submit Button */}
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? 'Submitting...' : existingSubmission ? 'Update Submission' : 'Submit Assignment'}
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
  )
}