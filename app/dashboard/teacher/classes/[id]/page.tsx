"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { RoleGate } from "@/components/ui/permission-gate"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, BookOpen, Calendar, Settings, Copy, Check, ArrowLeft } from "lucide-react"
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

export default function ClassDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const [classData, setClassData] = useState<ClassData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)

  const classId = params?.id as string

  useEffect(() => {
    if (!classId || !user) return

    const fetchClassData = async () => {
      try {
        const supabase = createClient()
        
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
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/dashboard/teacher/classes')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Classes
          </Button>
        </div>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{classData.name}</h1>
            <p className="text-gray-600 mt-2">{classData.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={classData.status === 'active' ? 'default' : 'secondary'}>
              {classData.status}
            </Badge>
          </div>
        </div>

        {/* Class Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Class Code</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold font-mono">
                  {formatClassCodeForDisplay(classData.code)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyClassCode}
                >
                  {codeCopied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Students Enrolled</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{classData.enrollment_count || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Created</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Date(classData.created_at).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="hover:shadow-md transition-shadow cursor-pointer" 
                onClick={() => router.push(`/dashboard/teacher/classes/${classId}/manage`)}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Manage Class
              </CardTitle>
              <CardDescription>
                Manage students, settings, and class details
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/dashboard/teacher/assignments?class=${classId}`)}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Assignments
              </CardTitle>
              <CardDescription>
                Create and manage assignments for this class
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/dashboard/teacher/analytics?class=${classId}`)}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Analytics
              </CardTitle>
              <CardDescription>
                View class performance and student progress
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common tasks for managing your class
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => router.push(`/dashboard/teacher/assignments/create?class=${classId}`)}>
                Create Assignment
              </Button>
              <Button variant="outline" onClick={() => router.push(`/dashboard/teacher/classes/${classId}/manage`)}>
                View Students
              </Button>
              <Button variant="outline" onClick={copyClassCode}>
                {codeCopied ? 'Code Copied!' : 'Share Class Code'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </RoleGate>
  )
}