"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Plus,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  Eye,
  Settings,
  BarChart3,
  MessageSquare,
  Star,
  TrendingUp,
} from "lucide-react"

interface PeerReviewAssignment {
  id: string
  title: string
  assignment_title: string
  class_id: string
  class_name: string
  status: string
  review_type: string
  total_students: number
  reviews_completed: number
  total_reviews: number
  start_date: string
  end_date: string
  average_rating: number
  average_time_spent: number
}

interface Class {
  id: string
  name: string
}

interface Activity {
  id: string
  activity_type: string
  user_name: string
  assignment_title: string
  created_at: string
  details?: any
}

interface OverallStats {
  totalAssignments: number
  activeAssignments: number
  totalReviews: number
  averageQuality: number
  participationRate: number
  flaggedReviews: number
}

export default function TeacherPeerReviewsPage() {
  const [activeTab, setActiveTab] = useState("active")
  const [selectedClass, setSelectedClass] = useState("all")
  const [peerReviewAssignments, setPeerReviewAssignments] = useState<PeerReviewAssignment[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [recentActivity, setRecentActivity] = useState<Activity[]>([])
  const [overallStats, setOverallStats] = useState<OverallStats>({
    totalAssignments: 0,
    activeAssignments: 0,
    totalReviews: 0,
    averageQuality: 0,
    participationRate: 0,
    flaggedReviews: 0
  })
  const [loading, setLoading] = useState(true)

  const { user } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    if (user) {
      fetchData()
    }
  }, [user])

  const fetchData = async () => {
    if (!user) return
    
    setLoading(true)
    try {
      // First fetch assignments and classes
      await Promise.all([
        fetchPeerReviewAssignments(),
        fetchClasses()
      ])
      
      // Then fetch activity and stats after assignments are loaded
      await Promise.all([
        fetchRecentActivity(),
        fetchOverallStats()
      ])
    } catch (error) {
      console.error('Error fetching peer review data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPeerReviewAssignments = async () => {
    if (!user) return
    
    try {
      const { data, error } = await supabase
        .from('peer_review_assignments')
        .select(`
          id,
          title,
          status,
          review_type,
          start_date,
          end_date,
          assignments!inner(title),
          classes!inner(name, id),
          peer_reviews(
            id,
            status,
            overall_rating,
            time_spent
          )
        `)
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      const formattedAssignments = data?.map(assignment => {
        const completedReviews = assignment.peer_reviews?.filter(r => r.status === 'completed') || []
        const totalReviews = assignment.peer_reviews?.length || 0
        const avgRating = completedReviews.length > 0 
          ? completedReviews.reduce((sum, r) => sum + (r.overall_rating || 0), 0) / completedReviews.length 
          : 0
        const avgTime = completedReviews.length > 0
          ? completedReviews.reduce((sum, r) => sum + (r.time_spent || 0), 0) / completedReviews.length
          : 0

        return {
          id: assignment.id,
          title: assignment.title,
          assignment_title: (assignment.assignments as any)?.title || 'Unknown Assignment',
          class_id: (assignment.classes as any)?.id || '',
          class_name: (assignment.classes as any)?.name || 'Unknown Class',
          status: assignment.status,
          review_type: assignment.review_type,
          total_students: 0, // Will be calculated from enrollments
          reviews_completed: completedReviews.length,
          total_reviews: totalReviews,
          start_date: assignment.start_date,
          end_date: assignment.end_date,
          average_rating: Math.round(avgRating * 10) / 10,
          average_time_spent: Math.round(avgTime)
        }
      }) || []

      setPeerReviewAssignments(formattedAssignments)
    } catch (error) {
      console.error('Error fetching peer review assignments:', error)
    }
  }

  const fetchClasses = async () => {
    if (!user) return
    
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', user.id)
        .order('name')

      if (error) throw error
      setClasses(data || [])
    } catch (error) {
      console.error('Error fetching classes:', error)
      setClasses([])
    }
  }

  const fetchRecentActivity = async () => {
    try {
      // Only fetch if we have assignments to filter by
      if (peerReviewAssignments.length === 0) {
        setRecentActivity([])
        return
      }

      // Temporary: Disable recent activity to prevent console errors
      // TODO: Fix foreign key relationships in peer_review_activity table
      console.log('ℹ️ Recent activity temporarily disabled to prevent console errors');
      setRecentActivity([]);
      return;

      // First get the activity data without joins
      const { data: activityData, error } = await supabase
        .from('peer_review_activity')
        .select(`
          id,
          activity_type,
          created_at,
          details,
          user_id,
          peer_review_assignment_id
        `)
        .in('peer_review_assignment_id', peerReviewAssignments.map(a => a.id))
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error

      if (!activityData || activityData.length === 0) {
        setRecentActivity([])
        return
      }

      // Get user names separately
      const userIds = [...new Set(activityData.map(a => a.user_id).filter(Boolean))]
      let userNames: Record<string, string> = {}
      
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, first_name, last_name')
          .in('id', userIds)
          
        if (users) {
          userNames = users.reduce((acc, user) => {
            acc[user.id] = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown User'
            return acc
          }, {} as Record<string, string>)
        }
      }

      // Get assignment titles separately
      const assignmentTitles = peerReviewAssignments.reduce((acc, assignment) => {
        acc[assignment.id] = assignment.title
        return acc
      }, {} as Record<string, string>)

      const formattedActivity = activityData.map(activity => ({
        id: activity.id,
        activity_type: activity.activity_type,
        user_name: userNames[activity.user_id] || 'Unknown User',
        assignment_title: assignmentTitles[activity.peer_review_assignment_id] || 'Unknown Assignment',
        created_at: activity.created_at,
        details: activity.details
      }))

      setRecentActivity(formattedActivity)
    } catch (error) {
      console.error('Error fetching recent activity:', error)
      console.error('Recent activity error details:', JSON.stringify(error, null, 2))
      setRecentActivity([])
    }
  }

  const fetchOverallStats = async () => {
    try {
      // Get basic counts
      const totalAssignments = peerReviewAssignments.length
      const activeAssignments = peerReviewAssignments.filter(a => a.status === 'active').length
      const totalReviews = peerReviewAssignments.reduce((sum, a) => sum + a.total_reviews, 0)
      const completedReviews = peerReviewAssignments.reduce((sum, a) => sum + a.reviews_completed, 0)
      
      // Calculate average quality
      const reviewsWithRatings = peerReviewAssignments.filter(a => a.average_rating > 0)
      const averageQuality = reviewsWithRatings.length > 0
        ? reviewsWithRatings.reduce((sum, a) => sum + a.average_rating, 0) / reviewsWithRatings.length
        : 0

      // Calculate participation rate
      const participationRate = totalReviews > 0 ? (completedReviews / totalReviews) * 100 : 0

      // Get flagged reviews count only if we have assignments
      let flaggedCount = 0
      if (peerReviewAssignments.length > 0) {
        const { count } = await supabase
          .from('peer_reviews')
          .select('*', { count: 'exact', head: true })
          .eq('is_flagged', true)
          .in('peer_review_assignment_id', peerReviewAssignments.map(a => a.id))
        
        flaggedCount = count || 0
      }

      setOverallStats({
        totalAssignments,
        activeAssignments,
        totalReviews,
        averageQuality: Math.round(averageQuality * 10) / 10,
        participationRate: Math.round(participationRate),
        flaggedReviews: flaggedCount
      })
    } catch (error) {
      console.error('Error fetching overall stats:', error)
      // Set default stats on error
      setOverallStats({
        totalAssignments: 0,
        activeAssignments: 0,
        totalReviews: 0,
        averageQuality: 0,
        participationRate: 0,
        flaggedReviews: 0
      })
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "default"
      case "completed":
        return "secondary"
      case "draft":
        return "outline"
      case "overdue":
        return "destructive"
      default:
        return "outline"
    }
  }

  const getCompletionPercentage = (completed: number, total: number) => {
    return total > 0 ? Math.round((completed / total) * 100) : 0
  }

  const filteredAssignments =
    selectedClass === "all" ? peerReviewAssignments : peerReviewAssignments.filter((a) => a.class_id === selectedClass)

  const formatTimeAgo = (dateString: string) => {
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Peer Review Management</h1>
            <p className="text-gray-600 dark:text-gray-400">Create and manage student peer review assignments</p>
          </div>
          <div className="flex items-center space-x-4">
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button asChild>
              <Link href="/dashboard/teacher/assignments">
                <Plus className="h-4 w-4 mr-2" />
                Create Peer Review
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Assignments</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.totalAssignments}</div>
              <p className="text-xs text-muted-foreground">{overallStats.activeAssignments} active</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reviews</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.totalReviews}</div>
              <p className="text-xs text-muted-foreground">Across all assignments</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Quality</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.averageQuality}/5</div>
              <p className="text-xs text-muted-foreground">Review quality rating</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Participation Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.participationRate}%</div>
              <p className="text-xs text-muted-foreground">Student participation</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Flagged Reviews</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.flaggedReviews}</div>
              <p className="text-xs text-muted-foreground">Need attention</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="active">
              Active ({filteredAssignments.filter((a) => a.status === "active").length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({filteredAssignments.filter((a) => a.status === "completed").length})
            </TabsTrigger>
            <TabsTrigger value="draft">
              Drafts ({filteredAssignments.filter((a) => a.status === "draft").length})
            </TabsTrigger>

          </TabsList>

          <TabsContent value="active" className="space-y-6">
            <div className="space-y-4">
              {filteredAssignments
                .filter((a) => a.status === "active")
                .map((assignment) => (
                  <Card key={assignment.id}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-lg font-semibold">{assignment.title}</h3>
                            <Badge variant={getStatusColor(assignment.status)}>{assignment.status}</Badge>
                            <Badge variant="outline">{assignment.review_type}</Badge>
                          </div>

                          <p className="text-gray-600 mb-2">
                            Assignment: <span className="font-medium">{assignment.assignment_title}</span>
                          </p>

                          <div className="flex items-center space-x-6 text-sm text-gray-500 mb-3">
                            <span>{assignment.class_name}</span>
                            <span>{assignment.total_students} students</span>
                            <span>Due: {assignment.end_date ? new Date(assignment.end_date).toLocaleDateString() : 'No due date'}</span>
                          </div>

                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Review Progress</span>
                              <span className="text-sm font-medium">
                                {assignment.reviews_completed}/{assignment.total_reviews} completed
                              </span>
                            </div>
                            <Progress
                              value={getCompletionPercentage(assignment.reviews_completed, assignment.total_reviews)}
                              className="h-2"
                            />
                          </div>

                          <div className="flex items-center space-x-4 mt-3 text-sm">
                            <div className="flex items-center space-x-1">
                              <Star className="h-4 w-4 text-yellow-500" />
                              <span>Avg: {assignment.average_rating}/5</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Clock className="h-4 w-4 text-blue-500" />
                              <span>{assignment.average_time_spent}m avg</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 ml-4">

                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/teacher/peer-reviews/${assignment.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              Manage
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/teacher/peer-reviews/${assignment.id}/settings`}>
                              <Settings className="h-4 w-4 mr-2" />
                              Settings
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

              {filteredAssignments.filter((a) => a.status === "active").length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <MessageSquare className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No active peer reviews</h3>
                    <p className="text-gray-600 mb-4">Create a peer review assignment to get started</p>
                    <Button asChild>
                      <Link href="/dashboard/teacher/assignments">
                        <Plus className="h-4 w-4 mr-2" />
                        Create Peer Review
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="completed" className="space-y-6">
            <div className="space-y-4">
              {filteredAssignments
                .filter((a) => a.status === "completed")
                .map((assignment) => (
                  <Card key={assignment.id}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-lg font-semibold">{assignment.title}</h3>
                            <Badge variant={getStatusColor(assignment.status)}>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Completed
                            </Badge>
                          </div>

                          <p className="text-gray-600 mb-2">
                            Assignment: <span className="font-medium">{assignment.assignment_title}</span>
                          </p>

                          <div className="flex items-center space-x-6 text-sm text-gray-500 mb-3">
                            <span>{assignment.class_name}</span>
                            <span>{assignment.total_students} students</span>
                            <span>Completed: {assignment.end_date ? new Date(assignment.end_date).toLocaleDateString() : 'No end date'}</span>
                          </div>

                          <div className="flex items-center space-x-4 text-sm">
                            <div className="flex items-center space-x-1">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span>{assignment.reviews_completed} reviews completed</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Star className="h-4 w-4 text-yellow-500" />
                              <span>Avg: {assignment.average_rating}/5</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Clock className="h-4 w-4 text-blue-500" />
                              <span>{assignment.average_time_spent}m avg</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 ml-4">

                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/teacher/peer-reviews/${assignment.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              Review
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </TabsContent>

          <TabsContent value="draft" className="space-y-6">
            <div className="space-y-4">
              {filteredAssignments
                .filter((a) => a.status === "draft")
                .map((assignment) => (
                  <Card key={assignment.id}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-lg font-semibold">{assignment.title}</h3>
                            <Badge variant={getStatusColor(assignment.status)}>Draft</Badge>
                          </div>

                          <p className="text-gray-600 mb-2">
                            Assignment: <span className="font-medium">{assignment.assignment_title}</span>
                          </p>

                          <div className="flex items-center space-x-6 text-sm text-gray-500">
                            <span>{assignment.class_name}</span>
                            <span>{assignment.total_students} students</span>
                            <span>Scheduled: {assignment.start_date ? new Date(assignment.start_date).toLocaleDateString() : 'No start date'}</span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 ml-4">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/teacher/peer-reviews/${assignment.id}/edit`}>
                              <Settings className="h-4 w-4 mr-2" />
                              Edit
                            </Link>
                          </Button>
                          <Button size="sm">Publish</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </TabsContent>


        </Tabs>
      </div>
    </div>
  )
}
