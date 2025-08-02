"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  ArrowLeft,
  Users,
  Clock,
  Star,
  CheckCircle,
  AlertTriangle,
  Eye,
  MessageSquare,
  BarChart3,
  Settings,
  Download
} from "lucide-react"
import { Label } from "recharts"

interface PeerReviewAssignment {
  id: string
  title: string
  description: string
  status: string
  review_type: string
  reviews_per_student: number
  start_date: string
  end_date: string
  instructions: string
  assignment_title: string
  class_name: string
  settings: any
}

interface ReviewData {
  id: string
  reviewer_name: string
  reviewee_name: string
  status: string
  overall_rating: number
  feedback: any
  time_spent: number
  submitted_at: string
  is_flagged: boolean
}

interface StudentProgress {
  student_id: string
  student_name: string
  reviews_assigned: number
  reviews_completed: number
  reviews_received: number
  average_rating_given: number
  average_rating_received: number
}

export default function PeerReviewManagementPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()

  const [peerReviewAssignment, setPeerReviewAssignment] = useState<PeerReviewAssignment | null>(null)
  const [reviews, setReviews] = useState<ReviewData[]>([])
  const [studentProgress, setStudentProgress] = useState<StudentProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("overview")

  useEffect(() => {
    if (user && params.id) {
      fetchData()
    }
  }, [user, params.id])

  const fetchData = async () => {
    try {
      await Promise.all([
        fetchPeerReviewAssignment(),
        fetchReviews(),
        fetchStudentProgress()
      ])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPeerReviewAssignment = async () => {
    try {
      const { data, error } = await supabase
        .from('peer_review_assignments')
        .select(`
          id,
          title,
          description,
          status,
          review_type,
          reviews_per_student,
          start_date,
          end_date,
          instructions,
          settings,
          assignments!inner(title),
          classes!inner(name)
        `)
        .eq('id', params.id)
        .eq('teacher_id', user?.id)
        .single()

      if (error) throw error

      setPeerReviewAssignment({
        ...data,
        assignment_title: (data.assignments as any)?.title || 'Unknown Assignment',
        class_name: (data.classes as any)?.name || 'Unknown Class'
      })
    } catch (error) {
      console.error('Error fetching peer review assignment:', error)
      router.push('/dashboard/teacher/peer-reviews')
    }
  }

  const fetchReviews = async () => {
    try {
      const { data, error } = await supabase
        .from('peer_reviews')
        .select(`
          id,
          status,
          overall_rating,
          feedback,
          time_spent,
          submitted_at,
          is_flagged,
          reviewer:users!reviewer_id(first_name, last_name),
          reviewee:users!reviewee_id(first_name, last_name)
        `)
        .eq('peer_review_assignment_id', params.id)
        .order('submitted_at', { ascending: false })

      if (error) throw error

      const formattedReviews = data?.map(review => ({
        id: review.id,
        reviewer_name: `${(review.reviewer as any)?.first_name || ''} ${(review.reviewer as any)?.last_name || ''}`.trim() || 'Unknown',
        reviewee_name: `${(review.reviewee as any)?.first_name || ''} ${(review.reviewee as any)?.last_name || ''}`.trim() || 'Unknown',
        status: review.status,
        overall_rating: review.overall_rating || 0,
        feedback: review.feedback || {},
        time_spent: review.time_spent || 0,
        submitted_at: review.submitted_at || '',
        is_flagged: review.is_flagged || false
      })) || []

      setReviews(formattedReviews)
    } catch (error) {
      console.error('Error fetching reviews:', error)
    }
  }

  const fetchStudentProgress = async () => {
    try {
      // Get all students involved in this peer review
      const { data: reviewData, error } = await supabase
        .from('peer_reviews')
        .select(`
          reviewer_id,
          reviewee_id,
          status,
          overall_rating,
          reviewer:users!reviewer_id(first_name, last_name),
          reviewee:users!reviewee_id(first_name, last_name)
        `)
        .eq('peer_review_assignment_id', params.id)

      if (error) throw error

      // Process student progress
      const studentMap = new Map<string, StudentProgress>()

      reviewData?.forEach(review => {
        const reviewerId = review.reviewer_id
        const revieweeId = review.reviewee_id
        const reviewerName = `${(review.reviewer as any)?.first_name || ''} ${(review.reviewer as any)?.last_name || ''}`.trim() || 'Unknown'
        const revieweeName = `${(review.reviewee as any)?.first_name || ''} ${(review.reviewee as any)?.last_name || ''}`.trim() || 'Unknown'

        // Initialize reviewer if not exists
        if (!studentMap.has(reviewerId)) {
          studentMap.set(reviewerId, {
            student_id: reviewerId,
            student_name: reviewerName,
            reviews_assigned: 0,
            reviews_completed: 0,
            reviews_received: 0,
            average_rating_given: 0,
            average_rating_received: 0
          })
        }

        // Initialize reviewee if not exists
        if (!studentMap.has(revieweeId)) {
          studentMap.set(revieweeId, {
            student_id: revieweeId,
            student_name: revieweeName,
            reviews_assigned: 0,
            reviews_completed: 0,
            reviews_received: 0,
            average_rating_given: 0,
            average_rating_received: 0
          })
        }

        // Update reviewer stats
        const reviewerStats = studentMap.get(reviewerId)!
        reviewerStats.reviews_assigned++
        if (review.status === 'completed') {
          reviewerStats.reviews_completed++
        }

        // Update reviewee stats
        const revieweeStats = studentMap.get(revieweeId)!
        if (review.status === 'completed') {
          revieweeStats.reviews_received++
        }
      })

      // Calculate averages
      studentMap.forEach(student => {
        const givenRatings = reviewData?.filter(r => 
          r.reviewer_id === student.student_id && 
          r.status === 'completed' && 
          r.overall_rating
        ) || []
        
        const receivedRatings = reviewData?.filter(r => 
          r.reviewee_id === student.student_id && 
          r.status === 'completed' && 
          r.overall_rating
        ) || []

        student.average_rating_given = givenRatings.length > 0
          ? givenRatings.reduce((sum, r) => sum + (r.overall_rating || 0), 0) / givenRatings.length
          : 0

        student.average_rating_received = receivedRatings.length > 0
          ? receivedRatings.reduce((sum, r) => sum + (r.overall_rating || 0), 0) / receivedRatings.length
          : 0
      })

      setStudentProgress(Array.from(studentMap.values()))
    } catch (error) {
      console.error('Error fetching student progress:', error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'default'
      case 'completed': return 'secondary'
      case 'draft': return 'outline'
      default: return 'outline'
    }
  }

  const getReviewStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default'
      case 'in_progress': return 'secondary'
      case 'pending': return 'outline'
      case 'flagged': return 'destructive'
      default: return 'outline'
    }
  }

  const formatTimeAgo = (dateString: string) => {
    if (!dateString) return 'Not submitted'
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hours ago`
    return `${Math.floor(diffInMinutes / 1440)} days ago`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!peerReviewAssignment) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-4">Peer Review Not Found</h2>
            <p className="text-gray-600 mb-4">The peer review assignment you're looking for doesn't exist.</p>
            <Link href="/dashboard/teacher/peer-reviews">
              <Button>Back to Peer Reviews</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const completedReviews = reviews.filter(r => r.status === 'completed').length
  const totalReviews = reviews.length
  const flaggedReviews = reviews.filter(r => r.is_flagged).length
  const averageRating = completedReviews > 0
    ? reviews.filter(r => r.overall_rating > 0).reduce((sum, r) => sum + r.overall_rating, 0) / reviews.filter(r => r.overall_rating > 0).length
    : 0

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard/teacher/peer-reviews">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Peer Reviews
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">{peerReviewAssignment.title}</h1>
              <p className="text-gray-600">
                {peerReviewAssignment.assignment_title} • {peerReviewAssignment.class_name}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant={getStatusColor(peerReviewAssignment.status)}>
              {peerReviewAssignment.status}
            </Badge>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export Results
            </Button>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reviews</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalReviews}</div>
              <p className="text-xs text-muted-foreground">{completedReviews} completed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalReviews > 0 ? Math.round((completedReviews / totalReviews) * 100) : 0}%
              </div>
              <p className="text-xs text-muted-foreground">
                {completedReviews}/{totalReviews} reviews
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round(averageRating * 10) / 10}/5</div>
              <p className="text-xs text-muted-foreground">From completed reviews</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Flagged Reviews</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{flaggedReviews}</div>
              <p className="text-xs text-muted-foreground">Need attention</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="reviews">All Reviews ({reviews.length})</TabsTrigger>
            <TabsTrigger value="students">Student Progress ({studentProgress.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Assignment Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Assignment Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Description</Label>
                    <p className="text-sm text-gray-600">
                      {peerReviewAssignment.description || 'No description provided'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Review Type</Label>
                    <p className="text-sm text-gray-600 capitalize">
                      {peerReviewAssignment.review_type}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Reviews per Student</Label>
                    <p className="text-sm text-gray-600">
                      {peerReviewAssignment.reviews_per_student}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Timeline</Label>
                    <p className="text-sm text-gray-600">
                      {peerReviewAssignment.start_date ? new Date(peerReviewAssignment.start_date).toLocaleDateString() : 'No start date'} - {peerReviewAssignment.end_date ? new Date(peerReviewAssignment.end_date).toLocaleDateString() : 'No end date'}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Progress Overview */}
              <Card>
                <CardHeader>
                  <CardTitle>Progress Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Overall Completion</span>
                      <span className="text-sm text-gray-600">
                        {completedReviews}/{totalReviews}
                      </span>
                    </div>
                    <Progress 
                      value={totalReviews > 0 ? (completedReviews / totalReviews) * 100 : 0} 
                      className="h-2"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Completed Reviews</span>
                      <span className="font-medium">{completedReviews}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>In Progress</span>
                      <span className="font-medium">
                        {reviews.filter(r => r.status === 'in_progress').length}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Pending</span>
                      <span className="font-medium">
                        {reviews.filter(r => r.status === 'pending').length}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="reviews" className="space-y-6">
            <div className="space-y-4">
              {reviews.map((review) => (
                <Card key={review.id}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="flex items-center space-x-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {review.reviewer_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{review.reviewer_name}</p>
                              <p className="text-xs text-gray-500">reviewing {review.reviewee_name}</p>
                            </div>
                          </div>
                          <Badge variant={getReviewStatusColor(review.status)}>
                            {review.status}
                          </Badge>
                          {review.is_flagged && (
                            <Badge variant="destructive">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Flagged
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          {review.overall_rating > 0 && (
                            <div className="flex items-center space-x-1">
                              <Star className="h-4 w-4 text-yellow-500" />
                              <span>{review.overall_rating}/5</span>
                            </div>
                          )}
                          {review.time_spent > 0 && (
                            <div className="flex items-center space-x-1">
                              <Clock className="h-4 w-4" />
                              <span>{review.time_spent}m</span>
                            </div>
                          )}
                          <span>{formatTimeAgo(review.submitted_at)}</span>
                        </div>

                        {review.feedback?.overall_comments && (
                          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <p className="text-sm">{review.feedback.overall_comments}</p>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 ml-4">
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {reviews.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <MessageSquare className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No reviews yet</h3>
                    <p className="text-gray-600">Reviews will appear here once students start submitting them.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="students" className="space-y-6">
            <div className="space-y-4">
              {studentProgress.map((student) => (
                <Card key={student.student_id}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>
                            {student.student_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-medium">{student.student_name}</h3>
                          <p className="text-sm text-gray-500">
                            {student.reviews_completed}/{student.reviews_assigned} reviews completed
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-6 text-sm">
                        <div className="text-center">
                          <div className="font-medium">{student.reviews_received}</div>
                          <div className="text-gray-500">Received</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">
                            {student.average_rating_given > 0 ? `${Math.round(student.average_rating_given * 10) / 10}/5` : '-'}
                          </div>
                          <div className="text-gray-500">Avg Given</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">
                            {student.average_rating_received > 0 ? `${Math.round(student.average_rating_received * 10) / 10}/5` : '-'}
                          </div>
                          <div className="text-gray-500">Avg Received</div>
                        </div>
                        <div className="w-24">
                          <Progress 
                            value={student.reviews_assigned > 0 ? (student.reviews_completed / student.reviews_assigned) * 100 : 0}
                            className="h-2"
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {studentProgress.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No student data</h3>
                    <p className="text-gray-600">Student progress will appear here once reviews are assigned.</p>
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