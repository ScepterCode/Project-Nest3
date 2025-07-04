"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useSupabase } from "@/components/session-provider"
import { Download, CheckCircle, Clock } from "lucide-react"

export default function TeacherAssignmentDetailsPage() {
  const { id: assignmentId } = useParams()
  const supabase = useSupabase()
  const [assignment, setAssignment] = useState<any>(null)
  const [submissions, setSubmissions] = useState<any[]>([])
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

        // Fetch submissions for this assignment
        const { data: submissionsData, error: submissionsError } = await supabase
          .from('submissions')
          .select('*, users(first_name, last_name)')
          .eq('assignment_id', assignmentId)

        if (submissionsError) throw submissionsError
        setSubmissions(submissionsData)

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

  const handleDownloadSubmission = (submissionContent: string, studentName: string) => {
    if (submissionContent) {
      const element = document.createElement('a')
      const file = new Blob([submissionContent], { type: 'text/plain' })
      element.href = URL.createObjectURL(file)
      element.download = `submission-${assignment?.title || 'assignment'}-${studentName}.txt`
      document.body.appendChild(element)
      element.click()
      document.body.removeChild(element)
    } else {
      alert("No submission content to download.")
    }
  }

  const handleGradeSubmission = async (submissionId: string) => {
    const grade = prompt("Enter grade:")
    const feedback = prompt("Enter feedback (optional):")

    if (grade === null) return // User cancelled

    try {
      const response = await fetch('/api/submissions/grade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ submissionId, grade, feedback }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to grade submission')
      }

      alert('Submission graded successfully!')
      // Re-fetch submissions to update the list
      const { data: updatedSubmissions, error: updateError } = await supabase
        .from('submissions')
        .select('*, users(first_name, last_name)')
        .eq('assignment_id', assignmentId)
      if (updateError) console.error('Error refetching submissions:', updateError)
      else setSubmissions(updatedSubmissions)

    } catch (error: any) {
      console.error('Error grading submission:', error)
      alert(error.message)
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
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>{assignment.title}</CardTitle>
          <CardDescription>
            <p>Class: {assignment.classes?.name}</p>
            <p>Due Date: {new Date(assignment.due_date).toLocaleString()}</p>
            <p>Max Points: {assignment.max_points}</p>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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

          <h3 className="text-lg font-semibold mt-6">Submissions:</h3>
          {submissions.length === 0 ? (
            <p>No submissions yet.</p>
          ) : (
            <div className="space-y-4">
              {submissions.map((submissionItem) => (
                <Card key={submissionItem.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{submissionItem.users?.first_name} {submissionItem.users?.last_name}</p>
                      <p className="text-sm text-gray-600">Submitted: {new Date(submissionItem.submitted_at).toLocaleString()}</p>
                      {submissionItem.status === 'graded' && (
                        <p className="text-sm text-gray-600">Grade: {submissionItem.grade} {submissionItem.feedback && `(${submissionItem.feedback})`}</p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm" onClick={() => handleDownloadSubmission(submissionItem.content, `${submissionItem.users?.first_name} ${submissionItem.users?.last_name}`)}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                      {submissionItem.status !== 'graded' && (
                        <Button size="sm" onClick={() => handleGradeSubmission(submissionItem.id)}>
                          Grade
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
