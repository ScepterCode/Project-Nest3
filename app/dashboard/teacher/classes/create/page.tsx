"use client"

import { useState } from "react"
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

    try {
      // Get the default institution for the class
      const { data: institutions, error: instError } = await supabase
        .from('institutions')
        .select('id')
        .limit(1)
        .single();

      if (instError) {
        alert('Error: Could not find institution. Please contact administrator.');
        return;
      }

      const { error } = await supabase.from('classes').insert([
        { 
          name: className, 
          description: description, 
          teacher_id: user.id,
          institution_id: institutions.id,
          code: className.replace(/\s+/g, '').toUpperCase().substring(0, 8) // Generate a simple code
        },
      ]);

      if (error) {
        console.error("Error creating class:", error);
        alert(`Failed to create class: ${error.message}`);
      } else {
        alert(`Class "${className}" created successfully!`);
        router.push("/dashboard/teacher/classes");
      }
    } catch (error) {
      console.error("Database connection error:", error);
      alert(`Failed to create class: ${error}`);
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
    </RoleGate>
  )
}
