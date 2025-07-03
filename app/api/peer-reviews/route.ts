import { type NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { peerReviewAssignments, peerReviewPairs, type PeerReviewAssignment } from "@/lib/peer-review-models"
import { assignments } from "@/lib/models"

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")
    const status = searchParams.get("status")

    let userReviews: PeerReviewAssignment[] = []

    if (user.role === "teacher") {
      userReviews = peerReviewAssignments.filter((review) => review.teacherId === user.id)
    } else if (user.role === "student") {
      // Get peer review assignments for classes the student is enrolled in
      const studentPairs = peerReviewPairs.filter((pair) => pair.reviewerId === user.id)
      const reviewIds = studentPairs.map((pair) => pair.reviewAssignmentId)
      userReviews = peerReviewAssignments.filter((review) => reviewIds.includes(review.id))
    }

    if (classId) {
      userReviews = userReviews.filter((review) => review.classId === classId)
    }

    if (status) {
      userReviews = userReviews.filter((review) => review.status === status)
    }

    return NextResponse.json({ peerReviews: userReviews })
  } catch (error) {
    console.error("Get peer reviews error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()

    if (user.role !== "teacher") {
      return NextResponse.json({ error: "Only teachers can create peer review assignments" }, { status: 403 })
    }

    const reviewData = await request.json()
    const {
      title,
      description,
      assignmentId,
      classId,
      reviewType,
      reviewMethod,
      reviewsPerStudent,
      reviewsPerSubmission,
      customQuestions,
      settings,
      endDate,
    } = reviewData

    // Verify the assignment exists and teacher owns it
    const assignment = assignments.find((a) => a.id === assignmentId && a.teacherId === user.id)
    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found or access denied" }, { status: 404 })
    }

    const newPeerReview: PeerReviewAssignment = {
      id: "peer_assign_" + Date.now(),
      title,
      description,
      assignmentId,
      classId,
      teacherId: user.id,
      reviewType,
      reviewMethod,
      reviewsPerStudent,
      reviewsPerSubmission,
      customQuestions,
      settings,
      status: "draft",
      startDate: new Date(),
      endDate: new Date(endDate),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    peerReviewAssignments.push(newPeerReview)

    return NextResponse.json({ peerReview: newPeerReview })
  } catch (error) {
    console.error("Create peer review error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
