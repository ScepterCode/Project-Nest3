"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/components/session-provider"

export default function JoinClassPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [classCode, setClassCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        alert("You must be logged in to join a class.")
        setIsLoading(false)
        return
      }

      // First, find the class by its code
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('id')
        .eq('code', classCode)
        .single()

      if (classError || !classData) {
        console.error("Error finding class:", classError)
        alert("Class not found or an error occurred.")
        setIsLoading(false)
        return
      }

      // Then, enroll the student in the class
      const { data, error } = await supabase.from('class_enrollments').insert([
        {
          class_id: classData.id,
          student_id: user.id,
          status: 'active',
        },
      ])

      if (error) {
        console.error("Error joining class:", error)
        alert(error.message || "Failed to join class")
      } else {
        alert("Successfully joined class!")
        router.push("/dashboard/student/classes")
      }
    } catch (error: any) {
      console.error("Error joining class:", error)
      alert(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-6">
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Join a Class</CardTitle>
          <CardDescription>Enter the class code to join an existing class.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoinClass} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="classCode">Class Code</Label>
              <Input
                id="classCode"
                placeholder="e.g., BIO11A"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Joining Class..." : "Join Class"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
