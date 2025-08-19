import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface SubmissionRequest {
  content?: string
  file_url?: string
  link_url?: string
  submission_type: 'text' | 'file' | 'link'
  student_id: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const assignmentId = params.id
    const body: SubmissionRequest = await request.json()

    console.log('Submitting assignment:', assignmentId, 'for student:', body.student_id)

    const supabase = await createClient()

    // Verify assignment exists and is accessible
    const { data: assignment, error: assignmentError } = await supabase
      .from('assignments')
      .select('id, title, due_date, class_id')
      .eq('id', assignmentId)
      .single()

    if (assignmentError || !assignment) {
      return NextResponse.json(
        { error: 'Assignment not found' },
        { status: 404 }
      )
    }

    // Check if student is enrolled in the class
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('enrollments')
      .select('id')
      .eq('class_id', assignment.class_id)
      .eq('student_id', body.student_id)
      .single()

    if (enrollmentError || !enrollment) {
      return NextResponse.json(
        { error: 'Not enrolled in this class' },
        { status: 403 }
      )
    }

    // Check for existing submission
    const { data: existingSubmission } = await supabase
      .from('submissions')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('student_id', body.student_id)
      .single()

    const submissionData = {
      assignment_id: assignmentId,
      student_id: body.student_id,
      content: body.content || null,
      file_url: body.file_url || null,
      link_url: body.link_url || null,
      submitted_at: new Date().toISOString(),
      status: 'submitted'
    }

    if (existingSubmission) {
      // Update existing submission
      const { data, error } = await supabase
        .from('submissions')
        .update({
          ...submissionData,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingSubmission.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating submission:', error)
        return NextResponse.json(
          { error: 'Failed to update submission' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Submission updated successfully',
        data: data
      })
    } else {
      // Create new submission
      const { data, error } = await supabase
        .from('submissions')
        .insert(submissionData)
        .select()
        .single()

      if (error) {
        console.error('Error creating submission:', error)
        return NextResponse.json(
          { error: 'Failed to submit assignment' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Assignment submitted successfully',
        data: data
      })
    }

  } catch (error) {
    console.error('Submit assignment error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}