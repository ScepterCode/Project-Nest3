"use client"

import { useState } from "react"
import Link from "next/link"
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

export default function TeacherPeerReviewsPage() {
  const [activeTab, setActiveTab] = useState("active")
  const [selectedClass, setSelectedClass] = useState("all")

  // Mock data
  const peerReviewAssignments = [
    {
      id: "peer_assign_1",
      title: "Essay Peer Review",
      assignmentTitle: "Cell Structure Lab Report",
      classId: "class_1",
      className: "Grade 11 Biology",
      status: "active",
      reviewType: "anonymous",
      totalStudents: 25,
      reviewsCompleted: 18,
      totalReviews: 50,
      startDate: "2024-01-16",
      endDate: "2024-01-20",
      averageRating: 4.2,
      averageTimeSpent: 22,
    },
    {
      id: "peer_assign_2",
      title: "Lab Report Review",
      assignmentTitle: "Chemical Reactions Analysis",
      classId: "class_2",
      className: "Grade 10 Chemistry",
      status: "completed",
      reviewType: "named",
      totalStudents: 30,
      reviewsCompleted: 60,
      totalReviews: 60,
      startDate: "2024-01-10",
      endDate: "2024-01-15",
      averageRating: 3.8,
      averageTimeSpent: 18,
    },
    {
      id: "peer_assign_3",
      title: "Presentation Review",
      assignmentTitle: "Newton's Laws Project",
      classId: "class_3",
      className: "Advanced Physics",
      status: "draft",
      reviewType: "blind",
      totalStudents: 18,
      reviewsCompleted: 0,
      totalReviews: 36,
      startDate: "2024-01-25",
      endDate: "2024-01-30",
      averageRating: 0,
      averageTimeSpent: 0,
    },
  ]

  const classes = [
    { id: "class_1", name: "Grade 11 Biology" },
    { id: "class_2", name: "Grade 10 Chemistry" },
    { id: "class_3", name: "Advanced Physics" },
  ]

  const recentActivity = [
    {
      id: "1",
      type: "review_submitted",
      studentName: "John Obi",
      assignmentTitle: "Essay Peer Review",
      timestamp: "2 hours ago",
    },
    {
      id: "2",
      type: "review_flagged",
      studentName: "Sarah Wilson",
      assignmentTitle: "Lab Report Review",
      timestamp: "4 hours ago",
      reason: "Inappropriate language",
    },
    {
      id: "3",
      type: "review_completed",
      studentName: "Mike Johnson",
      assignmentTitle: "Essay Peer Review",
      timestamp: "6 hours ago",
    },
  ]

  const overallStats = {
    totalAssignments: 8,
    activeAssignments: 3,
    totalReviews: 245,
    averageQuality: 4.1,
    participationRate: 87,
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
    selectedClass === "all" ? peerReviewAssignments : peerReviewAssignments.filter((a) => a.classId === selectedClass)

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
              <div className="text-2xl font-bold">2</div>
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
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
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
                            <Badge variant="outline">{assignment.reviewType}</Badge>
                          </div>

                          <p className="text-gray-600 mb-2">
                            Assignment: <span className="font-medium">{assignment.assignmentTitle}</span>
                          </p>

                          <div className="flex items-center space-x-6 text-sm text-gray-500 mb-3">
                            <span>{assignment.className}</span>
                            <span>{assignment.totalStudents} students</span>
                            <span>Due: {assignment.endDate}</span>
                          </div>

                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Review Progress</span>
                              <span className="text-sm font-medium">
                                {assignment.reviewsCompleted}/{assignment.totalReviews} completed
                              </span>
                            </div>
                            <Progress
                              value={getCompletionPercentage(assignment.reviewsCompleted, assignment.totalReviews)}
                              className="h-2"
                            />
                          </div>

                          <div className="flex items-center space-x-4 mt-3 text-sm">
                            <div className="flex items-center space-x-1">
                              <Star className="h-4 w-4 text-yellow-500" />
                              <span>Avg: {assignment.averageRating}/5</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Clock className="h-4 w-4 text-blue-500" />
                              <span>{assignment.averageTimeSpent}m avg</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 ml-4">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/teacher/peer-reviews/${assignment.id}/analytics`}>
                              <BarChart3 className="h-4 w-4 mr-2" />
                              Analytics
                            </Link>
                          </Button>
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
                            Assignment: <span className="font-medium">{assignment.assignmentTitle}</span>
                          </p>

                          <div className="flex items-center space-x-6 text-sm text-gray-500 mb-3">
                            <span>{assignment.className}</span>
                            <span>{assignment.totalStudents} students</span>
                            <span>Completed: {assignment.endDate}</span>
                          </div>

                          <div className="flex items-center space-x-4 text-sm">
                            <div className="flex items-center space-x-1">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span>{assignment.reviewsCompleted} reviews completed</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Star className="h-4 w-4 text-yellow-500" />
                              <span>Avg: {assignment.averageRating}/5</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Clock className="h-4 w-4 text-blue-500" />
                              <span>{assignment.averageTimeSpent}m avg</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 ml-4">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/teacher/peer-reviews/${assignment.id}/analytics`}>
                              <BarChart3 className="h-4 w-4 mr-2" />
                              View Results
                            </Link>
                          </Button>
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
                            Assignment: <span className="font-medium">{assignment.assignmentTitle}</span>
                          </p>

                          <div className="flex items-center space-x-6 text-sm text-gray-500">
                            <span>{assignment.className}</span>
                            <span>{assignment.totalStudents} students</span>
                            <span>Scheduled: {assignment.startDate}</span>
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

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Latest peer review activity across all classes</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {recentActivity.map((activity) => (
                      <div key={activity.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                        <div className="flex-shrink-0">
                          {activity.type === "review_submitted" && <MessageSquare className="h-5 w-5 text-blue-500" />}
                          {activity.type === "review_flagged" && <AlertTriangle className="h-5 w-5 text-red-500" />}
                          {activity.type === "review_completed" && <CheckCircle className="h-5 w-5 text-green-500" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{activity.studentName}</p>
                          <p className="text-xs text-gray-600">
                            {activity.type === "review_submitted" && "Submitted a peer review"}
                            {activity.type === "review_flagged" && `Review flagged: ${activity.reason}`}
                            {activity.type === "review_completed" && "Completed all assigned reviews"}
                            {" • "}
                            {activity.assignmentTitle}
                          </p>
                        </div>
                        <div className="text-xs text-gray-500">{activity.timestamp}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Quality Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle>Quality Metrics</CardTitle>
                  <CardDescription>Review quality and engagement statistics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Average Review Quality</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={82} className="w-20" />
                        <span className="text-sm font-medium">4.1/5</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm">Student Participation</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={87} className="w-20" />
                        <span className="text-sm font-medium">87%</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm">On-time Completion</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={94} className="w-20" />
                        <span className="text-sm font-medium">94%</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm">Average Time Spent</span>
                      <span className="text-sm font-medium">22 minutes</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
