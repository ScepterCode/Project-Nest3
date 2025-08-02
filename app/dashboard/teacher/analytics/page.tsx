"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { MetricCard } from "@/components/analytics/metric-card"
import { ChartContainer } from "@/components/analytics/chart-container"
import { EmptyState } from "@/components/analytics/empty-state"
import { LoadingState, MetricCardSkeleton } from "@/components/analytics/loading-state"
import { ErrorState } from "@/components/analytics/error-state"
import { exportAnalyticsData } from "@/lib/utils/export"
import { 
  Users, 
  BookOpen, 
  FileText, 
  Award,
  AlertTriangle,
  TrendingUp,
  Download,
  RefreshCw,
  Eye,
  MessageSquare,
  Star
} from "lucide-react"

interface AnalyticsData {
  totalClasses: number
  totalStudents: number
  totalAssignments: number
  averageGrade: number
  submissionRate: number
}

interface StudentPerformance {
  id: string
  name: string
  email: string
  classes: {
    id: string
    name: string
    average: number
    assignments_completed: number
    total_assignments: number
    last_submission: string
  }[]
  overall_average: number
  total_assignments: number
  completed_assignments: number
  at_risk: boolean
}

interface ClassAnalytics {
  id: string
  name: string
  student_count: number
  assignment_count: number
  average_grade: number
  submission_rate: number
}

