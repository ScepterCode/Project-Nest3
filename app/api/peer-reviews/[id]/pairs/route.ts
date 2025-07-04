import { type NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import {
  peerReviewAssignments,
  peerReviewPairs,
  type PeerReviewAssignmentPair,
  type PeerReviewAssignment,
} from "@/lib/peer-review-models"
import { submissions, enrollments } from "@/lib/models"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const { id } = params

    const reviewAssignment = peerReviewAssignments.find((r) => r.id === id)
    if (!reviewAssignment) {
      return NextResponse.json({ error: "Peer review assignment not found" }, { status: 404 })
    }

    // Check access
    const hasAccess =
      (user.role === "teacher" && reviewAssignment.teacherId === user.id) ||
      (user.role === "student" &&
        peerReviewPairs.some((pair) => pair.reviewAssignmentId === id && pair.reviewerId === user.id))

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    let pairs = peerReviewPairs.filter((pair) => pair.reviewAssignmentId === id)

    // For students, only return their own pairs
    if (user.role === "student") {
      pairs = pairs.filter((pair) => pair.reviewerId === user.id)
    }

    return NextResponse.json({ pairs })
  } catch (error) {
    console.error("Get peer review pairs error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const { id } = params

    if (user.role !== "teacher") {
      return NextResponse.json({ error: "Only teachers can assign peer reviews" }, { status: 403 })
    }

    const reviewAssignment = peerReviewAssignments.find((r) => r.id === id && r.teacherId === user.id)
    if (!reviewAssignment) {
      return NextResponse.json({ error: "Peer review assignment not found" }, { status: 404 })
    }

    // Generate pairs based on review method
    const newPairs = await generateReviewPairs(reviewAssignment)
    peerReviewPairs.push(...newPairs)

    // Update assignment status
    reviewAssignment.status = "active"
    reviewAssignment.updatedAt = new Date()

    return NextResponse.json({ pairs: newPairs, message: "Peer review pairs generated successfully" })
  } catch (error) {
    console.error("Generate peer review pairs error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function generateReviewPairs(reviewAssignment: PeerReviewAssignment): Promise<PeerReviewAssignmentPair[]> {
  // Get all submissions for the assignment
  const assignmentSubmissions = submissions.filter((s) => s.assignmentId === reviewAssignment.assignmentId)

  // Get all enrolled students
  const classEnrollments = enrollments.filter((e) => e.classId === reviewAssignment.classId && e.status === "active")
  const studentIds = classEnrollments.map((e) => e.studentId)

  const pairs: PeerReviewAssignmentPair[] = []

  if (reviewAssignment.reviewMethod === "random") {
    // Random assignment algorithm
    const shuffledSubmissions = [...assignmentSubmissions].sort(() => 0.5 - 0.5)
    const shuffledStudents = [...studentIds].sort(() => 0.5 - 0.5)

    for (const studentId of shuffledStudents) {
      let assignedReviews = 0

      for (const submission of shuffledSubmissions) {
        // Skip if student is reviewing their own work and not allowed
        if (submission.studentId === studentId && !reviewAssignment.settings.allowSelfReview) {
          continue
        }

        // Skip if this submission already has enough reviews
        const existingReviews = pairs.filter((p) => p.submissionId === submission.id).length
        if (existingReviews >= reviewAssignment.reviewsPerSubmission) {
          continue
        }

        // Skip if student already reviewing this submission
        if (pairs.some((p) => p.reviewerId === studentId && p.submissionId === submission.id)) {
          continue
        }

        pairs.push({
          id: `pair_${new Date().toISOString()}_fixed`,
          reviewAssignmentId: reviewAssignment.id,
          reviewerId: studentId,
          submissionId: submission.id,
          authorId: submission.studentId,
          status: "pending",
          assignedAt: new Date(),
          remindersSent: 0,
        })

        assignedReviews++
        if (assignedReviews >= reviewAssignment.reviewsPerStudent) {
          break
        }
      }
    }
  }

  return pairs
}
