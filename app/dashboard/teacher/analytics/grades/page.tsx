"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
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
import { TrendingUp, Users, Award, AlertTriangle, BookOpen, Download } from "lucide-react"

export default function GradeAnalyticsPage() {
  const [selectedClass, setSelectedClass] = useState("all")
  const [selectedAssignment, setSelectedAssignment] = useState("all")

  // Mock data
  const classes = [
    { id: "class_1", name: "Grade 11 Biology" },
    { id: "class_2", name: "Grade 10 Chemistry" },
    { id: "class_3", name: "Advanced Physics" },
  ]

  const assignments = [
    { id: "assign_1", name: "Cell Structure Lab Report", class: "Grade 11 Biology" },
    { id: "assign_2", name: "Chemical Reactions Quiz", class: "Grade 10 Chemistry" },
    { id: "assign_3", name: "Newton's Laws Project", class: "Advanced Physics" },
  ]

  const gradeDistribution = [
    { grade: "A", count: 12, percentage: 24 },
    { grade: "B", count: 18, percentage: 36 },
    { grade: "C", count: 15, percentage: 30 },
    { grade: "D", count: 4, percentage: 8 },
    { grade: "F", count: 1, percentage: 2 },
  ]

  const classPerformance = [
    { class: "Grade 11 Biology", average: 82, students: 25, assignments: 8 },
    { class: "Grade 10 Chemistry", average: 78, students: 30, assignments: 6 },
    { class: "Advanced Physics", average: 85, students: 18, assignments: 10 },
  ]

  const assignmentTrends = [
    { assignment: "Assignment 1", average: 75, date: "Jan 5" },
    { assignment: "Assignment 2", average: 78, date: "Jan 12" },
    { assignment: "Assignment 3", average: 82, date: "Jan 19" },
    { assignment: "Assignment 4", average: 80, date: "Jan 26" },
    { assignment: "Assignment 5", average: 85, date: "Feb 2" },
  ]

  const rubricPerformance = [
    { criterion: "Content & Ideas", average: 78, maxPoints: 40 },
    { criterion: "Organization", average: 85, maxPoints: 30 },
    { criterion: "Grammar", average: 82, maxPoints: 20 },
    { criterion: "Citations", average: 72, maxPoints: 10 },
  ]

  const strugglingStudents = [
    { name: "John Smith", average: 65, assignments: 3, lastSubmission: "Jan 20" },
    { name: "Sarah Wilson", average: 68, assignments: 4, lastSubmission: "Jan 18" },
    { name: "Mike Johnson", average: 62, assignments: 2, lastSubmission: "Jan 15" },
  ]

  const topPerformers = [
    { name: "Emily Chen", average: 95, assignments: 5, streak: 4 },
    { name: "David Rodriguez", average: 92, assignments: 5, streak: 3 },
    { name: "Lisa Park", average: 90, assignments: 4, streak: 2 },
  ]

  const COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#6B7280"]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Grade Analytics</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Comprehensive insights into student performance and grading patterns
            </p>
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
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overall Average</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">81.5%</div>
              <p className="text-xs text-muted-foreground">
                <span className="text-green-600">+2.3%</span> from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Students</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">73</div>
              <p className="text-xs text-muted-foreground">Across 3 classes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Assignments Graded</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">24</div>
              <p className="text-xs text-muted-foreground">This semester</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">At-Risk Students</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">3</div>
              <p className="text-xs text-muted-foreground">
                <span className="text-red-600">Need attention</span>
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="distribution">Grade Distribution</TabsTrigger>
            <TabsTrigger value="trends">Performance Trends</TabsTrigger>
            <TabsTrigger value="rubrics">Rubric Analysis</TabsTrigger>
            <TabsTrigger value="students">Student Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Class Performance */}
              <Card>
                <CardHeader>
                  <CardTitle>Class Performance Overview</CardTitle>
                  <CardDescription>Average performance by class</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {classPerformance.map((cls, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{cls.class}</span>
                          <Badge variant="outline">{cls.average}%</Badge>
                        </div>
                        <Progress value={cls.average} className="h-2" />
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>{cls.students} students</span>
                          <span>{cls.assignments} assignments</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Assignment Performance */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Assignment Performance</CardTitle>
                  <CardDescription>Performance trends over recent assignments</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={assignmentTrends}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="assignment" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="average" stroke="#3B82F6" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="distribution" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Grade Distribution Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Grade Distribution</CardTitle>
                  <CardDescription>Distribution of letter grades across all assignments</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={gradeDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ grade, percentage }) => `${grade}: ${percentage}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="count"
                      >
                        {gradeDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Grade Distribution Bar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Grade Frequency</CardTitle>
                  <CardDescription>Number of students in each grade category</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={gradeDistribution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="grade" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="trends" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Performance Trends</CardTitle>
                <CardDescription>Track how class performance changes over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={assignmentTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="average" stroke="#3B82F6" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rubrics" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Rubric Criterion Performance</CardTitle>
                <CardDescription>See which areas students excel in and struggle with</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {rubricPerformance.map((criterion, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{criterion.criterion}</span>
                        <div className="text-right">
                          <Badge variant="outline">
                            {criterion.average}/{criterion.maxPoints} pts
                          </Badge>
                          <div className="text-sm text-gray-500">
                            {Math.round((criterion.average / criterion.maxPoints) * 100)}%
                          </div>
                        </div>
                      </div>
                      <Progress value={(criterion.average / criterion.maxPoints) * 100} className="h-3" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="students" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Struggling Students */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    <span>Students Needing Support</span>
                  </CardTitle>
                  <CardDescription>Students performing below 70% average</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {strugglingStudents.map((student, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{student.name}</span>
                          <Badge variant="destructive">{student.average}%</Badge>
                        </div>
                        <div className="text-sm text-gray-500 space-y-1">
                          <div>Assignments completed: {student.assignments}</div>
                          <div>Last submission: {student.lastSubmission}</div>
                        </div>
                        <Button size="sm" className="mt-2">
                          Send Check-in
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Top Performers */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Award className="h-5 w-5 text-yellow-500" />
                    <span>Top Performers</span>
                  </CardTitle>
                  <CardDescription>Students excelling with 90%+ averages</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {topPerformers.map((student, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{student.name}</span>
                          <Badge variant="default">{student.average}%</Badge>
                        </div>
                        <div className="text-sm text-gray-500 space-y-1">
                          <div>Assignments completed: {student.assignments}</div>
                          <div>Current streak: {student.streak} A's</div>
                        </div>
                        <Button size="sm" variant="outline" className="mt-2 bg-transparent">
                          Send Praise
                        </Button>
                      </div>
                    ))}
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
