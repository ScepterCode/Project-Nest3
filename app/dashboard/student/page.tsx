"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import Link from "next/link"
import {
  BookOpen,
  Calendar,
  FileText,
  Plus,
  Bell,
  Search,
  Clock,
  CheckCircle,
  AlertTriangle,
  Upload,
  Download,
} from "lucide-react"


export default function StudentDashboard() {
  const [activeTab, setActiveTab] = useState("overview")
  const [enrolledClasses, setEnrolledClasses] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<any[]>([])
  const [recentGrades, setRecentGrades] = useState<any[]>([])
  const [userProfile, setUserProfile] = useState<any>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return

      try {
        // Fetch user profile, create if doesn't exist
        let { data: profileData, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .maybeSingle()
        
        if (profileError) {
          console.error('Error fetching user profile:', profileError)
        }
        
        // If no profile exists, create one
        if (!profileData) {
          const { data: newProfile, error: insertError } = await supabase
            .from('users')
            .insert([{
              id: user.id,
              email: user.email,
              first_name: user.user_metadata?.first_name || user.email?.split('@')[0] || 'User',
              last_name: user.user_metadata?.last_name || '',
              role: 'student'
            }])
            .select()
            .single()
          
          if (insertError) {
            console.error('Error creating user profile:', insertError)
            setUserProfile({ 
              first_name: user.email?.split('@')[0] || 'User', 
              last_name: '' 
            })
          } else {
            setUserProfile(newProfile)
          }
        } else {
          setUserProfile(profileData)
        }

        // Fetch enrolled classes
        const { data: classesData, error: classesError } = await supabase.from('classes').select('*')
        if (classesError) {
          console.error('Error fetching classes:', classesError)
          setEnrolledClasses([])
        } else {
          setEnrolledClasses(classesData || [])
        }

        // Fetch assignments
        const { data: assignmentsData, error: assignmentsError } = await supabase.from('assignments').select('*')
        if (assignmentsError) {
          console.error('Error fetching assignments:', assignmentsError)
          setAssignments([])
        } else {
          setAssignments(assignmentsData || [])
        }

        // Fetch upcoming deadlines (you'll need to adjust this query based on your logic)
        const { data: deadlinesData, error: deadlinesError } = await supabase
          .from('assignments')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(3)
        if (deadlinesError) {
          console.error('Error fetching deadlines:', deadlinesError)
          setUpcomingDeadlines([])
        } else {
          setUpcomingDeadlines(deadlinesData || [])
        }

        // Fetch recent grades (you'll need to adjust this query based on your logic)
        const { data: gradesData, error: gradesError } = await supabase
          .from('submissions')
          .select('*, assignments(*)')
          .eq('student_id', user.id)
          .order('created_at', { ascending: false })
          .limit(3)
        if (gradesError) {
          console.error('Error fetching grades:', gradesError)
          setRecentGrades([])
        } else {
          setRecentGrades(gradesData || [])
        }
      } catch (error: any) {
        setError(error.message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [user])

  if (isLoading || authLoading) {
    return <div>Loading dashboard...</div>
  }

  if (error || !user) {
    return <div>Error: {error || "User not authenticated"}</div>
  }

  const handleSubmitAssignment = async (assignmentId: string) => {
    const content = prompt("Enter your submission content:")
    if (content === null) return // User cancelled

    try {
      if (!user) {
        alert("You must be logged in to submit an assignment.")
        return
      }

      const { data, error } = await supabase.from('submissions').insert([
        {
          assignment_id: assignmentId,
          student_id: user.id,
          content: content,
          status: 'submitted',
        },
      ])

      if (error) {
        console.error('Error submitting assignment:', error)
        alert(error.message || 'Failed to submit assignment')
      } else {
        alert('Assignment submitted successfully!')
        // Re-fetch assignments to update their status
        const { data: assignmentsData, error: assignmentsError } = await supabase.from('assignments').select()
        if (assignmentsError) console.error('Error refetching assignments:', assignmentsError)
        else setAssignments(assignmentsData)
      }
    } catch (error: any) {
      console.error('Error submitting assignment:', error)
      alert(error.message)
    }
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
                <h1 className="text-2xl font-bold">Student Dashboard</h1>
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
                    <AvatarFallback>AT</AvatarFallback>
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
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
            <TabsTrigger value="classes">My Classes</TabsTrigger>
            <TabsTrigger value="grades">Grades</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Enrolled Classes</CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">3</div>
                  <p className="text-xs text-muted-foreground">This semester</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Tasks</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">5</div>
                  <p className="text-xs text-muted-foreground">Due this week</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Average Grade</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">B+</div>
                  <p className="text-xs text-muted-foreground">All subjects</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">92%</div>
                  <p className="text-xs text-muted-foreground">On-time submissions</p>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Upcoming Deadlines</CardTitle>
                  <CardDescription>Don&apos;t miss these important dates</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {upcomingDeadlines.length > 0 ? (
                    upcomingDeadlines.map((deadline, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <h4 className="font-medium">{deadline.title || 'Untitled Assignment'}</h4>
                          <p className="text-sm text-gray-600">{deadline.class_name || 'No class specified'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{deadline.due_date || deadline.created_at || 'No date'}</p>
                          <Badge variant="secondary">
                            Assignment
                          </Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      No upcoming deadlines
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Grades</CardTitle>
                  <CardDescription>Your latest assignment results</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recentGrades.length > 0 ? (
                    recentGrades.map((grade, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <h4 className="font-medium">{grade.assignments?.title || 'Assignment'}</h4>
                          <p className="text-sm text-gray-600">{grade.assignments?.class_name || 'No class'}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="default" className="text-lg">
                            {grade.grade || 'Not graded'}
                          </Badge>
                          <p className="text-xs text-gray-500 mt-1">{grade.created_at || 'No date'}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      No recent grades
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Class Progress */}
            <Card>
              <CardHeader>
                <CardTitle>Class Progress</CardTitle>
                <CardDescription>Your progress across all enrolled classes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {enrolledClasses.length > 0 ? (
                  enrolledClasses.map((classItem) => (
                    <div key={classItem.id} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="font-medium">{classItem.name || 'Untitled Class'}</h4>
                          <p className="text-sm text-gray-600">{classItem.teacher || classItem.instructor || 'No instructor'}</p>
                        </div>
                        <span className="text-sm font-medium">{classItem.progress || 0}%</span>
                      </div>
                      <Progress value={classItem.progress || 0} className="h-2" />
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    No enrolled classes
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assignments" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">My Assignments</h2>
              <Button variant="outline">
                <Calendar className="h-4 w-4 mr-2" />
                Calendar View
              </Button>
            </div>

            <div className="space-y-4">
              {assignments.length > 0 ? (
                assignments.map((assignment) => (
                  <Card key={assignment.id}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h3 className="text-lg font-semibold">{assignment.title || 'Untitled Assignment'}</h3>
                            <Badge
                              variant={
                                assignment.status === "graded"
                                  ? "default"
                                  : assignment.status === "submitted"
                                    ? "secondary"
                                    : "destructive"
                              }
                            >
                              {assignment.status || 'pending'}
                            </Badge>
                            {assignment.priority === "high" && <AlertTriangle className="h-4 w-4 text-red-500" />}
                          </div>
                          <p className="text-gray-600 mt-1">{assignment.class_name || 'No class specified'}</p>
                          <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                            <span>Due: {assignment.due_date || assignment.created_at || 'No date'}</span>
                            {assignment.grade && <span>Grade: {assignment.grade}</span>}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {!assignment.submitted ? (
                            <Button onClick={() => handleSubmitAssignment(assignment.id)}>
                              <Upload className="h-4 w-4 mr-2" />
                              Submit
                            </Button>
                          ) : (
                            <Button variant="outline">
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/student/assignments/${assignment.id}`)}>
                            View Details
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No assignments found
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="classes" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">My Classes</h2>
              <Link href="/dashboard/student/classes/join">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Join Class
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enrolledClasses.length > 0 ? (
                enrolledClasses.map((classItem) => (
                  <Card key={classItem.id} className="hover:shadow-lg transition-shadow cursor-pointer">
                    <CardHeader>
                      <CardTitle>{classItem.name || 'Untitled Class'}</CardTitle>
                      <CardDescription>{classItem.teacher || classItem.instructor || 'No instructor'}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-gray-600">Progress</span>
                            <span className="text-sm font-medium">{classItem.progress || 0}%</span>
                          </div>
                          <Progress value={classItem.progress || 0} className="h-2" />
                        </div>
                        <div className="flex justify-between items-center">
                          <Badge variant="outline">Code: {classItem.code || classItem.class_code || 'No code'}</Badge>
                          <Button variant="outline" size="sm">
                            Enter Class
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="col-span-full text-center py-8 text-gray-500">
                  No enrolled classes found
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="grades" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">My Grades</h2>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {enrolledClasses.length > 0 ? (
                enrolledClasses.map((classItem) => (
                  <Card key={classItem.id}>
                    <CardHeader>
                      <CardTitle>{classItem.name || 'Untitled Class'}</CardTitle>
                      <CardDescription>{classItem.teacher || classItem.instructor || 'No instructor'}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-blue-600">B+</div>
                          <p className="text-sm text-gray-600">Current Grade</p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm">Assignments</span>
                            <span className="text-sm font-medium">85%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Quizzes</span>
                            <span className="text-sm font-medium">92%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Participation</span>
                            <span className="text-sm font-medium">88%</span>
                          </div>
                        </div>
                        <Button variant="outline" className="w-full bg-transparent">
                          View Details
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="col-span-full text-center py-8 text-gray-500">
                  No enrolled classes found
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
