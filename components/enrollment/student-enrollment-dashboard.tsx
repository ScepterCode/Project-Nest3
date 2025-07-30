"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  StudentEnrollmentDashboard,
  EnrollmentStatus,
  EnrollmentRequestStatus
} from "@/lib/types/enrollment"
import {
  BookOpen,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Calendar,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  UserMinus
} from "lucide-react"
import { format, isAfter, isBefore, addDays } from "date-fns"

interface StudentEnrollmentDashboardProps {
  studentId: string;
}

export default function StudentEnrollmentDashboard({ studentId }: StudentEnrollmentDashboardProps) {
  const [dashboardData, setDashboardData] = useState<StudentEnrollmentDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("overview")
  const { user } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    fetchDashboardData()
  }, [studentId])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Call the API endpoint that uses StudentEnrollmentService
      const response = await fetch(`/api/students/${studentId}/enrollment-dashboard`)
      if (!response.ok) {
        throw new Error('Failed to fetch enrollment data')
      }

      const data = await response.json()
      setDashboardData(data)
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load enrollment data')
    } finally {
      setLoading(false)
    }
  }

  const handleDropClass = async (classId: string, className: string) => {
    if (!confirm(`Are you sure you want to drop "${className}"? This action cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/students/${studentId}/enrollments/${classId}/drop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Student initiated drop' })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to drop class')
      }

      // Refresh dashboard data
      await fetchDashboardData()
      alert(`Successfully dropped from "${className}"`)
    } catch (err) {
      console.error('Error dropping class:', err)
      alert(err instanceof Error ? err.message : 'Failed to drop class')
    }
  }

  const handleWithdrawFromClass = async (classId: string, className: string) => {
    if (!confirm(`Are you sure you want to withdraw from "${className}"? This will appear on your transcript.`)) {
      return
    }

    try {
      const response = await fetch(`/api/students/${studentId}/enrollments/${classId}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Student initiated withdrawal' })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to withdraw from class')
      }

      // Refresh dashboard data
      await fetchDashboardData()
      alert(`Successfully withdrew from "${className}"`)
    } catch (err) {
      console.error('Error withdrawing from class:', err)
      alert(err instanceof Error ? err.message : 'Failed to withdraw from class')
    }
  }

  const getStatusBadgeVariant = (status: EnrollmentStatus | EnrollmentRequestStatus) => {
    switch (status) {
      case EnrollmentStatus.ENROLLED:
      case EnrollmentRequestStatus.APPROVED:
        return "default"
      case EnrollmentStatus.PENDING:
      case EnrollmentRequestStatus.PENDING:
        return "secondary"
      case EnrollmentStatus.WAITLISTED:
        return "outline"
      case EnrollmentStatus.DROPPED:
      case EnrollmentStatus.WITHDRAWN:
      case EnrollmentRequestStatus.DENIED:
        return "destructive"
      case EnrollmentStatus.COMPLETED:
        return "default"
      default:
        return "secondary"
    }
  }

  const getStatusIcon = (status: EnrollmentStatus | EnrollmentRequestStatus) => {
    switch (status) {
      case EnrollmentStatus.ENROLLED:
      case EnrollmentRequestStatus.APPROVED:
        return <CheckCircle className="h-4 w-4" />
      case EnrollmentStatus.PENDING:
      case EnrollmentRequestStatus.PENDING:
        return <Clock className="h-4 w-4" />
      case EnrollmentStatus.WAITLISTED:
        return <Users className="h-4 w-4" />
      case EnrollmentStatus.DROPPED:
      case EnrollmentStatus.WITHDRAWN:
      case EnrollmentRequestStatus.DENIED:
        return <XCircle className="h-4 w-4" />
      case EnrollmentStatus.COMPLETED:
        return <CheckCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const canDropClass = (enrollment: any): boolean => {
    if (!enrollment.class.dropDeadline) return true
    return isBefore(new Date(), new Date(enrollment.class.dropDeadline))
  }

  const canWithdrawFromClass = (enrollment: any): boolean => {
    if (!enrollment.class.withdrawDeadline) return true
    return isBefore(new Date(), new Date(enrollment.class.withdrawDeadline))
  }

  const getDeadlineWarning = (deadline: Date): string => {
    const daysUntil = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysUntil <= 0) return "Deadline passed"
    if (daysUntil <= 3) return `${daysUntil} day${daysUntil === 1 ? '' : 's'} left`
    if (daysUntil <= 7) return `${daysUntil} days left`
    return format(deadline, 'MMM d, yyyy')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading enrollment data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!dashboardData) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>No enrollment data available</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Enrollments</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData.currentEnrollments.length}</div>
            <p className="text-xs text-muted-foreground">
              {dashboardData.statistics.totalCredits} total credits
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData.pendingRequests.length}</div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Waitlisted</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData.waitlistEntries.length}</div>
            <p className="text-xs text-muted-foreground">In queue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">GPA</CardTitle>
            {dashboardData.statistics.enrollmentTrend === 'increasing' ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : dashboardData.statistics.enrollmentTrend === 'decreasing' ? (
              <TrendingDown className="h-4 w-4 text-red-600" />
            ) : (
              <Minus className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData.statistics.currentGPA?.toFixed(2) || 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboardData.statistics.completedCredits} completed credits
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="current">Current Classes</TabsTrigger>
          <TabsTrigger value="pending">Pending & Waitlist</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Upcoming Deadlines */}
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Deadlines</CardTitle>
              <CardDescription>Important dates for your enrolled classes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {dashboardData.currentEnrollments
                  .flatMap(enrollment => 
                    enrollment.upcomingDeadlines.map(deadline => ({
                      ...deadline,
                      className: enrollment.class.name,
                      classId: enrollment.class.id
                    }))
                  )
                  .sort((a, b) => a.date.getTime() - b.date.getTime())
                  .slice(0, 5)
                  .map((deadline, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{deadline.description}</p>
                          <p className="text-sm text-muted-foreground">{deadline.className}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{getDeadlineWarning(deadline.date)}</p>
                        <Badge variant={
                          isAfter(new Date(), deadline.date) ? "destructive" :
                          isBefore(deadline.date, addDays(new Date(), 3)) ? "secondary" : "outline"
                        }>
                          {deadline.type}
                        </Badge>
                      </div>
                    </div>
                  ))}
                {dashboardData.currentEnrollments.every(e => e.upcomingDeadlines.length === 0) && (
                  <p className="text-center text-muted-foreground py-4">No upcoming deadlines</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Available Classes */}
          <Card>
            <CardHeader>
              <CardTitle>Available Classes</CardTitle>
              <CardDescription>Classes you can enroll in</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dashboardData.availableClasses.slice(0, 4).map((cls) => (
                  <div key={cls.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-medium">{cls.name}</h4>
                        <p className="text-sm text-muted-foreground">{cls.teacherName}</p>
                      </div>
                      <Badge variant="outline">{cls.credits} credits</Badge>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">
                        {cls.availableSpots} spots available
                      </span>
                      <Button size="sm" variant="outline">
                        <Eye className="h-3 w-3 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="current" className="space-y-4">
          <div className="space-y-4">
            {dashboardData.currentEnrollments.map((enrollment) => (
              <Card key={enrollment.enrollment.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center space-x-2">
                        <span>{enrollment.class.name}</span>
                        <Badge variant={getStatusBadgeVariant(enrollment.enrollment.status)}>
                          {getStatusIcon(enrollment.enrollment.status)}
                          <span className="ml-1">{enrollment.enrollment.status}</span>
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        {enrollment.class.teacherName} • {enrollment.class.credits} credits
                      </CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      {canDropClass(enrollment) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDropClass(enrollment.class.id, enrollment.class.name)}
                        >
                          <UserMinus className="h-3 w-3 mr-1" />
                          Drop
                        </Button>
                      )}
                      {canWithdrawFromClass(enrollment) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleWithdrawFromClass(enrollment.class.id, enrollment.class.name)}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Withdraw
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span>Enrolled: {format(new Date(enrollment.enrollment.enrolledAt), 'MMM d, yyyy')}</span>
                      {enrollment.enrollment.grade && (
                        <span>Grade: <strong>{enrollment.enrollment.grade}</strong></span>
                      )}
                    </div>
                    
                    {enrollment.upcomingDeadlines.length > 0 && (
                      <div>
                        <h5 className="font-medium text-sm mb-2">Upcoming Deadlines:</h5>
                        <div className="space-y-1">
                          {enrollment.upcomingDeadlines.map((deadline, index) => (
                            <div key={index} className="flex justify-between text-xs">
                              <span>{deadline.description}</span>
                              <span className={
                                isBefore(deadline.date, addDays(new Date(), 3)) 
                                  ? "text-red-600 font-medium" 
                                  : "text-muted-foreground"
                              }>
                                {getDeadlineWarning(deadline.date)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {dashboardData.currentEnrollments.length === 0 && (
              <Card>
                <CardContent className="text-center py-8">
                  <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No current enrollments</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          {/* Pending Requests */}
          {dashboardData.pendingRequests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Pending Enrollment Requests</CardTitle>
                <CardDescription>Waiting for instructor approval</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dashboardData.pendingRequests.map((request) => (
                    <div key={request.request.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <h4 className="font-medium">{request.class.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {request.class.teacherName} • Requested {format(new Date(request.request.requestedAt), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant={getStatusBadgeVariant(request.request.status)}>
                          {getStatusIcon(request.request.status)}
                          <span className="ml-1">{request.request.status}</span>
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {request.estimatedResponseTime}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Waitlist Entries */}
          {dashboardData.waitlistEntries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Waitlist Entries</CardTitle>
                <CardDescription>Your position in class waitlists</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dashboardData.waitlistEntries.map((entry) => (
                    <div key={entry.entry.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <h4 className="font-medium">{entry.class.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {entry.class.teacherName} • Position #{entry.entry.position}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {Math.round(entry.entry.estimatedProbability * 100)}% chance
                        </div>
                        {entry.estimatedEnrollmentDate && (
                          <p className="text-xs text-muted-foreground">
                            Est. {format(entry.estimatedEnrollmentDate, 'MMM d')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {dashboardData.pendingRequests.length === 0 && dashboardData.waitlistEntries.length === 0 && (
            <Card>
              <CardContent className="text-center py-8">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No pending requests or waitlist entries</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="space-y-4">
            {dashboardData.enrollmentHistory.map((history) => (
              <Card key={history.enrollment.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center space-x-2">
                        <span>{history.class.name}</span>
                        <Badge variant={getStatusBadgeVariant(history.enrollment.status)}>
                          {getStatusIcon(history.enrollment.status)}
                          <span className="ml-1">{history.enrollment.status}</span>
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        {history.class.teacherName} • {history.class.credits} credits
                      </CardDescription>
                    </div>
                    {history.enrollment.grade && (
                      <Badge variant="outline" className="text-lg">
                        {history.enrollment.grade}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Enrolled: {format(new Date(history.enrollment.enrolledAt), 'MMM d, yyyy')}</span>
                      <span>Updated: {format(new Date(history.enrollment.updatedAt), 'MMM d, yyyy')}</span>
                    </div>
                    
                    {history.auditLog.length > 0 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          View enrollment history ({history.auditLog.length} events)
                        </summary>
                        <div className="mt-2 space-y-1 pl-4 border-l-2 border-muted">
                          {history.auditLog.slice(0, 5).map((log) => (
                            <div key={log.id} className="flex justify-between">
                              <span>{log.action}</span>
                              <span className="text-muted-foreground">
                                {format(new Date(log.timestamp), 'MMM d, yyyy')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {dashboardData.enrollmentHistory.length === 0 && (
              <Card>
                <CardContent className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No enrollment history</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}