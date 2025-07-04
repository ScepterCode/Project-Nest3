import { type NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { classes, enrollments, type ClassEnrollment } from "@/lib/models"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const classData = classes.find((cls) => cls.id === id)
    if (!classData) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    // Check access
    const hasAccess = classData.teacherId === user.id || user.role === "institution"

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const classEnrollments = enrollments.filter((enrollment) => enrollment.classId === id)

    return NextResponse.json({ enrollments: classEnrollments })
  } catch (error) {
    console.error("Get class students error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const classData = classes.find((cls) => cls.id === id)
    if (!classData) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    const { studentEmail, studentId } = await request.json()

    // For joining by class code (student)
    if (user.role === "student") {
      // Check if already enrolled
      const existingEnrollment = enrollments.find(
        (enrollment) => enrollment.classId === id && enrollment.studentId === user.id,
      )

      if (existingEnrollment) {
        return NextResponse.json({ error: "Already enrolled in this class" }, { status: 400 })
      }

      const newEnrollment: ClassEnrollment = {
        id: "enroll_" + new Date().toISOString(),
        classId: id,
        studentId: user.id,
        enrolledAt: new Date(),
        status: classData.settings.requireApproval ? "pending" : "active",
      }

      enrollments.push(newEnrollment)

      return NextResponse.json({ enrollment: newEnrollment })
    }

    // For teacher inviting students
    if (user.role === "teacher" && classData.teacherId === user.id) {
      // In a real app, you'd send an email invitation
      // For now, we'll create a pending enrollment

      const newEnrollment: ClassEnrollment = {
        id: "enroll_" + new Date().toISOString(),
        classId: id,
        studentId: studentId || "pending_" + new Date().toISOString(),
        enrolledAt: new Date(),
        status: "pending",
      }

      enrollments.push(newEnrollment)

      return NextResponse.json({
        enrollment: newEnrollment,
        message: "Invitation sent successfully",
      })
    }

    return NextResponse.json({ error: "Access denied" }, { status: 403 })
  } catch (error) {
    console.error("Add student error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
