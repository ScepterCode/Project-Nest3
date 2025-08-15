"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft, BookOpen, Users, CheckCircle } from "lucide-react"

interface JoinClassResult {
  enrollmentId: string
  classId: string
  className: string
  classDescription: string
  teacherName: string
  enrolledAt: string
}

export default function JoinClassPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [classCode, setClassCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<JoinClassResult | null>(null)

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!classCode.trim()) {
      setError("Please enter a class code")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      console.log('Starting join class process...')
      const supabase = createClient()
      
      // Clean the class code (remove spaces, convert to uppercase)
      const cleanCode = classCode.replace(/\s+/g, '').toUpperCase()
      console.log('Looking for class with code:', cleanCode)

      // Find the class by code - first try without RLS restrictions
      console.log('Querying classes table for code:', cleanCode)
      
      // Try a broader query first to see if the class exists at all
      const { data: allClasses, error: allClassesError } = await supabase
        .from('classes')
        .select('id, name, code, status, teacher_id')
        .eq('code', cleanCode)
      
      console.log('All classes with this code:', allClasses)
      console.log('All classes query error:', allClassesError)
      
      // Now try the specific query
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

      if (classError || !classData) {
        console.error('Class lookup error:', classError)
        console.error('Class lookup error details:', {
          message: classError?.message,
          code: classError?.code,
          details: classError?.details,
          hint: classError?.hint
        })
        
        // If we found classes in the broader query but not in the specific query, it might be an RLS issue
        if (allClasses && allClasses.length > 0 && !classData) {
          console.log('Class exists but not accessible - possible RLS issue')
          setError(`Class found but not accessible. Status: ${allClasses[0].status}. This might be a permissions issue.`)
        } else if (!allClasses || allClasses.length === 0) {
          setError('No class found with the provided code. Please check the code and try again.')
        } else {
          setError('No active class found with the provided code')
        }
        return
      }

      console.log('Found class:', classData.name)
      console.log('Class details:', {
        id: classData.id,
        name: classData.name,
        status: classData.status,
        teacher_id: classData.teacher_id,
        enrollment_count: classData.enrollment_count,
        max_enrollment: classData.max_enrollment
      })

      // Check if student is already enrolled
      console.log('Checking existing enrollment for student:', user.id, 'in class:', classData.id)
      const { data: existingEnrollment, error: enrollmentCheckError } = await supabase
        .from('enrollments')
        .select('id, status')
        .eq('class_id', classData.id)
        .eq('student_id', user.id)
        .single()

      if (enrollmentCheckError && enrollmentCheckError.code !== 'PGRST116') {
        console.error('Enrollment check error:', enrollmentCheckError)
        setError('Failed to check enrollment status')
        return
      }

      if (existingEnrollment) {
        if (existingEnrollment.status === 'enrolled') {
          setError('You are already enrolled in this class')
          return
        }
      }

      // Check class capacity if max_enrollment is set
      if (classData.max_enrollment && classData.enrollment_count >= classData.max_enrollment) {
        setError('This class has reached its maximum enrollment capacity')
        return
      }

      console.log('Enrolling student in class...')

      // Enroll the student
      // Try inserting without explicit status first (use default)
      const { data: enrollment, error: enrollmentError } = await supabase
        .from('enrollments')
        .insert({
          class_id: classData.id,
          student_id: user.id
          // Let status use the default value from the table
        })
        .select()
        .single()

      if (enrollmentError) {
        console.error('Enrollment error:', enrollmentError)
        console.error('Enrollment error details:', {
          message: enrollmentError?.message,
          code: enrollmentError?.code,
          details: enrollmentError?.details,
          hint: enrollmentError?.hint
        })
        
        // Provide more specific error messages
        if (enrollmentError?.message?.includes('relation "enrollments" does not exist')) {
          setError('Enrollments table does not exist. Please contact your administrator.')
        } else if (enrollmentError?.message?.includes('permission denied') || enrollmentError?.code === '42501') {
          setError('Permission denied. You may not have the required permissions to join classes.')
        } else if (enrollmentError?.message?.includes('duplicate key')) {
          setError('You are already enrolled in this class.')
        } else if (enrollmentError?.message?.includes('foreign key')) {
          setError('Invalid class or user reference. Please try again.')
        } else if (enrollmentError?.message?.includes('check constraint')) {
          setError(`Database constraint error: ${enrollmentError?.message}. The status value 'enrolled' may not be allowed.`)
        } else {
          setError(`Failed to enroll in the class: ${enrollmentError?.message || 'Unknown error'}`)
        }
        return
      }

      console.log('Successfully enrolled!')

      const teacherName = classData.users ? `${classData.users.first_name} ${classData.users.last_name}` : 'Unknown Teacher'

      setSuccess({
        enrollmentId: enrollment.id,
        classId: classData.id,
        className: classData.name,
        classDescription: classData.description || '',
        teacherName: teacherName,
        enrolledAt: enrollment.enrolled_at
      })
      setClassCode("")
      
    } catch (err) {
      console.error('Error joining class:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setSuccess(null)
    setError(null)
    setClassCode("")
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div>Please log in to join a class.</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
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
      </div>

      {/* Success State */}
      {success && (
        <Card className="border-green-200 bg-green-50 mb-6">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-green-800">Successfully Enrolled!</CardTitle>
            <CardDescription className="text-green-700">
              You have been enrolled in the class
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="bg-white p-4 rounded-lg border border-green-200">
              <h3 className="font-semibold text-lg text-gray-900">{success.className}</h3>
              <p className="text-gray-600 text-sm mt-1">{success.classDescription}</p>
              <p className="text-gray-500 text-sm mt-2">
                Taught by {success.teacherName}
              </p>
            </div>
            
            <div className="flex gap-3 justify-center">
              <Button 
                onClick={() => router.push(`/dashboard/student/classes`)}
                className="bg-green-600 hover:bg-green-700"
              >
                <BookOpen className="h-4 w-4 mr-2" />
                View My Classes
              </Button>
              <Button 
                variant="outline" 
                onClick={handleReset}
              >
                Join Another Class
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Join Form */}
      {!success && (
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-blue-600" />
            </div>
            <CardTitle>Join a Class</CardTitle>
            <CardDescription>
              Enter the class code provided by your teacher to join their class
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
                <Label htmlFor="classCode">
                  Class Code <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="classCode"
                  placeholder="e.g., MATH 101A or BIOL2024"
                  value={classCode}
                  onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                  className="text-center font-mono text-lg tracking-wider"
                  disabled={isLoading}
                  required
                />
                <p className="text-xs text-gray-500">
                  Enter the code exactly as provided by your teacher
                </p>
              </div>
              
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading || !classCode.trim()}
              >
                {isLoading ? "Joining Class..." : "Join Class"}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">How to join a class:</h4>
              <ol className="text-sm text-gray-600 space-y-1">
                <li>1. Get the class code from your teacher</li>
                <li>2. Enter the code in the field above</li>
                <li>3. Click "Join Class" to enroll</li>
                <li>4. Start accessing assignments and materials</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}