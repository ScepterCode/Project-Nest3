import { type NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { classes, enrollments, assignments, submissions } from "@/lib/models"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const classData = classes.find((cls) => cls.id === id)
    if (!classData) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    // Check if user has access to this class
    const hasAccess =
      user.role === "institution" ||
      classData.teacherId === user.id ||
      (user.role === "student" &&
        enrollments.some((enrollment) => enrollment.classId === id && enrollment.studentId === user.id))

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Get class enrollments
    const classEnrollments = enrollments.filter((enrollment) => enrollment.classId === id)

    // Get class assignments
    const classAssignments = assignments.filter((assignment) => assignment.classId === id)

    // Get submission stats for assignments
    const assignmentStats = classAssignments.map((assignment) => {
      const assignmentSubmissions = submissions.filter((sub) => sub.assignmentId === assignment.id)
      return {
        ...assignment,
        submissionCount: assignmentSubmissions.length,
        totalStudents: classEnrollments.length,
      }
    })

    return NextResponse.json({
      class: classData,
      enrollments: classEnrollments,
      assignments: assignmentStats,
      studentCount: classEnrollments.length,
    })
  } catch (error) {
    console.error("Get class error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const classData = classes.find((cls) => cls.id === id)
    if (!classData) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    // Check if user can edit this class
    if (classData.teacherId !== user.id && user.role !== "institution") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const updates = await request.json()

    // Update class data
    Object.assign(classData, {
      ...updates,
      updatedAt: new Date(),
    })

    return NextResponse.json({ class: classData })
  } catch (error) {
    console.error("Update class error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
