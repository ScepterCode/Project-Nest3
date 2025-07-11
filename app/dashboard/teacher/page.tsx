"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BookOpen, Users, FileText, Plus, Bell, Search, Filter, MoreHorizontal, Clock, CheckCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"


export default function TeacherDashboard() {
  const [activeTab, setActiveTab] = useState("overview")
  const [classes, setClasses] = useState<any[]>([])
  const [recentAssignments, setRecentAssignments] = useState<any[]>([])
  const [pendingGrading, setPendingGrading] = useState<any[]>([])
  const [sortOrder, setSortOrder] = useState("asc") // 'asc' or 'desc'

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState("")
  const [filteredAssignments, setFilteredAssignments] = useState<any[]>([])

  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return

      try {
        // Fetch classes
        const { data: classesData, error: classesError } = await supabase.from('classes').select()
        if (classesError) throw classesError
        setClasses(classesData)

        // Fetch assignments
        let assignmentQuery = supabase.from('assignments').select()

        if (searchTerm) {
          assignmentQuery = assignmentQuery.ilike('title', `%${searchTerm}%`)
        }

        const { data: assignmentsData, error: assignmentsError } = await assignmentQuery
        if (assignmentsError) throw assignmentsError
        setRecentAssignments(assignmentsData)
        setFilteredAssignments(assignmentsData)

        // Fetch pending grading
        let gradingQuery = supabase.from('submissions').select('*, users(*), assignments(*)').eq('status', 'submitted')
        if (sortOrder === "asc") {
          gradingQuery = gradingQuery.order('submitted_at', { ascending: true })
        } else {
          gradingQuery = gradingQuery.order('submitted_at', { ascending: false })
        }

        const { data: pendingGradingData, error: pendingGradingError } = await gradingQuery
        if (pendingGradingError) throw pendingGradingError
        setPendingGrading(pendingGradingData)
      } catch (error: any) {
        setError(error.message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [searchTerm, sortOrder, user])

  const handleEditClass = (classId: string) => {
    // Implement navigation to an edit class page
    console.log(`Editing class with ID: ${classId}`)
    // router.push(`/dashboard/teacher/classes/${classId}/edit`)
  }

  const handleArchiveClass = async (classId: string) => {
    if (!confirm("Are you sure you want to archive this class? This action cannot be undone.")) {
      return
    }
    try {
      const { error } = await supabase.from('classes').update({ status: 'archived' }).eq('id', classId)
      if (error) {
        console.error('Error archiving class:', error)
        alert(error.message || 'Failed to archive class')
      } else {
        alert('Class archived successfully!')
        // Re-fetch classes to update the list
        const { data: classesData, error: classesError } = await supabase.from('classes').select()
        if (classesError) console.error('Error refetching classes:', classesError)
        else setClasses(classesData)
      }
    } catch (error: any) {
      console.error('Error archiving class:', error)
      alert(error.message)
    }
  }

  const handleGradeSubmission = async (submissionId: string) => {
    const grade = prompt("Enter grade:")
    const feedback = prompt("Enter feedback (optional):")

    if (grade === null) return // User cancelled

    try {
      const response = await fetch('/api/submissions/grade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ submissionId, grade, feedback }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to grade submission')
      }

      alert('Submission graded successfully!')
      // Re-fetch pending grading to update the list
      const { data: pendingGradingData, error: pendingGradingError } = await supabase.from('submissions').select('*, users(*), assignments(*)').eq('status', 'submitted').order('submitted_at', { ascending: true })
      if (pendingGradingError) console.error('Error refetching pending grading:', pendingGradingError)
      else setPendingGrading(pendingGradingData)

    } catch (error: any) {
      console.error('Error grading submission:', error)
      alert(error.message)
    }
  }

  if (isLoading || authLoading) {
    return <div>Loading dashboard...</div>
  }

  if (error || !user) {
    return <div>Error: {error || "User not authenticated"}</div>
  }

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
                <p className="text-gray-600 dark:text-gray-400">Welcome back, {userProfile?.first_name} {userProfile?.last_name}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="icon">
                <Search className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Bell className="h-5 w-5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar>
                    <AvatarImage src="/placeholder.svg?height=32&width=32" />
                    <AvatarFallback>SJ</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>View Profile</DropdownMenuItem>
                  {/* Add logout or other profile-related options here */}
                </DropdownMenuContent>
              </DropdownMenu>
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
              <Link href="/dashboard/teacher/classes/create">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Class
                </Button>
              </Link>
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
                          <DropdownMenuItem onClick={() => handleEditClass(classItem.id)}>Edit Class</DropdownMenuItem>
                          <DropdownMenuItem>View Students</DropdownMenuItem>
                          <DropdownMenuItem>Class Settings</DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={() => handleArchiveClass(classItem.id)}>Archive Class</DropdownMenuItem>
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
              <Link href="/dashboard/teacher/assignments/create">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Assignment
                </Button>
              </Link>
            </div>

            <div className="flex space-x-4">
              <div className="flex-1">
                <Input placeholder="Search assignments..." className="max-w-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Filter className="h-4 w-4 mr-2" />
                    Filter by Class
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => setFilteredAssignments(recentAssignments)}>All Classes</DropdownMenuItem>
                  {classes.map((classItem) => (
                    <DropdownMenuItem key={classItem.id} onSelect={() => setFilteredAssignments(recentAssignments.filter(a => a.class_id === classItem.id))}>
                      {classItem.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-4">
              {filteredAssignments.map((assignment) => (
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
                        <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/teacher/assignments/${assignment.id}`)}>
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <Filter className="h-4 w-4 mr-2" />
                      Filter by Class
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>All Classes</DropdownMenuItem>
                    {/* Add class filter options here */}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">Sort by Date</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => setSortOrder("asc")}>Oldest First</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setSortOrder("desc")}>Newest First</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                        <Button size="sm" onClick={() => handleGradeSubmission(item.id)}>
                          Grade Now
                        </Button>
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
