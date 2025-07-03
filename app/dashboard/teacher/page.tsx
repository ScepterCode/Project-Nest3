"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BookOpen, Users, FileText, Plus, Bell, Search, Filter, MoreHorizontal, Clock, CheckCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export default function TeacherDashboard() {
  const [activeTab, setActiveTab] = useState("overview")

  // Mock data
  const classes = [
    { id: 1, name: "Grade 11 Biology", students: 25, assignments: 12, code: "BIO11A" },
    { id: 2, name: "Grade 10 Chemistry", students: 30, assignments: 8, code: "CHEM10B" },
    { id: 3, name: "Advanced Physics", students: 18, assignments: 15, code: "PHYS12A" },
  ]

  const recentAssignments = [
    {
      id: 1,
      title: "Cell Structure Lab Report",
      class: "Grade 11 Biology",
      dueDate: "2024-01-15",
      submissions: 18,
      total: 25,
      status: "active",
    },
    {
      id: 2,
      title: "Chemical Reactions Quiz",
      class: "Grade 10 Chemistry",
      dueDate: "2024-01-12",
      submissions: 30,
      total: 30,
      status: "completed",
    },
    {
      id: 3,
      title: "Newton's Laws Project",
      class: "Advanced Physics",
      dueDate: "2024-01-20",
      submissions: 12,
      total: 18,
      status: "active",
    },
  ]

  const pendingGrading = [
    {
      id: 1,
      student: "John Obi",
      assignment: "Cell Structure Lab Report",
      submitted: "2 hours ago",
      class: "Grade 11 Biology",
    },
    {
      id: 2,
      student: "Adaeze Nwoko",
      assignment: "Newton's Laws Project",
      submitted: "1 day ago",
      class: "Advanced Physics",
    },
    {
      id: 3,
      student: "Musa Lawal",
      assignment: "Cell Structure Lab Report",
      submitted: "3 hours ago",
      class: "Grade 11 Biology",
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <BookOpen className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold">Teacher Dashboard</h1>
                <p className="text-gray-600 dark:text-gray-400">Welcome back, Dr. Sarah Johnson</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="icon">
                <Search className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Bell className="h-5 w-5" />
              </Button>
              <Avatar>
                <AvatarImage src="/placeholder.svg?height=32&width=32" />
                <AvatarFallback>SJ</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="classes">My Classes</TabsTrigger>
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
            <TabsTrigger value="grading">Grading</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Classes</CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">3</div>
                  <p className="text-xs text-muted-foreground">Active this semester</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">73</div>
                  <p className="text-xs text-muted-foreground">Across all classes</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Assignments</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">8</div>
                  <p className="text-xs text-muted-foreground">Due this week</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Grading</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">12</div>
                  <p className="text-xs text-muted-foreground">Submissions to review</p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Assignments</CardTitle>
                  <CardDescription>Latest assignment activity</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recentAssignments.map((assignment) => (
                    <div key={assignment.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <h4 className="font-medium">{assignment.title}</h4>
                        <p className="text-sm text-gray-600">{assignment.class}</p>
                        <p className="text-xs text-gray-500">Due: {assignment.dueDate}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant={assignment.status === "completed" ? "default" : "secondary"}>
                          {assignment.submissions}/{assignment.total}
                        </Badge>
                        {assignment.status === "completed" ? (
                          <CheckCircle className="h-4 w-4 text-green-500 mt-1" />
                        ) : (
                          <Clock className="h-4 w-4 text-orange-500 mt-1" />
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pending Grading</CardTitle>
                  <CardDescription>Submissions awaiting review</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pendingGrading.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <h4 className="font-medium">{item.student}</h4>
                        <p className="text-sm text-gray-600">{item.assignment}</p>
                        <p className="text-xs text-gray-500">
                          {item.class} • {item.submitted}
                        </p>
                      </div>
                      <Button size="sm">Review</Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="classes" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">My Classes</h2>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Class
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {classes.map((classItem) => (
                <Card key={classItem.id} className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>{classItem.name}</CardTitle>
                        <CardDescription>Class Code: {classItem.code}</CardDescription>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem>Edit Class</DropdownMenuItem>
                          <DropdownMenuItem>View Students</DropdownMenuItem>
                          <DropdownMenuItem>Class Settings</DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">Archive Class</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-1">
                          <Users className="h-4 w-4 text-gray-500" />
                          <span className="text-sm">{classItem.students} students</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <FileText className="h-4 w-4 text-gray-500" />
                          <span className="text-sm">{classItem.assignments} assignments</span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        Manage
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="assignments" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Assignments</h2>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Assignment
              </Button>
            </div>

            <div className="flex space-x-4">
              <div className="flex-1">
                <Input placeholder="Search assignments..." className="max-w-sm" />
              </div>
              <Button variant="outline">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </div>

            <div className="space-y-4">
              {recentAssignments.map((assignment) => (
                <Card key={assignment.id}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h3 className="text-lg font-semibold">{assignment.title}</h3>
                          <Badge variant={assignment.status === "completed" ? "default" : "secondary"}>
                            {assignment.status}
                          </Badge>
                        </div>
                        <p className="text-gray-600 mt-1">{assignment.class}</p>
                        <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                          <span>Due: {assignment.dueDate}</span>
                          <span>
                            Submissions: {assignment.submissions}/{assignment.total}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button variant="outline" size="sm">
                          View Details
                        </Button>
                        <Button size="sm">Grade</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="grading" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Grading Queue</h2>
              <div className="flex space-x-2">
                <Button variant="outline">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter by Class
                </Button>
                <Button variant="outline">Sort by Date</Button>
              </div>
            </div>

            <div className="space-y-4">
              {pendingGrading.map((item) => (
                <Card key={item.id}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <Avatar>
                          <AvatarFallback>
                            {item.student
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold">{item.student}</h3>
                          <p className="text-gray-600">{item.assignment}</p>
                          <div className="flex items-center space-x-2 mt-1 text-sm text-gray-500">
                            <span>{item.class}</span>
                            <span>•</span>
                            <span>Submitted {item.submitted}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button variant="outline" size="sm">
                          Download
                        </Button>
                        <Button size="sm">Grade Now</Button>
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
