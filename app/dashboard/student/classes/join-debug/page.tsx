"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft } from "lucide-react"

export default function JoinClassDebugPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [classCode, setClassCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const addDebugInfo = (message: string) => {
    console.log(message)
    setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
  }

  const handleTestTables = async () => {
    setDebugInfo([])
    addDebugInfo('Starting table tests...')
    
    try {
      const supabase = createClient()
      
      // Test classes table
      addDebugInfo('Testing classes table...')
      const { data: classes, error: classesError } = await supabase
        .from('classes')
        .select('id, name, code, status')
        .limit(3)
      
      if (classesError) {
        addDebugInfo(`❌ Classes table error: ${classesError.message}`)
      } else {
        addDebugInfo(`✅ Classes table OK. Found ${classes?.length || 0} classes`)
        classes?.forEach(c => addDebugInfo(`   - ${c.name} (${c.code})`))
      }
      
      // Test enrollments table
      addDebugInfo('Testing enrollments table...')
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('enrollments')
        .select('count')
        .limit(1)
      
      if (enrollmentsError) {
        addDebugInfo(`❌ Enrollments table error: ${enrollmentsError.message}`)
        if (enrollmentsError.message.includes('does not exist')) {
          addDebugInfo('   → You need to run create-enrollments-table-minimal.sql')
        }
      } else {
        addDebugInfo('✅ Enrollments table OK')
      }
      
      // Test user info
      addDebugInfo(`User ID: ${user?.id || 'Not logged in'}`)
      addDebugInfo(`User email: ${user?.email || 'No email'}`)
      
    } catch (error) {
      addDebugInfo(`❌ Test error: ${error instanceof Error ? error.message : error}`)
    }
  }

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!classCode.trim()) {
      setError("Please enter a class code")
      return
    }

    setIsLoading(true)
    setError(null)
    setDebugInfo([])

    try {
      addDebugInfo('Starting join class process...')
      const supabase = createClient()
      
      const cleanCode = classCode.replace(/\s+/g, '').toUpperCase()
      addDebugInfo(`Looking for class with code: ${cleanCode}`)

      // Find the class by code
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select(`
          id,
          name,
          description,
          teacher_id,
          status,
          enrollment_count,
          max_enrollment
        `)
        .eq('code', cleanCode)
        .eq('status', 'active')
        .single()

      if (classError) {
        addDebugInfo(`❌ Class lookup error: ${classError.message}`)
        setError('No active class found with the provided code')
        return
      }

      addDebugInfo(`✅ Found class: ${classData.name}`)
      addDebugInfo(`   - ID: ${classData.id}`)
      addDebugInfo(`   - Teacher ID: ${classData.teacher_id}`)
      addDebugInfo(`   - Current enrollment: ${classData.enrollment_count || 0}`)

      // Check if student is already enrolled
      addDebugInfo('Checking existing enrollment...')
      const { data: existingEnrollment, error: enrollmentCheckError } = await supabase
        .from('enrollments')
        .select('id, status')
        .eq('class_id', classData.id)
        .eq('student_id', user.id)
        .single()

      if (enrollmentCheckError && enrollmentCheckError.code !== 'PGRST116') {
        addDebugInfo(`❌ Enrollment check error: ${enrollmentCheckError.message}`)
        setError('Failed to check enrollment status')
        return
      }

      if (existingEnrollment) {
        addDebugInfo(`⚠️ Already enrolled with status: ${existingEnrollment.status}`)
        if (existingEnrollment.status === 'enrolled') {
          setError('You are already enrolled in this class')
          return
        }
      } else {
        addDebugInfo('✅ No existing enrollment found')
      }

      // Enroll the student
      addDebugInfo('Creating enrollment record...')
      const { data: enrollment, error: enrollmentError } = await supabase
        .from('enrollments')
        .insert({
          class_id: classData.id,
          student_id: user.id,
          status: 'enrolled',
          enrolled_at: new Date().toISOString()
        })
        .select()
        .single()

      if (enrollmentError) {
        addDebugInfo(`❌ Enrollment error: ${enrollmentError.message}`)
        addDebugInfo(`   - Code: ${enrollmentError.code}`)
        addDebugInfo(`   - Details: ${enrollmentError.details}`)
        setError('Failed to enroll in the class. Check debug info below.')
        return
      }

      addDebugInfo(`✅ Successfully enrolled! Enrollment ID: ${enrollment.id}`)
      setError(null)
      
    } catch (err) {
      addDebugInfo(`❌ Unexpected error: ${err instanceof Error ? err.message : err}`)
      setError('An unexpected error occurred. Check debug info below.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div>Please log in to join a class.</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/dashboard/student/classes')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Classes
        </Button>
        <h1 className="text-2xl font-bold">Join Class (Debug Mode)</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Join Form */}
        <Card>
          <CardHeader>
            <CardTitle>Join a Class</CardTitle>
            <CardDescription>
              Enter the class code to join
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinClass} className="space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {error}
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="classCode">Class Code</Label>
                <Input
                  id="classCode"
                  placeholder="e.g., MATH101A"
                  value={classCode}
                  onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                  className="text-center font-mono text-lg"
                  disabled={isLoading}
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  type="submit" 
                  disabled={isLoading || !classCode.trim()}
                  className="flex-1"
                >
                  {isLoading ? "Joining..." : "Join Class"}
                </Button>
                <Button 
                  type="button"
                  variant="outline"
                  onClick={handleTestTables}
                >
                  Test Tables
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Debug Info */}
        <Card>
          <CardHeader>
            <CardTitle>Debug Information</CardTitle>
            <CardDescription>
              Real-time debugging info
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
              {debugInfo.length === 0 ? (
                <div className="text-gray-500">Click "Test Tables" or try joining a class to see debug info...</div>
              ) : (
                debugInfo.map((info, index) => (
                  <div key={index} className="mb-1">
                    {info}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}