export default function TeacherAnalyticsPage() {
  const { user } = useAuth()
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalClasses: 0,
    totalStudents: 0,
    totalAssignments: 0,
    averageGrade: 0,
    submissionRate: 0
  })
  const [studentPerformances, setStudentPerformances] = useState<StudentPerformance[]>([])
  const [classAnalytics, setClassAnalytics] = useState<ClassAnalytics[]>([])
  const [selectedClass, setSelectedClass] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      fetchAnalytics()
    }
  }, [user, selectedClass])

  const fetchAnalytics = async () => {
    if (!user) return

    setLoading(true)
    setError(null)
    try {
      // Run all fetch operations - they handle their own errors now
      await Promise.all([
        fetchOverallAnalytics(),
        fetchStudentPerformances(),
        fetchClassAnalytics()
      ])
    } catch (error) {
      console.error('Error fetching analytics:', error)
      // Don't set error state since individual functions handle their own errors
      // setError('Failed to load analytics data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fetchOverallAnalytics = async () => {
    try {
      const supabase = createClient()
      
      // Get teacher's classes
      const { data: classes, error: classError } = await supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', user?.id)

      if (classError) {
        console.error('Error fetching classes:', classError)
        // If classes table doesn't exist or has permission issues, set empty data
        setAnalytics({
          totalClasses: 0,
          totalStudents: 0,
          totalAssignments: 0,
          averageGrade: 0,
          submissionRate: 0
        })
        return
      }

      const classIds = classes?.map(c => c.id) || []
      
      // If no classes, set empty analytics
      if (classIds.length === 0) {
        setAnalytics({
          totalClasses: 0,
          totalStudents: 0,
          totalAssignments: 0,
          averageGrade: 0,
          submissionRate: 0
        })
        return
      }
      
      // Get total students across all classes
      const { data: enrollments, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('student_id')
        .in('class_id', classIds)
        .eq('status', 'active')

      if (enrollmentError) {
        console.error('Error fetching enrollments:', enrollmentError)
        // Continue with empty enrollments if table doesn't exist
      }

      const uniqueStudents = new Set(enrollments?.map(e => e.student_id) || [])

      // Get assignments
      const { data: assignments, error: assignmentError } = await supabase
        .from('assignments')
        .select('id, title, points')
        .eq('teacher_id', user?.id)

      if (assignmentError) {
        console.error('Error fetching assignments:', assignmentError)
        // Continue with empty assignments if table doesn't exist
      }

      // Get submissions with grades
      const assignmentIds = assignments?.map(a => a.id) || []
      let submissions = []
      
      if (assignmentIds.length > 0) {
        const { data: submissionsData, error: submissionError } = await supabase
          .from('submissions')
          .select('id, points_earned, assignment_id')
          .in('assignment_id', assignmentIds)
          .not('points_earned', 'is', null)

        if (submissionError) {
          console.error('Error fetching submissions:', submissionError)
          // Continue with empty submissions if table doesn't exist
        } else {
          submissions = submissionsData || []
        }
      }

      // Calculate analytics
      const totalSubmissions = submissions.length
      const totalPossibleSubmissions = (assignments?.length || 0) * uniqueStudents.size
      const submissionRate = totalPossibleSubmissions > 0 ? (totalSubmissions / totalPossibleSubmissions) * 100 : 0
      
      const averageGrade = submissions.length > 0
        ? submissions.reduce((sum, s) => sum + (s.points_earned || 0), 0) / submissions.length 
        : 0

      setAnalytics({
        totalClasses: classes?.length || 0,
        totalStudents: uniqueStudents.size,
        totalAssignments: assignments?.length || 0,
        averageGrade: Math.round(averageGrade * 100) / 100,
        submissionRate: Math.round(submissionRate * 100) / 100
      })
    } catch (error) {
      console.error('Error fetching overall analytics:', error)
      // Set empty analytics on any unexpected error
      setAnalytics({
        totalClasses: 0,
        totalStudents: 0,
        totalAssignments: 0,
        averageGrade: 0,
        submissionRate: 0
      })
    }
  }

  const fetchStudentPerformances = async () => {
    try {
      const supabase = createClient()
      
      // Get teacher's class IDs
      const { data: classes, error: classError } = await supabase
        .from('classes')
        .select('id')
        .eq('teacher_id', user?.id)

      if (classError) {
        console.error('Error fetching classes for student performance:', classError)
        setStudentPerformances([])
        return
      }

      const classIds = classes?.map(c => c.id) || []
      
      if (classIds.length === 0) {
        setStudentPerformances([])
        return
      }

      // Get all students in teacher's classes
      const { data: studentsData, error } = await supabase
        .from('enrollments')
        .select(`
          student_id,
          class_id,
          users!inner(id, first_name, last_name, email),
          classes!inner(id, name)
        `)
        .in('class_id', classIds)
        .eq('status', 'active')

      if (error) {
        console.error('Error fetching student enrollments:', error)
        setStudentPerformances([])
        return
      }

      // Group by student and calculate performance
      const studentMap = new Map<string, StudentPerformance>()

      for (const enrollment of studentsData || []) {
        const studentId = enrollment.student_id
        const student = enrollment.users as any
        const classInfo = enrollment.classes as any

        if (!studentMap.has(studentId)) {
          studentMap.set(studentId, {
            id: studentId,
            name: `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown Student',
            email: student.email || '',
            classes: [],
            overall_average: 0,
            total_assignments: 0,
            completed_assignments: 0,
            at_risk: false
          })
        }

        // Get assignments and submissions for this class
        const classPerformance = await getStudentClassPerformance(studentId, classInfo.id)
        
        const studentPerf = studentMap.get(studentId)!
        studentPerf.classes.push({
          id: classInfo.id,
          name: classInfo.name,
          ...classPerformance
        })
      }

      // Calculate overall averages and identify at-risk students
      const performances = Array.from(studentMap.values()).map(student => {
        const totalPoints = student.classes.reduce((sum, cls) => sum + (cls.average * cls.assignments_completed), 0)
        const totalAssignments = student.classes.reduce((sum, cls) => sum + cls.assignments_completed, 0)
        
        student.overall_average = totalAssignments > 0 ? totalPoints / totalAssignments : 0
        student.total_assignments = student.classes.reduce((sum, cls) => sum + cls.total_assignments, 0)
        student.completed_assignments = totalAssignments
        student.at_risk = student.overall_average < 70 || (student.total_assignments > 0 && (student.completed_assignments / student.total_assignments) < 0.7)

        return student
      })

      setStudentPerformances(performances)
    } catch (error) {
      console.error('Error fetching student performances:', error)
      setStudentPerformances([])
    }
  }

  const getStudentClassPerformance = async (studentId: string, classId: string) => {
    const supabase = createClient()
    
    try {
      // Get assignments for this class
      const { data: assignments } = await supabase
        .from('assignments')
        .select('id, points')
        .eq('class_id', classId)
        .eq('teacher_id', user?.id)

      // Get student's submissions for these assignments
      const { data: submissions } = await supabase
        .from('submissions')
        .select('assignment_id, points_earned, created_at')
        .eq('student_id', studentId)
        .in('assignment_id', assignments?.map(a => a.id) || [])

      const totalAssignments = assignments?.length || 0
      const completedAssignments = submissions?.length || 0
      
      const averageScore = submissions && submissions.length > 0
        ? submissions.reduce((sum, s) => sum + (s.points_earned || 0), 0) / submissions.length
        : 0

      const lastSubmission = submissions && submissions.length > 0
        ? new Date(Math.max(...submissions.map(s => new Date(s.created_at).getTime()))).toLocaleDateString()
        : 'No submissions'

      return {
        average: Math.round(averageScore * 100) / 100,
        assignments_completed: completedAssignments,
        total_assignments: totalAssignments,
        last_submission: lastSubmission
      }
    } catch (error) {
      console.error('Error fetching student class performance:', error)
      return {
        average: 0,
        assignments_completed: 0,
        total_assignments: 0,
        last_submission: 'No submissions'
      }
    }
  }

  const fetchClassAnalytics = async () => {
    try {
      const supabase = createClient()
      
      const { data: classes, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', user?.id)

      if (error) {
        console.error('Error fetching classes for analytics:', error)
        setClassAnalytics([])
        return
      }

      const classAnalyticsData: ClassAnalytics[] = []

      for (const cls of classes || []) {
        // Get student count
        const { data: enrollments } = await supabase
          .from('enrollments')
          .select('student_id')
          .eq('class_id', cls.id)
          .eq('status', 'active')

        const studentCount = enrollments?.length || 0

        // Get assignments
        const { data: assignments } = await supabase
          .from('assignments')
          .select('id, points')
          .eq('class_id', cls.id)
          .eq('teacher_id', user?.id)

        // Get submissions for this class
        const { data: submissions } = await supabase
          .from('submissions')
          .select('points_earned, assignment_id')
          .in('assignment_id', assignments?.map(a => a.id) || [])

        const submissionRate = assignments && assignments.length > 0 && studentCount > 0
          ? ((submissions?.length || 0) / (assignments.length * studentCount)) * 100
          : 0

        const averageGrade = submissions && submissions.length > 0
          ? submissions.reduce((sum, s) => sum + (s.points_earned || 0), 0) / submissions.length
          : 0

        classAnalyticsData.push({
          id: cls.id,
          name: cls.name,
          student_count: studentCount,
          assignment_count: assignments?.length || 0,
          average_grade: Math.round(averageGrade * 100) / 100,
          submission_rate: Math.round(submissionRate * 100) / 100
        })
      }

      setClassAnalytics(classAnalyticsData)
    } catch (error) {
      console.error('Error fetching class analytics:', error)
      setClassAnalytics([])
    }
  }

  const handleRefresh = () => {
    if (user) {
      fetchAnalytics()
    }
  }

  const handleExport = () => {
    exportAnalyticsData(analytics, filteredStudents, classAnalytics)
  }

  const filteredStudents = selectedClass === "all" 
    ? studentPerformances 
    : studentPerformances.filter(student => 
        student.classes.some(cls => cls.id === selectedClass)
      )

  const atRiskStudents = filteredStudents.filter(student => student.at_risk)
  const topPerformers = filteredStudents
    .filter(student => student.overall_average >= 90)
    .sort((a, b) => b.overall_average - a.overall_average)
    .slice(0, 5)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Track student performance and class insights
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <MetricCardSkeleton key={i} />
            ))}
          </div>
          
          <LoadingState 
            title="Loading Analytics"
            description="Fetching your analytics data from the database..."
          />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <ErrorState
            title="Analytics Error"
            description={error}
            onRetry={handleRefresh}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Track student performance and class insights
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classAnalytics.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <MetricCard
            title="Total Classes"
            value={analytics.totalClasses}
            description="Active classes"
            icon={BookOpen}
          />
          <MetricCard
            title="Total Students"
            value={analytics.totalStudents}
            description={selectedClass === "all" ? "All classes" : "Selected class"}
            icon={Users}
          />
          <MetricCard
            title="Assignments"
            value={analytics.totalAssignments}
            description="Created total"
            icon={FileText}
          />
          <MetricCard
            title="Average Grade"
            value={`${analytics.averageGrade}%`}
            description="Overall performance"
            icon={Award}
          />
          <MetricCard
            title="At-Risk Students"
            value={atRiskStudents.length}
            description="Need attention"
            icon={AlertTriangle}
          />
        </div>

        <Tabs defaultValue="students" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="students">Student Performance</TabsTrigger>
            <TabsTrigger value="classes">Class Analytics</TabsTrigger>
            <TabsTrigger value="insights">Student Insights</TabsTrigger>
            <TabsTrigger value="grades">
              <Link href="/dashboard/teacher/analytics/grades">
                Grade Analytics
              </Link>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="students" className="space-y-6">
            {filteredStudents.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No Students Found"
                description="Students will appear here once they enroll in your classes."
                actionText="View Classes"
                actionHref="/dashboard/teacher/classes"
              />
            ) : (
              <div className="space-y-4">
                {filteredStudents.map((student) => (
                  <div key={student.id} className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>
                            {student.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold">{student.name}</h3>
                          <p className="text-sm text-gray-500">{student.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="text-2xl font-bold">
                            {Math.round(student.overall_average)}%
                          </div>
                          <div className="text-sm text-gray-500">Overall Average</div>
                        </div>
                        {student.at_risk && (
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            At Risk
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span>Assignments Completed</span>
                        <span>{student.completed_assignments}/{student.total_assignments}</span>
                      </div>
                      <Progress 
                        value={student.total_assignments > 0 ? (student.completed_assignments / student.total_assignments) * 100 : 0}
                        className="h-2"
                      />
                    </div>

                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Performance by Class</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {student.classes.map((cls) => (
                          <div key={cls.id} className="p-3 border rounded-lg">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">{cls.name}</span>
                              <Badge variant="outline">{Math.round(cls.average)}%</Badge>
                            </div>
                            <div className="text-xs text-gray-500">
                              {cls.assignments_completed}/{cls.total_assignments} assignments
                            </div>
                            <div className="text-xs text-gray-500">
                              Last: {cls.last_submission}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end mt-4 space-x-2">
                      <Button variant="outline" size="sm">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Send Message
                      </Button>
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="classes" className="space-y-6">
            {classAnalytics.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No Classes Found"
                description="Create your first class to start seeing analytics."
                actionText="Create Class"
                actionHref="/dashboard/teacher/classes"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {classAnalytics.map((cls) => (
                  <div key={cls.id} className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold">{cls.name}</h3>
                      <p className="text-sm text-gray-500">Class performance overview</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold">{cls.student_count}</div>
                        <div className="text-sm text-gray-500">Students</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">{cls.assignment_count}</div>
                        <div className="text-sm text-gray-500">Assignments</div>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm">Class Average</span>
                          <span className="text-sm font-medium">{cls.average_grade}%</span>
                        </div>
                        <Progress value={cls.average_grade} className="h-2" />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm">Submission Rate</span>
                          <span className="text-sm font-medium">{cls.submission_rate}%</span>
                        </div>
                        <Progress value={cls.submission_rate} className="h-2" />
                      </div>
                    </div>

                    <Button variant="outline" size="sm" className="w-full mt-4">
                      <Eye className="h-4 w-4 mr-2" />
                      View Class Details
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="insights" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* At-Risk Students */}
              <ChartContainer
                title="Students Needing Support"
                description="Students performing below 70% or with low completion rates"
              >
                {atRiskStudents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p>No at-risk students identified</p>
                    <p className="text-sm">Great job! All students are performing well.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {atRiskStudents.slice(0, 5).map((student) => (
                      <div key={student.id} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{student.name}</span>
                          <Badge variant="destructive">{Math.round(student.overall_average)}%</Badge>
                        </div>
                        <div className="text-sm text-gray-500 space-y-1">
                          <div>Completed: {student.completed_assignments}/{student.total_assignments} assignments</div>
                          <div>Classes: {student.classes.length}</div>
                        </div>
                        <Button size="sm" className="mt-2">
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Send Check-in
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ChartContainer>

              {/* Top Performers */}
              <ChartContainer
                title="Top Performers"
                description="Students excelling with 90%+ averages"
              >
                {topPerformers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Award className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p>No top performers yet</p>
                    <p className="text-sm">Students with 90%+ averages will appear here.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {topPerformers.map((student, index) => (
                      <div key={student.id} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg font-bold text-yellow-600">#{index + 1}</span>
                            <span className="font-medium">{student.name}</span>
                          </div>
                          <Badge variant="default">{Math.round(student.overall_average)}%</Badge>
                        </div>
                        <div className="text-sm text-gray-500 space-y-1">
                          <div>Completed: {student.completed_assignments}/{student.total_assignments} assignments</div>
                          <div>Classes: {student.classes.length}</div>
                        </div>
                        <Button size="sm" variant="outline" className="mt-2">
                          <Star className="h-4 w-4 mr-2" />
                          Send Praise
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ChartContainer>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}