import { type NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { grades, submissions, type Grade } from "@/lib/models"
import { rubrics } from "@/lib/grading-models"

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const assignmentId = searchParams.get("assignmentId")
    const studentId = searchParams.get("studentId")

    let userGrades: Grade[] = []

    if (user.role === "teacher") {
      userGrades = grades.filter((grade) => grade.teacherId === user.id)
      if (assignmentId) {
        userGrades = userGrades.filter((grade) => grade.assignmentId === assignmentId)
      }
    } else if (user.role === "student") {
      userGrades = grades.filter((grade) => grade.studentId === user.id && grade.status === "published")
      if (assignmentId) {
        userGrades = userGrades.filter((grade) => grade.assignmentId === assignmentId)
      }
    }

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

    // Calculate total points
    const totalPoints = criteriaGrades.reduce((sum: number, cg: any) => sum + cg.points, 0)
    const rubric = rubrics.find((r) => r.id === rubricId)
    const maxPoints = rubric?.totalPoints || 100
    const percentage = Math.round((totalPoints / maxPoints) * 100)

    const newGrade: Grade = {
      id: "grade_" + Date.now(),
      submissionId,
      assignmentId,
      studentId,
      teacherId: user.id,
      rubricId,
      criteriaGrades,
      totalPoints,
      maxPoints,
      percentage,
      letterGrade: calculateLetterGrade(percentage),
      feedback,
      status: status || "draft",
      gradedAt: new Date(),
      publishedAt: status === "published" ? new Date() : undefined,
    }

    grades.push(newGrade)

    // Update submission status
    const submission = submissions.find((s) => s.id === submissionId)
    if (submission) {
      submission.status = status === "published" ? "graded" : "submitted"
      submission.grade = totalPoints
      submission.feedback = feedback.overallComments
      submission.gradedAt = new Date()
      submission.gradedBy = user.id
    }

    return NextResponse.json({ grade: newGrade })
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
