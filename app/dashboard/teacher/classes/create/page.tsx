"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { RoleGate } from "@/components/ui/permission-gate"
import { DatabaseStatusBanner } from "@/components/database-status-banner"
import { generateRobustClassCode, generateSimpleClassCode, formatClassCodeForDisplay } from "@/lib/utils/robust-class-code-generator"

interface FormErrors {
  className?: string
  description?: string
  general?: string
}

interface ClassCreationResult {
  id: string
  name: string
  description: string
  code: string
  teacher_id: string
  created_at: string
}

export default function CreateClassPage() {
  const router = useRouter()
  const [className, setClassName] = useState("")
  const [description, setDescription] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<{ className?: boolean; description?: boolean }>({})
  const [createdClass, setCreatedClass] = useState<ClassCreationResult | null>(null)

  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()

  // Form validation function
  const validateForm = useCallback(() => {
    const newErrors: FormErrors = {}
    
    if (!className.trim()) {
      newErrors.className = "Class name is required"
    } else if (className.trim().length < 2) {
      newErrors.className = "Class name must be at least 2 characters long"
    } else if (className.trim().length > 100) {
      newErrors.className = "Class name must be less than 100 characters"
    }
    
    if (description.trim().length > 500) {
      newErrors.description = "Description must be less than 500 characters"
    }
    
    return newErrors
  }, [className, description])

  // Handle input changes with validation
  const handleClassNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setClassName(value)
    
    // Clear errors when user starts typing
    if (errors.className) {
      setErrors(prev => {
        const { className, ...rest } = prev
        return rest
      })
    }
  }, [errors.className])

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setDescription(value)
    
    // Clear errors when user starts typing
    if (errors.description) {
      setErrors(prev => {
        const { description, ...rest } = prev
        return rest
      })
    }
  }, [errors.description])

  // Handle field blur for validation
  const handleFieldBlur = useCallback((field: 'className' | 'description') => {
    setTouched(prev => ({ ...prev, [field]: true }))
    
    const newErrors = validateForm()
    if (newErrors[field]) {
      setErrors(prev => ({ ...prev, [field]: newErrors[field] }))
    }
  }, [validateForm])

  // Reset form after successful creation
  const resetForm = useCallback(() => {
    setClassName("")
    setDescription("")
    setErrors({})
    setTouched({})
    setCreatedClass(null)
  }, [])

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Clear any previous general errors
    setErrors(prev => {
      const { general, ...rest } = prev
      return rest
    })
    
    // Validate form
    const formErrors = validateForm()
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors)
      setTouched({ className: true, description: true })
      return
    }

    setIsLoading(true)

    if (!user) {
      setErrors({ general: "You must be logged in to create a class." })
      setIsLoading(false)
      return
    }

    try {
      console.log('Starting class creation process...')
      
      // Generate unique class code using the robust utility
      console.log('Generating class code for:', className.trim())
      const classCode = await generateRobustClassCode({ 
        className: className.trim(),
        maxRetries: 5 
      })
      console.log('Generated class code:', classCode)
      
      // Get user's institution_id from user_profiles table
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error("Error fetching user profile:", profileError)
        setErrors({ general: "Failed to fetch user information. Please try again." })
        setIsLoading(false)
        return
      }

      const { data: classData, error } = await supabase.from('classes').insert([
        { 
          name: className.trim(), 
          description: description.trim(), 
          teacher_id: user.id,
          institution_id: userProfile?.institution_id,
          code: classCode
        },
      ]).select().single() as { data: ClassCreationResult | null, error: any }

      if (error) {
        console.error("Error creating class:", error)
        setErrors({ general: `Failed to create class: ${error.message}` })
      } else if (classData) {
        // Store created class data for success display
        setCreatedClass(classData)
        
        // Create success notification
        try {
          const notificationResponse = await fetch('/api/notifications/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'class_created',
              title: 'Class Created Successfully',
              message: `Your class "${className.trim()}" has been created with code: ${formatClassCodeForDisplay(classCode)}`,
              priority: 'medium',
              action_url: `/dashboard/teacher/classes/${classData.id}`,
              action_label: 'View Class',
              metadata: {
                class_id: classData.id,
                class_name: classData.name,
                class_code: classCode
              }
            })
          })
          
          if (!notificationResponse.ok) {
            console.warn("Notification API returned error:", await notificationResponse.text())
          }
        } catch (notificationError) {
          console.warn("Failed to create notification:", notificationError)
          // Don't fail the entire operation if notification fails
        }

        // Show success message with prominent class code display
        // We'll handle navigation after user acknowledges the success
      }
    } catch (error) {
      console.error("Error in class creation:", error)
      
      if (error instanceof Error) {
        console.error("Error details:", {
          message: error.message,
          stack: error.stack,
          name: error.name
        })
        
        if (error.message.includes('Failed to generate unique class code')) {
          setErrors({ general: "Unable to generate a unique class code. This might be a database connectivity issue. Please try again." })
        } else if (error.message.includes('Database error') || error.message.includes('relation "classes" does not exist')) {
          setErrors({ general: "Database connection issue. Please check if the classes table exists and try again." })
        } else {
          setErrors({ general: `Failed to create class: ${error.message}` })
        }
      } else {
        setErrors({ general: `Failed to create class: ${error}` })
      }
    }

    setIsLoading(false)
  }

  if (authLoading) {
    return <div>Loading...</div>
  }

  if (!user) {
    return <div>Access Denied</div>
  }

  return (
    <RoleGate userId={user.id} allowedRoles={['teacher']}>
    <div className="p-6">
      <DatabaseStatusBanner />
      
      {/* Success Message with Class Code */}
      {createdClass && (
        <Card className="w-full max-w-2xl mx-auto mb-6 border-green-200 bg-green-50">
          <CardHeader className="text-center">
            <CardTitle className="text-green-800">🎉 Class Created Successfully!</CardTitle>
            <CardDescription className="text-green-700">
              Your class "{createdClass.name}" has been created and is ready for students.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="bg-white p-6 rounded-lg border-2 border-green-300">
              <p className="text-sm text-gray-600 mb-2">Share this class code with your students:</p>
              <div className="text-3xl font-bold text-green-800 tracking-wider mb-2">
                {formatClassCodeForDisplay(createdClass.code)}
              </div>
              <p className="text-xs text-gray-500">Students can use this code to join your class</p>
            </div>
            <div className="flex gap-3 justify-center">
              <Button 
                onClick={() => router.push(`/dashboard/teacher/classes/${createdClass.id}`)}
                className="bg-green-600 hover:bg-green-700"
              >
                View Class Details
              </Button>
              <Button 
                variant="outline" 
                onClick={() => router.push("/dashboard/teacher/classes")}
              >
                Go to My Classes
              </Button>
              <Button 
                variant="outline" 
                onClick={resetForm}
              >
                Create Another Class
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!createdClass && (
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Create a New Class</CardTitle>
            <CardDescription>Fill out the details below to create a new class.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateClass} className="space-y-4" noValidate>
            {errors.general && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {errors.general}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="className">
                Class Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="className"
                placeholder="e.g., Grade 11 Biology"
                value={className}
                onChange={handleClassNameChange}
                onBlur={() => handleFieldBlur('className')}
                className={errors.className ? "border-red-500 focus-visible:ring-red-500" : ""}
                aria-invalid={!!errors.className}
                aria-describedby={errors.className ? "className-error" : undefined}
                disabled={isLoading}
                required
              />
              {errors.className && touched.className && (
                <p id="className-error" className="text-sm text-red-600">
                  {errors.className}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="e.g., An introductory course to the world of biology."
                value={description}
                onChange={handleDescriptionChange}
                onBlur={() => handleFieldBlur('description')}
                className={errors.description ? "border-red-500 focus-visible:ring-red-500" : ""}
                aria-invalid={!!errors.description}
                aria-describedby={errors.description ? "description-error" : undefined}
                disabled={isLoading}
                rows={3}
              />
              {errors.description && touched.description && (
                <p id="description-error" className="text-sm text-red-600">
                  {errors.description}
                </p>
              )}
              <p className="text-xs text-gray-500">
                {description.length}/500 characters
              </p>
            </div>
            
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || Object.keys(validateForm()).length > 0}
            >
              {isLoading ? "Creating Class..." : "Create Class"}
            </Button>
          </form>
        </CardContent>
      </Card>
      )}
    </div>
    </RoleGate>
  )
}
