"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase-client"

export default function CreateClassPage() {
  const router = useRouter()
  const [className, setClassName] = useState("")
  const [description, setDescription] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    if (!user) {
      alert("You must be logged in to create a class.")
      setIsLoading(false)
      return
    }

    const { error } = await supabase.from('classes').insert([
      { name: className, description: description, teacher_id: user.id },
    ])

    if (error) {
      console.error("Error creating class:", error)
      alert(error.message || "Failed to create class")
    } else {
      router.push("/dashboard/teacher/classes")
    }

    setIsLoading(false)
  }

  if (authLoading) {
    return <div>Loading...</div>
  }

  if (!user || user.role !== 'teacher') {
    return <div>Access Denied</div>
  }

  return (
    <div className="p-6">
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Create a New Class</CardTitle>
          <CardDescription>Fill out the details below to create a new class.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateClass} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="className">Class Name</Label>
              <Input
                id="className"
                placeholder="e.g., Grade 11 Biology"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="e.g., An introductory course to the world of biology."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Creating Class..." : "Create Class"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
