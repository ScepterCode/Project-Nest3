"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useMobileDetection } from "@/lib/hooks/useMobileDetection"
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
  UserMinus,
  ChevronRight,
  MoreVertical,
  Phone,
  Mail,
  MapPin
} from "lucide-react"
import { format, isAfter, isBefore, addDays } from "date-fns"

interface MobileEnrollmentDashboardProps {
  studentId: string;
}

export default function MobileEnrollmentDashboard({ studentId }: MobileEnrollmentDashboardProps) {
  const [dashboardData, setDashboardData] = useState<StudentEnrollmentDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("overview")
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const { user } = useAuth()
  const { isMobile } = useMobileDetection()
  const supabase = createClient()

  useEffect(() => {
    fetchDashboardData()
  }, [studentId])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)

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
    if (!confirm(`Drop "${className}"? This cannot be undone.`)) {
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

      await fetchDashboardData()
      alert(`Dropped from "${className}"`)
    } catch (err) {
      console.error('Error dropping class:', err)
      alert(err instanceof Error ? err.message : 'Failed to drop class')
    }
  }

  const handleWithdrawFromClass = async (classId: string, className: string) => {
    if (!confirm(`Withdraw from "${className}"? This will appear on your transcript.`)) {
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

      await fetchDashboardData()
      alert(`Withdrew from "${className}"`)
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
        return <CheckCircle className="h-3 w-3" />
      case EnrollmentStatus.PENDING:
      case EnrollmentRequestStatus.PENDING:
        return <Clock className="h-3 w-3" />
      case EnrollmentStatus.WAITLISTED:
        return <Users className="h-3 w-3" />
      case EnrollmentStatus.DROPPED:
      case EnrollmentStatus.WITHDRAWN:
      case EnrollmentRequestStatus.DENIED:
        return <XCircle className="h-3 w-3" />
      case EnrollmentStatus.COMPLETED:
        return <CheckCircle className="h-3 w-3" />
      default:
        return <Clock className="h-3 w-3" />
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
    if (daysUntil <= 0) return "Overdue"
    if (daysUntil <= 3) return `${daysUntil}d left`
    if (daysUntil <= 7) return `${daysUntil}d left`
    return format(deadline, 'MMM d')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading...</p>
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
    <div className="space-y-4 pb-20"> {/* Extra padding for mobile navigation */}
      {/* Mobile Overview Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">{dashboardData.currentEnrollments.length}</p>
              <p className="text-xs text-muted-foreground">Classes</p>
            </div>
            <BookOpen className="h-5 w-5 text-muted-foreground" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">{dashboardData.statistics.totalCredits}</p>
              <p className="text-xs text-muted-foreground">Credits</p>
            </div>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">{dashboardData.pendingRequests.length}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">
                {dashboardData.statistics.currentGPA?.toFixed(1) || 'N/A'}
              </p>
              <p className="text-xs text-muted-foreground">GPA</p>
            </div>
            {dashboardData.statistics.enrollmentTrend === 'increasing' ? (
              <TrendingUp className="h-5 w-5 text-green-600" />
            ) : dashboardData.statistics.enrollmentTrend === 'decreasing' ? (
              <TrendingDown className="h-5 w-5 text-red-600" />
            ) : (
              <Minus className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </Card>
      </div>

      {/* Mobile Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 h-12">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="current" className="text-xs">Current</TabsTrigger>
          <TabsTrigger value="pending" className="text-xs">Pending</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Urgent Deadlines */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center">
                <Calendar className="h-4 w-4 mr-2" />
                Upcoming Deadlines
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {dashboardData.currentEnrollments
                  .flatMap(enrollment => 
                    enrollment.upcomingDeadlines.map(deadline => ({
                      ...deadline,
                      className: enrollment.class.name,
                      classId: enrollment.class.id
                    }))
                  )
                  .sort((a, b) => a.date.getTime() - b.date.getTime())
                  .slice(0, 3)
                  .map((deadline, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{deadline.description}</p>
                        <p className="text-xs text-muted-foreground truncate">{deadline.className}</p>
                      </div>
                      <div className="text-right ml-2">
                        <p className="text-xs font-medium">{getDeadlineWarning(deadline.date)}</p>
                        <Badge variant={
                          isAfter(new Date(), deadline.date) ? "destructive" :
                          isBefore(deadline.date, addDays(new Date(), 3)) ? "secondary" : "outline"
                        } className="text-xs">
                          {deadline.type}
                        </Badge>
                      </div>
                    </div>
                  ))}
                {dashboardData.currentEnrollments.every(e => e.upcomingDeadlines.length === 0) && (
                  <p className="text-center text-muted-foreground py-4 text-sm">No upcoming deadlines</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-12 flex-col space-y-1">
                  <BookOpen className="h-4 w-4" />
                  <span className="text-xs">Browse Classes</span>
                </Button>
                <Button variant="outline" className="h-12 flex-col space-y-1">
                  <Users className="h-4 w-4" />
                  <span className="text-xs">Join Waitlist</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="current" className="space-y-3">
          {dashboardData.currentEnrollments.map((enrollment) => (
            <Card key={enrollment.enrollment.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center space-x-2">
                      <span className="truncate">{enrollment.class.name}</span>
                      <Badge variant={getStatusBadgeVariant(enrollment.enrollment.status)} className="text-xs shrink-0">
                        {getStatusIcon(enrollment.enrollment.status)}
                        <span className="ml-1">{enrollment.enrollment.status}</span>
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-sm">
                      {enrollment.class.teacherName} • {enrollment.class.credits} credits
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedCard(
                      expandedCard === enrollment.enrollment.id ? null : enrollment.enrollment.id
                    )}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Enrolled: {format(new Date(enrollment.enrollment.enrolledAt), 'MMM d')}</span>
                  {enrollment.enrollment.grade && (
                    <span className="font-medium">Grade: {enrollment.enrollment.grade}</span>
                  )}
                </div>
                
                {/* Expandable Actions */}
                {expandedCard === enrollment.enrollment.id && (
                  <div className="space-y-3 pt-3 border-t">
                    <div className="grid grid-cols-2 gap-2">
                      {canDropClass(enrollment) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDropClass(enrollment.class.id, enrollment.class.name)}
                          className="text-xs"
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
                          className="text-xs"
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Withdraw
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="text-xs">
                        <Eye className="h-3 w-3 mr-1" />
                        Details
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs">
                        <Mail className="h-3 w-3 mr-1" />
                        Contact
                      </Button>
                    </div>
                    
                    {enrollment.upcomingDeadlines.length > 0 && (
                      <div className="bg-yellow-50 p-3 rounded-lg">
                        <h5 className="font-medium text-sm mb-2">Upcoming Deadlines:</h5>
                        <div className="space-y-1">
                          {enrollment.upcomingDeadlines.slice(0, 2).map((deadline, index) => (
                            <div key={index} className="flex justify-between text-xs">
                              <span className="truncate">{deadline.description}</span>
                              <span className={
                                isBefore(deadline.date, addDays(new Date(), 3)) 
                                  ? "text-red-600 font-medium ml-2" 
                                  : "text-muted-foreground ml-2"
                              }>
                                {getDeadlineWarning(deadline.date)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
        </TabsContent>

        <TabsContent value="pending" className="space-y-3">
          {/* Pending Requests */}
          {dashboardData.pendingRequests.map((request) => (
            <Card key={request.request.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{request.class.name}</CardTitle>
                    <CardDescription className="text-sm">
                      {request.class.teacherName} • Requested {format(new Date(request.request.requestedAt), 'MMM d')}
                    </CardDescription>
                  </div>
                  <Badge variant={getStatusBadgeVariant(request.request.status)} className="text-xs shrink-0">
                    {getStatusIcon(request.request.status)}
                    <span className="ml-1">{request.request.status}</span>
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Expected response: {request.estimatedResponseTime}
                </p>
              </CardContent>
            </Card>
          ))}

          {/* Waitlist Entries */}
          {dashboardData.waitlistEntries.map((entry) => (
            <Card key={entry.entry.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{entry.class.name}</CardTitle>
                    <CardDescription className="text-sm">
                      {entry.class.teacherName} • Position #{entry.entry.position}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {Math.round(entry.entry.estimatedProbability * 100)}%
                    </div>
                    <p className="text-xs text-muted-foreground">chance</p>
                  </div>
                </div>
              </CardHeader>
              {entry.estimatedEnrollmentDate && (
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Estimated enrollment: {format(entry.estimatedEnrollmentDate, 'MMM d')}
                  </p>
                </CardContent>
              )}
            </Card>
          ))}

          {dashboardData.pendingRequests.length === 0 && dashboardData.waitlistEntries.length === 0 && (
            <Card>
              <CardContent className="text-center py-8">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No pending requests</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}