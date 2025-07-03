import { type NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { rubrics, type Rubric } from "@/lib/grading-models"

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")
    const isTemplate = searchParams.get("template") === "true"

    let userRubrics = rubrics.filter((rubric) => rubric.teacherId === user.id || rubric.isTemplate)

    if (classId) {
      userRubrics = userRubrics.filter((rubric) => rubric.classId === classId || rubric.isTemplate)
    }

    if (isTemplate !== null) {
      userRubrics = userRubrics.filter((rubric) => rubric.isTemplate === isTemplate)
    }

    return NextResponse.json({ rubrics: userRubrics })
  } catch (error) {
    console.error("Get rubrics error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()

    if (user.role !== "teacher") {
      return NextResponse.json({ error: "Only teachers can create rubrics" }, { status: 403 })
    }

    const rubricData = await request.json()
    const { name, description, classId, criteria, isTemplate } = rubricData

    const totalPoints = criteria.reduce((sum: number, criterion: any) => {
      const maxPoints = Math.max(...criterion.levels.map((level: any) => level.points))
      return sum + maxPoints
    }, 0)

    const newRubric: Rubric = {
      id: "rubric_" + Date.now(),
      name,
      description,
      teacherId: user.id,
      classId,
      isTemplate: isTemplate || false,
      criteria,
      totalPoints,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    rubrics.push(newRubric)

    return NextResponse.json({ rubric: newRubric })
  } catch (error) {
    console.error("Create rubric error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
