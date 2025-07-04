"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useSupabase } from "@/components/session-provider"
import { Upload, Download, CheckCircle, Clock } from "lucide-react"

export default function StudentAssignmentDetailsPage() {
  const { assignmentId } = useParams()
  const supabase = useSupabase()
  const [assignment, setAssignment] = useState<any>(null)
  const [submission, setSubmission] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAssignmentDetails = async () => {
      try {
        // Fetch assignment details
        const { data: assignmentData, error: assignmentError } = await supabase
          .from('assignments')
          .select('*, classes(name)')
          .eq('id', assignmentId)
          .single()

        if (assignmentError) throw assignmentError
        setAssignment(assignmentData)

        // Fetch user's submission for this assignment
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: submissionData, error: submissionError } = await supabase
            .from('submissions')
            .select('*')
            .eq('assignment_id', assignmentId)
            .eq('student_id', user.id)
            .single()

          if (submissionError && submissionError.code !== 'PGRST116') { // PGRST116 means no rows found
            throw submissionError
          }
          setSubmission(submissionData)
        }
      } catch (error: any) {
        setError(error.message)
      } finally {
        setIsLoading(false)
      }
    }

    if (assignmentId) {
      fetchAssignmentDetails()
    }
  }, [assignmentId, supabase])

  const handleSubmitAssignment = async () => {
    const content = prompt("Enter your submission content:")
    if (content === null) return // User cancelled

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        alert("You must be logged in to submit an assignment.")
        return
      }

      const { data, error } = await supabase.from('submissions').insert([
        {
          assignment_id: assignmentId,
          student_id: user.id,
          content: content,
          status: 'submitted',
        },
      ])

      if (error) {
        console.error('Error submitting assignment:', error)
        alert(error.message || 'Failed to submit assignment')
      } else {
        alert('Assignment submitted successfully!')
        // Update submission state
        setSubmission({ assignment_id: assignmentId, student_id: user.id, content: content, status: 'submitted' })
      }
    } catch (error: any) {
      console.error('Error submitting assignment:', error)
      alert(error.message)
    }
  }

  const handleDownloadSubmission = () => {
    if (submission && submission.content) {
      const element = document.createElement('a')
      const file = new Blob([submission.content], { type: 'text/plain' })
      element.href = URL.createObjectURL(file)
      element.download = `submission-${assignment?.title || 'assignment'}-${submission.student_id}.txt`
      document.body.appendChild(element)
      element.click()
      document.body.removeChild(element)
    } else {
      alert("No submission content to download.")
    }
  }

  if (isLoading) {
    return <div className="p-6">Loading assignment details...</div>
  }

  if (error) {
    return <div className="p-6 text-red-500">Error: {error}</div>
  }

  if (!assignment) {
    return <div className="p-6">Assignment not found.</div>
  }

  return (
    <div className="p-6">
      <Card className="w-full max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>{assignment.title}</CardTitle>
          <CardDescription>
            <p>Class: {assignment.classes?.name}</p>
            <p>Due Date: {new Date(assignment.due_date).toLocaleString()}</p>
            <p>Max Points: {assignment.max_points}</p>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold">Description:</h3>
            <p>{assignment.description}</p>
          </div>
          {assignment.instructions && (
            <div>
              <h3 className="font-semibold">Instructions:</h3>
              <p>{assignment.instructions}</p>
            </div>
          )}

          <div className="flex items-center space-x-2">
            {submission ? (
              <Badge variant="default" className="flex items-center space-x-1">
                <CheckCircle className="h-4 w-4" />
                <span>Submitted</span>
              </Badge>
            ) : (
              <Badge variant="secondary" className="flex items-center space-x-1">
                <Clock className="h-4 w-4" />
                <span>Not Submitted</span>
              </Badge>
            )}
            {submission && submission.grade && (
              <Badge variant="outline">Grade: {submission.grade}</Badge>
            )}
          </div>

          <div className="flex space-x-2">
            {!submission ? (
              <Button onClick={handleSubmitAssignment}>
                <Upload className="h-4 w-4 mr-2" />
                Submit Assignment
              </Button>
            ) : (
              <Button variant="outline" onClick={handleDownloadSubmission}>
                <Download className="h-4 w-4 mr-2" />
                Download Submission
              </Button>
            )}
            {submission && submission.status === 'graded' && (
              <Button variant="outline">
                View Grade Details
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
