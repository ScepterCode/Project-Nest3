import { type NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { classes, enrollments, type Class } from "@/lib/models"

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const role = searchParams.get("role") || user.role

    let userClasses: Class[] = []

    if (user.role === "teacher") {
      // Teachers see classes they created
      userClasses = classes.filter((cls) => cls.teacherId === user.id)
    } else if (user.role === "student") {
      // Students see classes they're enrolled in
      const studentEnrollments = enrollments.filter(
        (enrollment) => enrollment.studentId === user.id && enrollment.status === "active",
      )
      const enrolledClassIds = studentEnrollments.map((enrollment) => enrollment.classId)
      userClasses = classes.filter((cls) => enrolledClassIds.includes(cls.id))
    } else if (user.role === "institution") {
      // Institution admins see all classes in their institution
      userClasses = classes.filter((cls) => cls.institutionId === user.institutionId)
    }

    return NextResponse.json({ classes: userClasses })
  } catch (error) {
    console.error("Get classes error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()

    if (user.role !== "teacher" && user.role !== "institution") {
      return NextResponse.json({ error: "Only teachers and institution admins can create classes" }, { status: 403 })
    }

    const { name, description, allowStudentJoin, requireApproval } = await request.json()

    if (!name) {
      return NextResponse.json({ error: "Class name is required" }, { status: 400 })
    }

    const newClass: Class = {
      id: "class_" + new Date().toISOString(),
      name,
      code: generateClassCode(),
      description,
      teacherId: user.id,
      institutionId: user.institutionId,
      settings: {
        allowStudentJoin: allowStudentJoin || true,
        requireApproval: requireApproval || false,
        isArchived: false,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    classes.push(newClass)

    return NextResponse.json({ class: newClass })
  } catch (error) {
    console.error("Create class error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function generateClassCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let result = ""
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(0.5 * chars.length))
  }
  return result
}
