"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/components/session-provider"

export default function CreateAssignmentPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [classId, setClassId] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [classes, setClasses] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const fetchClasses = async () => {
      const { data, error } = await supabase.from('classes').select('id, name')
      if (error) {
        console.error('Error fetching classes:', error)
      } else {
        setClasses(data)
      }
    }

    fetchClasses()
  }, [supabase])

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data, error } = await supabase.from('assignments').insert([
        {
          title,
          description,
          class_id: classId,
          due_date: dueDate,
          teacher_id: user.id,
        },
      ])

      if (error) {
        console.error("Error creating assignment:", error)
        alert(error.message || "Failed to create assignment")
      } else {
        router.push("/dashboard/teacher/assignments")
      }
    }

    setIsLoading(false)
  }

  return (
    <div className="p-6">
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Create a New Assignment</CardTitle>
          <CardDescription>Fill out the details below to create a new assignment.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateAssignment} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g., Cell Structure Lab Report"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="e.g., A report on the structure of a cell."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="class">Class</Label>
              <Select onValueChange={setClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Creating Assignment..." : "Create Assignment"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
