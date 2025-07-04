import { type NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { peerReviews, peerReviewPairs, type PeerReview } from "@/lib/peer-review-models"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const submissionId = searchParams.get("submissionId")

    let reviews = peerReviews.filter((review) => review.reviewAssignmentId === id)

    if (submissionId) {
      reviews = reviews.filter((review) => review.submissionId === submissionId)
    }

    // Filter based on user role and permissions
    if (user.role === "student") {
      // Students can see reviews they wrote or reviews of their own work
      reviews = reviews.filter((review) => review.reviewerId === user.id || review.authorId === user.id)
    }

    return NextResponse.json({ reviews })
  } catch (error) {
    console.error("Get peer reviews error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    if (user.role !== "student") {
      return NextResponse.json({ error: "Only students can submit peer reviews" }, { status: 403 })
    }

    const reviewData = await request.json()
    const { pairId, responses, overallComments, strengths, improvements, timeSpent } = reviewData

    // Verify the pair exists and belongs to this student
    const pair = peerReviewPairs.find((p) => p.id === pairId && p.reviewerId === user.id)
    if (!pair) {
      return NextResponse.json({ error: "Review assignment not found" }, { status: 404 })
    }

    // Calculate overall rating from responses
    const ratingResponses = responses.filter((r: any) => r.type === "rating")
    const overallRating =
      ratingResponses.length > 0
        ? ratingResponses.reduce((sum: number, r: any) => sum + Number(r.value), 0) / ratingResponses.length
        : undefined

    const newReview: PeerReview = {
      id: "review_" + new Date().toISOString(),
      pairId,
      reviewAssignmentId: id,
      reviewerId: user.id,
      submissionId: pair.submissionId,
      authorId: pair.authorId,
      responses,
      overallRating,
      overallComments,
      strengths: strengths || [],
      improvements: improvements || [],
      isAnonymous: true, // Based on assignment settings
      status: "submitted",
      timeSpent: timeSpent || 0,
      submittedAt: new Date(),
    }

    peerReviews.push(newReview)

    // Update pair status
    pair.status = "completed"
    pair.completedAt = new Date()

    return NextResponse.json({ review: newReview })
  } catch (error) {
    console.error("Submit peer review error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
