import { type NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { assignments, classes, enrollments, submissions, type Assignment } from "@/lib/models"

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")

    let userAssignments: Assignment[] = []

    if (user.role === "teacher") {
      // Teachers see assignments they created
      userAssignments = assignments.filter((assignment) => assignment.teacherId === user.id)
      if (classId) {
        userAssignments = userAssignments.filter((assignment) => assignment.classId === classId)
      }
    } else if (user.role === "student") {
      // Students see assignments from classes they're enrolled in
      const studentEnrollments = enrollments.filter(
        (enrollment) => enrollment.studentId === user.id && enrollment.status === "active",
      )
      const enrolledClassIds = studentEnrollments.map((enrollment) => enrollment.classId)
      userAssignments = assignments.filter(
        (assignment) => enrolledClassIds.includes(assignment.classId) && assignment.status === "published",
      )
      if (classId) {
        userAssignments = userAssignments.filter((assignment) => assignment.classId === classId)
      }
    }

    // Add submission status for students
    const assignmentsWithStatus = userAssignments.map((assignment) => {
      if (user.role === "student") {
        const submission = submissions.find((sub) => sub.assignmentId === assignment.id && sub.studentId === user.id)
        return {
          ...assignment,
          submission,
          hasSubmitted: !!submission,
        }
      }

      // For teachers, add submission count
      const assignmentSubmissions = submissions.filter((sub) => sub.assignmentId === assignment.id)
      return {
        ...assignment,
        submissionCount: assignmentSubmissions.length,
      }
    })

    return NextResponse.json({ assignments: assignmentsWithStatus })
  } catch (error) {
    console.error("Get assignments error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()

    if (user.role !== "teacher") {
      return NextResponse.json({ error: "Only teachers can create assignments" }, { status: 403 })
    }

    const { title, description, classId, dueDate, maxPoints, allowLateSubmission, instructions } = await request.json()

    if (!title || !classId || !dueDate) {
      return NextResponse.json({ error: "Title, class, and due date are required" }, { status: 400 })
    }

    // Verify teacher owns the class
    const classData = classes.find((cls) => cls.id === classId && cls.teacherId === user.id)
    if (!classData) {
      return NextResponse.json({ error: "Class not found or access denied" }, { status: 404 })
    }

    const newAssignment: Assignment = {
      id: "assign_" + Date.now(),
      title,
      description,
      classId,
      teacherId: user.id,
      dueDate: new Date(dueDate),
      maxPoints: maxPoints || 100,
      allowLateSubmission: allowLateSubmission || false,
      instructions,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    assignments.push(newAssignment)

    return NextResponse.json({ assignment: newAssignment })
  } catch (error) {
    console.error("Create assignment error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
