import { type NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { createClient } from "@/lib/supabase-server"

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const assignmentId = searchParams.get("assignmentId")
    const studentId = searchParams.get("studentId")

    const supabase = createClient()

    let query = supabase.from('grades').select('*')

    if (user.role === "teacher") {
      query = query.eq('teacher_id', user.id)
      if (assignmentId) {
        query = query.eq('assignment_id', assignmentId)
      }
    } else if (user.role === "student") {
      query = query.eq('student_id', user.id).eq('status', 'published')
      if (assignmentId) {
        query = query.eq('assignment_id', assignmentId)
      }
    }

    const { data: userGrades, error } = await query

    if (error) throw error

    return NextResponse.json({ grades: userGrades })
  } catch (error) {
    console.error("Get grades error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()

    if (user.role !== "teacher") {
      return NextResponse.json({ error: "Only teachers can create grades" }, { status: 403 })
    }

    const gradeData = await request.json()
    const { submissionId, assignmentId, studentId, rubricId, criteriaGrades, feedback, status } = gradeData

    const supabase = createClient()

    // Fetch rubric to get max_points
    const { data: rubric, error: rubricError } = await supabase
      .from('rubrics')
      .select('total_points')
      .eq('id', rubricId)
      .single()

    if (rubricError) throw rubricError

    // Calculate total points
    const totalPoints = criteriaGrades.reduce((sum: number, cg: any) => sum + cg.points, 0)
    const maxPoints = rubric?.total_points || 100
    const percentage = Math.round((totalPoints / maxPoints) * 100)

    const newGrade = {
      submission_id: submissionId,
      assignment_id: assignmentId,
      student_id: studentId,
      teacher_id: user.id,
      rubric_id: rubricId,
      criteria_grades: criteriaGrades,
      total_points: totalPoints,
      max_points: maxPoints,
      percentage: percentage,
      letter_grade: calculateLetterGrade(percentage),
      feedback: feedback,
      status: status || "draft",
      graded_at: new Date().toISOString(),
      published_at: status === "published" ? new Date().toISOString() : null,
    }

    const { data: insertedGrade, error: insertError } = await supabase
      .from('grades')
      .insert([newGrade])
      .select()
      .single()

    if (insertError) throw insertError

    // Update submission status
    const { error: submissionUpdateError } = await supabase
      .from('submissions')
      .update({
        status: status === "published" ? "graded" : "submitted",
        grade: totalPoints,
        feedback: feedback.overallComments,
        graded_at: new Date().toISOString(),
        graded_by: user.id,
      })
      .eq('id', submissionId)

    if (submissionUpdateError) throw submissionUpdateError

    return NextResponse.json({ grade: insertedGrade })
  } catch (error) {
    console.error("Create grade error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function calculateLetterGrade(percentage: number): string {
  if (percentage >= 97) return "A+"
  if (percentage >= 93) return "A"
  if (percentage >= 90) return "A-"
  if (percentage >= 87) return "B+"
  if (percentage >= 83) return "B"
  if (percentage >= 80) return "B-"
  if (percentage >= 77) return "C+"
  if (percentage >= 73) return "C"
  if (percentage >= 70) return "C-"
  if (percentage >= 67) return "D+"
  if (percentage >= 65) return "D"
  return "F"
}
