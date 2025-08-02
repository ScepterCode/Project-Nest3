"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import {
  Clock,
  Star,
  MessageSquare,
  CheckCircle,
  AlertTriangle,
  Eye,
  Edit,
  Users,
  TrendingUp,
} from "lucide-react"

interface AssignedReview {
  id: string
  title: string
  status: string
  submission_title: string
  author_name: string
  due_date: string
  time_spent: number
  progress: number
  peer_review_assignment_id: string
}

interface ReceivedReview {
  id: string
  assignment_title: string
  reviewer_name: string
  submitted_at: string
  overall_rating: number
  max_rating: number
  feedback: {
    overall_comments?: string
    strengths: string[]
    improvements: string[]
  }
  helpfulness_rating?: number
}

interface ReviewStats {
  totalAssigned: number
  completed: number
  pending: number
  averageRating: number
  totalTimeSpent: number
  helpfulnessScore: number
}

export default function StudentPeerReviewsPage() {
  const [activeTab, setActiveTab] = useState("assigned")
  const [assignedReviews, setAssignedReviews] = useState<AssignedReview[]>([])
  const [receivedReviews, setReceivedReviews] = useState<ReceivedReview[]>([])
  const [reviewStats, setReviewStats] = useState<ReviewStats>({
    totalAssigned: 0,
    completed: 0,
    pending: 0,
    averageRating: 0,
    totalTimeSpent: 0,
    helpfulnessScore: 0,
  })
  const [loading, setLoading] = useState(true)

  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    if (!user) return
    fetchReviews()
  }, [user])

  const fetchReviews = async () => {
    if (!user) return
    
    setLoading(true)
    try {
      await Promise.all([
        fetchAssignedReviews(),
        fetchReceivedReviews()
      ])
    } catch (error) {
      console.error("Error fetching reviews:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAssignedReviews = async () => {
    if (!user) return
    
    try {
      const { data, error } = await supabase
        .from('peer_reviews')
        .select(`
          id,
          status,
          time_spent,
          peer_review_assignments!inner(
            id,
            title,
            end_date
          ),
          reviewee:users!reviewee_id(first_name, last_name),
          submissions(title)
        `)
        .eq('reviewer_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      const formattedReviews = data?.map(review => ({
        id: review.id,
        title: review.peer_review_assignments?.title || 'Untitled Review',
        status: review.status,
        submission_title: review.submissions?.title || 'Untitled Submission',
        author_name: `${review.reviewee?.first_name || ''} ${review.reviewee?.last_name || ''}`.trim() || 'Unknown Author',
        due_date: review.peer_review_assignments?.end_date || '',
        time_spent: review.time_spent || 0,
        progress: review.status === 'completed' ? 100 : review.status === 'in_progress' ? 50 : 0,
        peer_review_assignment_id: review.peer_review_assignments?.id || ''
      })) || []

      setAssignedReviews(formattedReviews)

      // Calculate stats
      const completed = formattedReviews.filter(r => r.status === 'completed').length
      const pending = formattedReviews.filter(r => r.status !== 'completed').length
      const totalTimeSpent = formattedReviews.reduce((sum, r) => sum + r.time_spent, 0)

      setReviewStats(prev => ({
        ...prev,
        totalAssigned: formattedReviews.length,
        completed,
        pending,
        totalTimeSpent
      }))
    } catch (error) {
      console.error("Error fetching assigned reviews:", error)
    }
  }

  const fetchReceivedReviews = async () => {
    if (!user) return
    
    try {
      const { data, error } = await supabase
        .from('peer_reviews')
        .select(`
          id,
          overall_rating,
          feedback,
          helpfulness_rating,
          submitted_at,
          peer_review_assignments!inner(title),
          reviewer:users!reviewer_id(first_name, last_name)
        `)
        .eq('reviewee_id', user.id)
        .eq('status', 'completed')
        .order('submitted_at', { ascending: false })

      if (error) throw error

      const formattedReviews = data?.map(review => ({
        id: review.id,
        assignment_title: review.peer_review_assignments?.title || 'Untitled Assignment',
        reviewer_name: `${review.reviewer?.first_name || ''} ${review.reviewer?.last_name || ''}`.trim() || 'Anonymous',
        submitted_at: review.submitted_at ? new Date(review.submitted_at).toLocaleDateString() : 'Unknown date',
        overall_rating: review.overall_rating || 0,
        max_rating: 5,
        feedback: {
          overall_comments: review.feedback?.overall_comments || '',
          strengths: review.feedback?.strengths || [],
          improvements: review.feedback?.improvements || []
        },
        helpfulness_rating: review.helpfulness_rating
      })) || []

      setReceivedReviews(formattedReviews)

      // Calculate average rating received
      const ratingsReceived = formattedReviews.filter(r => r.overall_rating > 0)
      const averageRating = ratingsReceived.length > 0
        ? ratingsReceived.reduce((sum, r) => sum + r.overall_rating, 0) / ratingsReceived.length
        : 0

      // Calculate helpfulness score
      const helpfulnessRatings = formattedReviews.filter(r => r.helpfulness_rating)
      const helpfulnessScore = helpfulnessRatings.length > 0
        ? helpfulnessRatings.reduce((sum, r) => sum + (r.helpfulness_rating || 0), 0) / helpfulnessRatings.length
        : 0

      setReviewStats(prev => ({
        ...prev,
        averageRating: Math.round(averageRating * 10) / 10,
        helpfulnessScore: Math.round(helpfulnessScore * 10) / 10
      }))
    } catch (error) {
      console.error("Error fetching received reviews:", error)
    }
  }

  const rateReviewHelpfulness = async (reviewId: string, rating: number) => {
    try {
      const { error } = await supabase
        .from('peer_reviews')
        .update({ helpfulness_rating: rating })
        .eq('id', reviewId)

      if (error) throw error
      alert("Review helpfulness rated!")
      fetchReviews() // Refresh data
    } catch (error: any) {
      console.error("Error rating review helpfulness:", error.message)
      alert("Failed to rate review helpfulness.")
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default'
      case 'in_progress': return 'secondary'
      case 'pending': return 'outline'
      case 'flagged': return 'destructive'
      default: return 'outline'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-3 w-3" />
      case 'in_progress': return <Clock className="h-3 w-3" />
      case 'pending': return <AlertTriangle className="h-3 w-3" />
      case 'flagged': return <AlertTriangle className="h-3 w-3" />
      default: return null
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-4">Access Denied</h2>
            <p className="text-gray-600">You need to be logged in to view peer reviews.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Peer Reviews</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Review your classmates&apos; work and see feedback on your submissions
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
                          Reviewing: <span className="font-medium">{review.submission_title}</span>
                        </p>

                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span>Author: {review.author_name}</span>
                          <span>Due: {review.due_date ? new Date(review.due_date).toLocaleDateString() : 'No due date'}</span>
                          {review.time_spent > 0 && <span>Time spent: {review.time_spent}m</span>}
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
                              href={`/dashboard/student/peer-reviews/${review.peer_review_assignment_id}/review/${review.id}`}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Link>
                          </Button>
                        ) : (
                          <Button size="sm" asChild>
                            <Link
                              href={`/dashboard/student/peer-reviews/${review.peer_review_assignment_id}/review/${review.id}`}
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
                    <p className="text-gray-600">You don&apos;t have any peer reviews to complete at the moment.</p>
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
                        <CardTitle className="text-lg">{review.assignment_title}</CardTitle>
                        <CardDescription>
                          Review by {review.reviewer_name} • {review.submitted_at}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-blue-600">
                          {review.overall_rating}/{review.max_rating}
                        </div>
                        <div className="text-sm text-gray-500">Overall Rating</div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Overall Comments */}
                    {review.feedback.overall_comments && (
                      <div>
                        <h4 className="font-medium mb-2">Overall Comments</h4>
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                          <p className="text-sm">{review.feedback.overall_comments}</p>
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
                                review.helpfulness_rating && rating <= review.helpfulness_rating
                                  ? "text-yellow-500"
                                  : "text-gray-300"
                              }`}
                            >
                              <Star className="h-4 w-4" fill="currentColor" />
                            </Button>
                          ))}
                        </div>
                      </div>
                      {review.helpfulness_rating && (
                        <p className="text-xs text-gray-500 mt-1 text-right">
                          You rated this review {review.helpfulness_rating}/5 stars
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
                      You haven&apos;t received any peer review feedback yet. Complete your assigned reviews to unlock
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
