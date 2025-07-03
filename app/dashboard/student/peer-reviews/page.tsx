"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  Clock,
  FileText,
  Star,
  MessageSquare,
  CheckCircle,
  AlertTriangle,
  Eye,
  Edit,
  Users,
  TrendingUp,
} from "lucide-react"

export default function StudentPeerReviewsPage() {
  const [activeTab, setActiveTab] = useState("assigned")

  // Mock data
  const assignedReviews = [
    {
      id: "pair_1",
      reviewAssignmentId: "peer_assign_1",
      title: "Essay Peer Review",
      submissionTitle: "The Impact of Climate Change",
      authorName: "Anonymous",
      dueDate: "2024-01-20",
      status: "pending",
      progress: 0,
      timeSpent: 0,
      estimatedTime: 30,
    },
    {
      id: "pair_2",
      reviewAssignmentId: "peer_assign_1",
      title: "Essay Peer Review",
      submissionTitle: "Renewable Energy Solutions",
      authorName: "Anonymous",
      dueDate: "2024-01-20",
      status: "in_progress",
      progress: 60,
      timeSpent: 18,
      estimatedTime: 30,
    },
    {
      id: "pair_3",
      reviewAssignmentId: "peer_assign_2",
      title: "Lab Report Review",
      submissionTitle: "Chemical Reactions Analysis",
      authorName: "Anonymous",
      dueDate: "2024-01-22",
      status: "completed",
      progress: 100,
      timeSpent: 25,
      estimatedTime: 20,
    },
  ]

  const receivedReviews = [
    {
      id: "review_1",
      assignmentTitle: "Cell Structure Lab Report",
      reviewerName: "Anonymous Reviewer 1",
      overallRating: 8,
      maxRating: 10,
      submittedAt: "2024-01-18",
      feedback: {
        strengths: [
          "Clear and detailed observations",
          "Good use of scientific terminology",
          "Well-organized structure",
        ],
        improvements: ["Could expand on the analysis section", "Add more references to support conclusions"],
        overallComments: "Good work overall! Your observations were accurate and well-documented.",
      },
      helpfulnessRating: null,
    },
    {
      id: "review_2",
      assignmentTitle: "Cell Structure Lab Report",
      reviewerName: "Anonymous Reviewer 2",
      overallRating: 7,
      maxRating: 10,
      submittedAt: "2024-01-18",
      feedback: {
        strengths: ["Professional presentation", "Accurate data collection"],
        improvements: ["Strengthen the conclusion", "Include more comparative analysis"],
        overallComments: "Solid work with room for improvement in analysis depth.",
      },
      helpfulnessRating: 4,
    },
  ]

  const reviewStats = {
    totalAssigned: 5,
    completed: 3,
    pending: 2,
    averageRating: 4.2,
    totalTimeSpent: 120,
    helpfulnessScore: 4.1,
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "default"
      case "in_progress":
        return "secondary"
      case "pending":
        return "destructive"
      case "overdue":
        return "destructive"
      default:
        return "outline"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4" />
      case "in_progress":
        return <Clock className="h-4 w-4" />
      case "pending":
        return <AlertTriangle className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const rateReviewHelpfulness = async (reviewId: string, rating: number) => {
    // API call to rate review helpfulness
    console.log(`Rating review ${reviewId} with ${rating} stars`)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Peer Reviews</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Review your classmates' work and see feedback on your submissions
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reviews Assigned</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reviewStats.totalAssigned}</div>
              <p className="text-xs text-muted-foreground">
                {reviewStats.completed} completed, {reviewStats.pending} pending
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Rating Given</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reviewStats.averageRating}/5</div>
              <p className="text-xs text-muted-foreground">Across all reviews</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Time Spent</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reviewStats.totalTimeSpent}m</div>
              <p className="text-xs text-muted-foreground">Total review time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Helpfulness Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reviewStats.helpfulnessScore}/5</div>
              <p className="text-xs text-muted-foreground">From peers</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="assigned">
              Reviews to Complete ({assignedReviews.filter((r) => r.status !== "completed").length})
            </TabsTrigger>
            <TabsTrigger value="received">Feedback Received ({receivedReviews.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="assigned" className="space-y-6">
            <div className="space-y-4">
              {assignedReviews.map((review) => (
                <Card key={review.id}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-semibold">{review.title}</h3>
                          <Badge variant={getStatusColor(review.status)}>
                            {getStatusIcon(review.status)}
                            <span className="ml-1 capitalize">{review.status.replace("_", " ")}</span>
                          </Badge>
                        </div>

                        <p className="text-gray-600 mb-2">
                          Reviewing: <span className="font-medium">{review.submissionTitle}</span>
                        </p>

                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span>Author: {review.authorName}</span>
                          <span>Due: {review.dueDate}</span>
                          {review.timeSpent > 0 && <span>Time spent: {review.timeSpent}m</span>}
                        </div>

                        {review.status === "in_progress" && (
                          <div className="mt-3">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-sm text-gray-600">Progress</span>
                              <span className="text-sm font-medium">{review.progress}%</span>
                            </div>
                            <Progress value={review.progress} className="h-2" />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 ml-4">
                        {review.status === "completed" ? (
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              href={`/dashboard/student/peer-reviews/${review.reviewAssignmentId}/review/${review.id}`}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Link>
                          </Button>
                        ) : (
                          <Button size="sm" asChild>
                            <Link
                              href={`/dashboard/student/peer-reviews/${review.reviewAssignmentId}/review/${review.id}`}
                            >
                              {review.status === "pending" ? (
                                <>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Start Review
                                </>
                              ) : (
                                <>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Continue
                                </>
                              )}
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {assignedReviews.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No reviews assigned</h3>
                    <p className="text-gray-600">You don't have any peer reviews to complete at the moment.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="received" className="space-y-6">
            <div className="space-y-4">
              {receivedReviews.map((review) => (
                <Card key={review.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{review.assignmentTitle}</CardTitle>
                        <CardDescription>
                          Review by {review.reviewerName} • {review.submittedAt}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-blue-600">
                          {review.overallRating}/{review.maxRating}
                        </div>
                        <div className="text-sm text-gray-500">Overall Rating</div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Overall Comments */}
                    {review.feedback.overallComments && (
                      <div>
                        <h4 className="font-medium mb-2">Overall Comments</h4>
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                          <p className="text-sm">{review.feedback.overallComments}</p>
                        </div>
                      </div>
                    )}

                    {/* Strengths */}
                    {review.feedback.strengths.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2 flex items-center space-x-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          <span>Strengths</span>
                        </h4>
                        <div className="space-y-1">
                          {review.feedback.strengths.map((strength, index) => (
                            <div key={index} className="bg-green-50 dark:bg-green-900/20 p-2 rounded text-sm">
                              {strength}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Improvements */}
                    {review.feedback.improvements.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2 flex items-center space-x-2">
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          <span>Areas for Improvement</span>
                        </h4>
                        <div className="space-y-1">
                          {review.feedback.improvements.map((improvement, index) => (
                            <div key={index} className="bg-orange-50 dark:bg-orange-900/20 p-2 rounded text-sm">
                              {improvement}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Helpfulness Rating */}
                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Was this review helpful?</span>
                        <div className="flex space-x-1">
                          {[1, 2, 3, 4, 5].map((rating) => (
                            <Button
                              key={rating}
                              variant="ghost"
                              size="sm"
                              onClick={() => rateReviewHelpfulness(review.id, rating)}
                              className={`p-1 ${
                                review.helpfulnessRating && rating <= review.helpfulnessRating
                                  ? "text-yellow-500"
                                  : "text-gray-300"
                              }`}
                            >
                              <Star className="h-4 w-4" fill="currentColor" />
                            </Button>
                          ))}
                        </div>
                      </div>
                      {review.helpfulnessRating && (
                        <p className="text-xs text-gray-500 mt-1 text-right">
                          You rated this review {review.helpfulnessRating}/5 stars
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {receivedReviews.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <MessageSquare className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No feedback yet</h3>
                    <p className="text-gray-600">
                      You haven't received any peer review feedback yet. Complete your assigned reviews to unlock
                      feedback on your own work.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
