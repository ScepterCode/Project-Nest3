"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { RoleGate } from "@/components/ui/permission-gate"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Users, BookOpen, Settings, UserPlus, Copy, Check } from "lucide-react"
import { formatClassCodeForDisplay } from "@/lib/utils/class-code-generator"

interface ClassData {
  id: string
  name: string
  description: string
  code: string
  status: string
  enrollment_count: number
  created_at: string
  teacher_id: string
}

interface Student {
  id: string
  first_name: string
  last_name: string
  email: string
  enrolled_at: string
}

export default function ManageClassPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const [classData, setClassData] = useState<ClassData | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const [activeTab, setActiveTab] = useState("overview")

  const classId = params?.id as string

  useEffect(() => {
    if (!classId || !user) return

    const fetchClassData = async () => {
      try {
        const supabase = createClient()
        
        // Fetch class data
        const { data: classInfo, error: classError } = await supabase
          .from('classes')
          .select('*')
          .eq('id', classId)
          .eq('teacher_id', user.id)
          .single()

        if (classError) {
          setError('Class not found or access denied')
          return
        }

        setClassData(classInfo)

        // Fetch enrolled students
        const { data: enrolledStudents, error: studentsError } = await supabase
          .from('enrollments')
          .select(`
            id,
            enrolled_at,
            users!inner(
              id,
              first_name,
              last_name,
              email
            )
          `)
          .eq('class_id', classId)
          .eq('status', 'active')

        if (!studentsError && enrolledStudents) {
          const formattedStudents = enrolledStudents.map((enrollment: any) => ({
            id: enrollment.users.id,
            first_name: enrollment.users.first_name,
            last_name: enrollment.users.last_name,
            email: enrollment.users.email,
            enrolled_at: enrollment.enrolled_at
          }))
          setStudents(formattedStudents)
        }

      } catch (err) {
        console.error('Error fetching class data:', err)
        setError('Failed to load class data')
      } finally {
        setLoading(false)
      }
    }

    fetchClassData()
  }, [classId, user])

  const copyClassCode = async () => {
    if (!classData?.code) return
    
    try {
      await navigator.clipboard.writeText(classData.code)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error || !classData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-semibold mb-2">Error</h3>
            <p className="text-gray-600 mb-4">{error || 'Class not found'}</p>
            <Button onClick={() => router.push('/dashboard/teacher/classes')}>
              Back to Classes
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <RoleGate userId={user?.id || ''} allowedRoles={['teacher']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{classData.name}</h1>
            <p className="text-gray-600">{classData.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={classData.status === 'active' ? 'default' : 'secondary'}>
              {classData.status}
            </Badge>
          </div>
        </div>

        {/* Class Code Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Class Code
            </CardTitle>
            <CardDescription>
              Share this code with students so they can join your class
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="bg-gray-100 px-4 py-2 rounded-lg font-mono text-lg font-bold">
                {formatClassCodeForDisplay(classData.code)}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={copyClassCode}
                className="flex items-center gap-2"
              >
                {codeCopied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy Code
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="students">Students ({students.length})</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{students.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Class Status</CardTitle>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold capitalize">{classData.status}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Created</CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {new Date(classData.created_at).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="students" className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Enrolled Students</h3>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Students
              </Button>
            </div>

            {students.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No students enrolled yet</h3>
                  <p className="text-gray-600 mb-4">
                    Share your class code with students so they can join your class.
                  </p>
                  <Button onClick={copyClassCode}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Class Code
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {students.map((student) => (
                  <Card key={student.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {student.first_name?.[0]}{student.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {student.first_name} {student.last_name}
                            </p>
                            <p className="text-sm text-gray-600">{student.email}</p>
                          </div>
                        </div>
                        <div className="text-sm text-gray-500">
                          Joined {new Date(student.enrolled_at).toLocaleDateString()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Class Settings</CardTitle>
                <CardDescription>
                  Manage your class settings and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="className">Class Name</Label>
                  <Input
                    id="className"
                    defaultValue={classData.name}
                    placeholder="Enter class name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    defaultValue={classData.description}
                    placeholder="Enter class description"
                    rows={3}
                  />
                </div>

                <div className="flex gap-2">
                  <Button>Save Changes</Button>
                  <Button variant="outline">Cancel</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </RoleGate>
  )
}