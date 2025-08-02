"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MetricCard } from "@/components/analytics/metric-card"
import { ChartContainer } from "@/components/analytics/chart-container"
import { EmptyState } from "@/components/analytics/empty-state"
import { LoadingState, MetricCardSkeleton, ChartSkeleton } from "@/components/analytics/loading-state"
import { ErrorState } from "@/components/analytics/error-state"
import { exportGradeData } from "@/lib/utils/export"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts"
import { 
  TrendingUp, 
  Users, 
  Award, 
  AlertTriangle, 
  BookOpen, 
  Download, 
  RefreshCw,
  BarChart3,
  ArrowLeft
} from "lucide-react"

interface GradeDistribution {
  range: string
  count: number
  percentage: number
}

interface AssignmentAnalytics {
  id: string
  title: string
  average_grade: number
  submission_count: number
  total_students: number
  submission_rate: number
  grade_distribution: GradeDistribution[]
}

interface PerformanceTrend {
  date: string
  average: number
  assignment_count: number
}

interface ClassData {
  id: string
  name: string
}

export default function GradeAnalyticsPage() {
  const { user } = useAuth()
  const [selectedClass, setSelectedClass] = useState("all")
  const [selectedAssignment, setSelectedAssignment] = useState("all")
  const [classes, setClasses] = useState<ClassData[]>([])
  const [assignments, setAssignments] = useState<AssignmentAnalytics[]>([])
  const [gradeDistribution, setGradeDistribution] = useState<GradeDistribution[]>([])
  const [performanceTrends, setPerformanceTrends] = useState<PerformanceTrend[]>([])
  const [overallStats, setOverallStats] = useState({
    totalAssignments: 0,
    totalStudents: 0,
    averageGrade: 0,
    atRiskCount: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      fetchGradeAnalytics()
    }
  }, [user, selectedClass, selectedAssignment])

  const fetchGradeAnalytics = async () => {
    if (!user) return

    setLoading(true)
    setError(null)
    try {
      await Promise.all([
        fetchClasses(),
        fetchAssignmentAnalytics(),
        fetchGradeDistribution(),
        fetchPerformanceTrends(),
        fetchOverallStats()
      ])
    } catch (error) {
      console.error('Error fetching grade analytics:', error)
      setError('Failed to load grade analytics. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fetchClasses = async () => {
    try {
      const supabase = createClient()
      const { data: classesData, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', user?.id)

      if (error) throw error
      setClasses(classesData || [])
    } catch (error) {
      console.error('Error fetching classes:', error)
      throw error
    }
  }

  const fetchAssignmentAnalytics = async () => {
    try {
      const supabase = createClient()
      
      // Get assignments based on class filter
      let assignmentQuery = supabase
        .from('assignments')
        .select('id, title, points, class_id')
        .eq('teacher_id', user?.id)

      if (selectedClass !== "all") {
        assignmentQuery = assignmentQuery.eq('class_id', selectedClass)
      }

      const { data: assignmentsData, error: assignmentError } = await assignmentQuery

      if (assignmentError) throw assignmentError

      const assignmentAnalytics: AssignmentAnalytics[] = []

      for (const assignment of assignmentsData || []) {
        // Get submissions for this assignment
        const { data: submissions, error: submissionError } = await supabase
          .from('submissions')
          .select('points_earned, student_id')
          .eq('assignment_id', assignment.id)
          .not('points_earned', 'is', null)

        if (submissionError) throw submissionError

        // Get total students for this assignment's class
        const { data: enrollments, error: enrollmentError } = await supabase
          .from('enrollments')
          .select('student_id')
          .eq('class_id', assignment.class_id)
          .eq('status', 'active')

        if (enrollmentError) throw enrollmentError

        const totalStudents = enrollments?.length || 0
        const submissionCount = submissions?.length || 0
        const averageGrade = submissionCount > 0
          ? submissions.reduce((sum, s) => sum + (s.points_earned || 0), 0) / submissionCount
          : 0

        // Calculate grade distribution for this assignment
        const gradeRanges = [
          { range: "90-100%", min: 90, max: 100 },
          { range: "80-89%", min: 80, max: 89 },
          { range: "70-79%", min: 70, max: 79 },
          { range: "60-69%", min: 60, max: 69 },
          { range: "Below 60%", min: 0, max: 59 }
        ]

        const distribution = gradeRanges.map(range => {
          const count = submissions?.filter(s => {
            const grade = s.points_earned || 0
            return grade >= range.min && grade <= range.max
          }).length || 0

          return {
            range: range.range,
            count,
            percentage: submissionCount > 0 ? Math.round((count / submissionCount) * 100) : 0
          }
        })

        assignmentAnalytics.push({
          id: assignment.id,
          title: assignment.title,
          average_grade: Math.round(averageGrade * 100) / 100,
          submission_count: submissionCount,
          total_students: totalStudents,
          submission_rate: totalStudents > 0 ? Math.round((submissionCount / totalStudents) * 100) : 0,
          grade_distribution: distribution
        })
      }

      setAssignments(assignmentAnalytics)
    } catch (error) {
      console.error('Error fetching assignment analytics:', error)
      throw error
    }
  }

  const fetchGradeDistribution = async () => {
    try {
      const supabase = createClient()
      
      // Get all submissions based on filters
      let submissionQuery = supabase
        .from('submissions')
        .select(`
          points_earned,
          assignments!inner(id, title, teacher_id, class_id)
        `)
        .eq('assignments.teacher_id', user?.id)
        .not('points_earned', 'is', null)

      if (selectedClass !== "all") {
        submissionQuery = submissionQuery.eq('assignments.class_id', selectedClass)
      }

      if (selectedAssignment !== "all") {
        submissionQuery = submissionQuery.eq('assignment_id', selectedAssignment)
      }

      const { data: submissions, error } = await submissionQuery

      if (error) throw error

      // Calculate overall grade distribution
      const gradeRanges = [
        { range: "90-100%", min: 90, max: 100 },
        { range: "80-89%", min: 80, max: 89 },
        { range: "70-79%", min: 70, max: 79 },
        { range: "60-69%", min: 60, max: 69 },
        { range: "Below 60%", min: 0, max: 59 }
      ]

      const totalSubmissions = submissions?.length || 0
      const distribution = gradeRanges.map(range => {
        const count = submissions?.filter(s => {
          const grade = s.points_earned || 0
          return grade >= range.min && grade <= range.max
        }).length || 0

        return {
          range: range.range,
          count,
          percentage: totalSubmissions > 0 ? Math.round((count / totalSubmissions) * 100) : 0
        }
      })

      setGradeDistribution(distribution)
    } catch (error) {
      console.error('Error fetching grade distribution:', error)
      throw error
    }
  }

  const fetchPerformanceTrends = async () => {
    try {
      const supabase = createClient()
      
      // Get submissions with dates for trend analysis
      let submissionQuery = supabase
        .from('submissions')
        .select(`
          points_earned,
          created_at,
          assignments!inner(id, teacher_id, class_id)
        `)
        .eq('assignments.teacher_id', user?.id)
        .not('points_earned', 'is', null)
        .order('created_at', { ascending: true })

      if (selectedClass !== "all") {
        submissionQuery = submissionQuery.eq('assignments.class_id', selectedClass)
      }

      const { data: submissions, error } = await submissionQuery

      if (error) throw error

      // Group submissions by week and calculate averages
      const weeklyData = new Map<string, { total: number, count: number }>()

      submissions?.forEach(submission => {
        const date = new Date(submission.created_at)
        const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay())
        const weekKey = weekStart.toISOString().split('T')[0]

        if (!weeklyData.has(weekKey)) {
          weeklyData.set(weekKey, { total: 0, count: 0 })
        }

        const weekData = weeklyData.get(weekKey)!
        weekData.total += submission.points_earned || 0
        weekData.count += 1
      })

      const trends = Array.from(weeklyData.entries())
        .map(([date, data]) => ({
          date: new Date(date).toLocaleDateString(),
          average: Math.round((data.total / data.count) * 100) / 100,
          assignment_count: data.count
        }))
        .slice(-8) // Last 8 weeks

      setPerformanceTrends(trends)
    } catch (error) {
      console.error('Error fetching performance trends:', error)
      throw error
    }
  }

  const fetchOverallStats = async () => {
    try {
      const supabase = createClient()
      
      // Get assignment count
      let assignmentQuery = supabase
        .from('assignments')
        .select('id')
        .eq('teacher_id', user?.id)

      if (selectedClass !== "all") {
        assignmentQuery = assignmentQuery.eq('class_id', selectedClass)
      }

      const { data: assignmentsData, error: assignmentError } = await assignmentQuery

      if (assignmentError) throw assignmentError

      // Get student count
      let studentQuery = supabase
        .from('enrollments')
        .select('student_id')
        .eq('status', 'active')

      if (selectedClass !== "all") {
        studentQuery = studentQuery.eq('class_id', selectedClass)
      } else {
        // Get all classes for this teacher
        const { data: teacherClasses } = await supabase
          .from('classes')
          .select('id')
          .eq('teacher_id', user?.id)

        const classIds = teacherClasses?.map(c => c.id) || []
        studentQuery = studentQuery.in('class_id', classIds)
      }

      const { data: enrollments, error: enrollmentError } = await studentQuery

      if (enrollmentError) throw enrollmentError

      // Get submissions for average calculation
      let submissionQuery = supabase
        .from('submissions')
        .select(`
          points_earned,
          assignments!inner(teacher_id, class_id)
        `)
        .eq('assignments.teacher_id', user?.id)
        .not('points_earned', 'is', null)

      if (selectedClass !== "all") {
        submissionQuery = submissionQuery.eq('assignments.class_id', selectedClass)
      }

      const { data: submissions, error: submissionError } = await submissionQuery

      if (submissionError) throw submissionError

      const totalSubmissions = submissions?.length || 0
      const averageGrade = totalSubmissions > 0
        ? submissions.reduce((sum, s) => sum + (s.points_earned || 0), 0) / totalSubmissions
        : 0

      const atRiskCount = submissions?.filter(s => (s.points_earned || 0) < 70).length || 0

      setOverallStats({
        totalAssignments: assignmentsData?.length || 0,
        totalStudents: new Set(enrollments?.map(e => e.student_id)).size,
        averageGrade: Math.round(averageGrade * 100) / 100,
        atRiskCount
      })
    } catch (error) {
      console.error('Error fetching overall stats:', error)
      throw error
    }
  }

  const handleRefresh = () => {
    if (user) {
      fetchGradeAnalytics()
    }
  }

  const handleExport = () => {
    exportGradeData(overallStats, gradeDistribution, assignments, performanceTrends)
  }

  const COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#6B7280"]

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Grade Analytics</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Comprehensive insights into student performance and grading patterns
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <MetricCardSkeleton key={i} />
            ))}
          </div>
          
          <LoadingState 
            title="Loading Grade Analytics"
            description="Analyzing grade data and generating insights..."
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
            title="Grade Analytics Error"
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
          <div className="flex items-center space-x-4">
            <Link href="/dashboard/teacher/analytics">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Analytics
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Grade Analytics</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Comprehensive insights into student performance and grading patterns
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select class" />
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
            <Select value={selectedAssignment} onValueChange={setSelectedAssignment}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select assignment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assignments</SelectItem>
                {assignments.map((assignment) => (
                  <SelectItem key={assignment.id} value={assignment.id}>
                    {assignment.title}
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

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <MetricCard
            title="Overall Average"
            value={`${overallStats.averageGrade}%`}
            description="Across all assignments"
            icon={TrendingUp}
          />
          <MetricCard
            title="Total Students"
            value={overallStats.totalStudents}
            description={selectedClass === "all" ? "All classes" : "Selected class"}
            icon={Users}
          />
          <MetricCard
            title="Assignments Graded"
            value={overallStats.totalAssignments}
            description="With submissions"
            icon={BookOpen}
          />
          <MetricCard
            title="At-Risk Submissions"
            value={overallStats.atRiskCount}
            description="Below 70%"
            icon={AlertTriangle}
          />
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="distribution">Grade Distribution</TabsTrigger>
            <TabsTrigger value="trends">Performance Trends</TabsTrigger>
            <TabsTrigger value="assignments">Assignment Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {gradeDistribution.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No Grade Data Available"
                description="Grade analytics will appear here once you have graded assignments with student submissions."
                actionText="View Assignments"
                actionHref="/dashboard/teacher/assignments"
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartContainer
                  title="Grade Distribution"
                  description="Distribution of grades across all assignments"
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={gradeDistribution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="range" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>

                <ChartContainer
                  title="Grade Distribution (Percentage)"
                  description="Percentage breakdown of grade ranges"
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={gradeDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ range, percentage }) => `${range}: ${percentage}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="percentage"
                      >
                        {gradeDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            )}
          </TabsContent>

          <TabsContent value="distribution" className="space-y-6">
            {gradeDistribution.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No Grade Distribution Data"
                description="Grade distribution charts will appear once you have graded student submissions."
                actionText="View Assignments"
                actionHref="/dashboard/teacher/assignments"
              />
            ) : (
              <ChartContainer
                title="Detailed Grade Distribution"
                description="Comprehensive breakdown of student performance"
              >
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={gradeDistribution} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="range" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value, name) => [
                        name === 'count' ? `${value} students` : `${value}%`,
                        name === 'count' ? 'Count' : 'Percentage'
                      ]}
                    />
                    <Bar dataKey="count" fill="#3B82F6" name="count" />
                    <Bar dataKey="percentage" fill="#10B981" name="percentage" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </TabsContent>

          <TabsContent value="trends" className="space-y-6">
            {performanceTrends.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="No Performance Trends Data"
                description="Performance trends will appear once you have multiple graded assignments over time."
                actionText="View Assignments"
                actionHref="/dashboard/teacher/assignments"
              />
            ) : (
              <ChartContainer
                title="Performance Trends Over Time"
                description="Average grade performance trends by week"
              >
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={performanceTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value, name) => [
                        name === 'average' ? `${value}%` : value,
                        name === 'average' ? 'Average Grade' : 'Assignments'
                      ]}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="average" 
                      stroke="#3B82F6" 
                      strokeWidth={2}
                      name="average"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </TabsContent>

          <TabsContent value="assignments" className="space-y-6">
            {assignments.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No Assignment Data"
                description="Assignment analysis will appear once you have created assignments with student submissions."
                actionText="Create Assignment"
                actionHref="/dashboard/teacher/assignments/create"
              />
            ) : (
              <div className="space-y-6">
                {assignments.map((assignment) => (
                  <div key={assignment.id} className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">{assignment.title}</h3>
                        <p className="text-sm text-gray-500">
                          {assignment.submission_count} of {assignment.total_students} students submitted
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">{assignment.average_grade}%</div>
                        <div className="text-sm text-gray-500">Average Grade</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-medium mb-2">Submission Rate</h4>
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full" 
                              style={{ width: `${assignment.submission_rate}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium">{assignment.submission_rate}%</span>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Grade Distribution</h4>
                        <div className="space-y-1">
                          {assignment.grade_distribution.slice(0, 3).map((dist) => (
                            <div key={dist.range} className="flex justify-between text-sm">
                              <span>{dist.range}</span>
                              <span>{dist.count} students ({dist.percentage}%)</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}