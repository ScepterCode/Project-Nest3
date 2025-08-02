"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Save, Users, Clock, Settings } from "lucide-react"
import Link from "next/link"

interface Assignment {
  id: string
  title: string
  description: string
  class_id: string
  class_name: string
  due_date: string
  total_students: number
}

interface PeerReviewSettings {
  title: string
  description: string
  instructions: string
  review_type: 'anonymous' | 'named' | 'blind'
  reviews_per_student: number
  start_date: string
  end_date: string
  auto_assign: boolean
  allow_self_review: boolean
  require_rating: boolean
  rating_scale: number
}

export default function CreatePeerReviewPage() {
  const router = useRouter()
  const params = useParams()
  const { user } = useAuth()
  const supabase = createClient()
  
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [settings, setSettings] = useState<PeerReviewSettings>({
    title: '',
    description: '',
    instructions: 'Please provide constructive feedback on your peer\'s work. Focus on strengths and areas for improvement.',
    review_type: 'anonymous',
    reviews_per_student: 2,
    start_date: '',
    end_date: '',
    auto_assign: true,
    allow_self_review: false,
    require_rating: true,
    rating_scale: 5
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user && params.id) {
      fetchAssignment()
    }
  }, [user, params.id])

  const fetchAssignment = async () => {
    try {
      const { data, error } = await supabase
        .from('assignments')
        .select(`
          id,
          title,
          description,
          class_id,
          due_date,
          classes!inner(name)
        `)
        .eq('id', params.id)
        .eq('teacher_id', user?.id)
        .single()

      if (error) throw error

      const assignmentData = {
        ...data,
        class_name: (data.classes as any)?.name || 'Unknown Class',
        total_students: 0 // Will be fetched separately if needed
      }

      setAssignment(assignmentData)
      
      // Set default title and dates
      setSettings(prev => ({
        ...prev,
        title: `Peer Review: ${data.title}`,
        start_date: new Date().toISOString().split('T')[0],
        end_date: data.due_date ? new Date(new Date(data.due_date).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : ''
      }))
    } catch (error) {
      console.error('Error fetching assignment:', error)
      router.push('/dashboard/teacher/assignments')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (status: 'draft' | 'active' = 'draft') => {
    if (!assignment || !user) return

    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('peer_review_assignments')
        .insert({
          title: settings.title,
          description: settings.description,
          assignment_id: assignment.id,
          teacher_id: user.id,
          class_id: assignment.class_id,
          review_type: settings.review_type,
          status: status,
          reviews_per_student: settings.reviews_per_student,
          start_date: settings.start_date ? new Date(settings.start_date).toISOString() : null,
          end_date: settings.end_date ? new Date(settings.end_date).toISOString() : null,
          instructions: settings.instructions,
          settings: {
            auto_assign: settings.auto_assign,
            allow_self_review: settings.allow_self_review,
            require_rating: settings.require_rating,
            rating_scale: settings.rating_scale
          }
        })
        .select()
        .single()

      if (error) throw error

      // If publishing, create peer review assignments
      if (status === 'active' && settings.auto_assign) {
        await createPeerReviewAssignments(data.id)
      }

      // Log activity
      await supabase
        .from('peer_review_activity')
        .insert({
          peer_review_assignment_id: data.id,
          user_id: user.id,
          activity_type: status === 'active' ? 'assignment_published' : 'assignment_created',
          details: { assignment_title: settings.title }
        })

      router.push('/dashboard/teacher/peer-reviews')
    } catch (error: any) {
      console.error('Error creating peer review:', error)
      alert('Failed to create peer review: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const createPeerReviewAssignments = async (peerReviewAssignmentId: string) => {
    try {
      // Get all students in the class
      const { data: enrollments, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('student_id')
        .eq('class_id', assignment?.class_id)
        .eq('status', 'active')

      if (enrollmentError) throw enrollmentError

      const studentIds = enrollments?.map(e => e.student_id) || []
      
      if (studentIds.length < 2) {
        throw new Error('Need at least 2 students to create peer reviews')
      }

      // Get submissions for this assignment
      const { data: submissions, error: submissionError } = await supabase
        .from('submissions')
        .select('id, student_id')
        .eq('assignment_id', assignment?.id)
        .in('student_id', studentIds)

      if (submissionError) throw submissionError

      const submissionMap = new Map(submissions?.map(s => [s.student_id, s.id]) || [])

      // Create peer review assignments
      const peerReviews = []
      
      for (const reviewerId of studentIds) {
        const availableReviewees = studentIds.filter(id => 
          id !== reviewerId || settings.allow_self_review
        )
        
        // Randomly assign reviewees
        const shuffled = [...availableReviewees].sort(() => Math.random() - 0.5)
        const assignedReviewees = shuffled.slice(0, settings.reviews_per_student)
        
        for (const revieweeId of assignedReviewees) {
          const submissionId = submissionMap.get(revieweeId)
          if (submissionId) {
            peerReviews.push({
              peer_review_assignment_id: peerReviewAssignmentId,
              reviewer_id: reviewerId,
              reviewee_id: revieweeId,
              submission_id: submissionId,
              status: 'pending'
            })
          }
        }
      }

      if (peerReviews.length > 0) {
        const { error: insertError } = await supabase
          .from('peer_reviews')
          .insert(peerReviews)

        if (insertError) throw insertError
      }
    } catch (error) {
      console.error('Error creating peer review assignments:', error)
      throw error
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-4">Assignment Not Found</h2>
            <p className="text-gray-600 mb-4">The assignment you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission to access it.</p>
            <Link href="/dashboard/teacher/assignments">
              <Button>Back to Assignments</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard/teacher/assignments">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Assignments
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Create Peer Review</h1>
              <p className="text-gray-600">Set up peer review for: {assignment.title}</p>
            </div>
          </div>
        </div>

        {/* Assignment Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Assignment Details</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-medium">Assignment</Label>
                <p className="text-sm text-gray-600">{assignment.title}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Class</Label>
                <p className="text-sm text-gray-600">{assignment.class_name}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Due Date</Label>
                <p className="text-sm text-gray-600">
                  {assignment.due_date ? new Date(assignment.due_date).toLocaleDateString() : 'No due date'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Peer Review Settings */}
        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Configure the basic settings for your peer review</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={settings.title}
                  onChange={(e) => setSettings(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter peer review title"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={settings.description}
                  onChange={(e) => setSettings(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what students should focus on during the review"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="instructions">Instructions for Students</Label>
                <Textarea
                  id="instructions"
                  value={settings.instructions}
                  onChange={(e) => setSettings(prev => ({ ...prev, instructions: e.target.value }))}
                  placeholder="Provide detailed instructions for students"
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          {/* Review Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Review Settings</CardTitle>
              <CardDescription>Configure how the peer review will work</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="review_type">Review Type</Label>
                  <Select
                    value={settings.review_type}
                    onValueChange={(value: 'anonymous' | 'named' | 'blind') => 
                      setSettings(prev => ({ ...prev, review_type: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anonymous">Anonymous - Reviewers are hidden</SelectItem>
                      <SelectItem value="named">Named - Reviewers are visible</SelectItem>
                      <SelectItem value="blind">Blind - Authors are hidden</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="reviews_per_student">Reviews per Student</Label>
                  <Select
                    value={settings.reviews_per_student.toString()}
                    onValueChange={(value) => 
                      setSettings(prev => ({ ...prev, reviews_per_student: parseInt(value) }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 review</SelectItem>
                      <SelectItem value="2">2 reviews</SelectItem>
                      <SelectItem value="3">3 reviews</SelectItem>
                      <SelectItem value="4">4 reviews</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={settings.start_date}
                    onChange={(e) => setSettings(prev => ({ ...prev, start_date: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="end_date">End Date</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={settings.end_date}
                    onChange={(e) => setSettings(prev => ({ ...prev, end_date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="auto_assign">Auto-assign Reviews</Label>
                    <p className="text-sm text-gray-600">Automatically assign students to review each other's work</p>
                  </div>
                  <Switch
                    id="auto_assign"
                    checked={settings.auto_assign}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, auto_assign: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="require_rating">Require Rating</Label>
                    <p className="text-sm text-gray-600">Students must provide a numerical rating</p>
                  </div>
                  <Switch
                    id="require_rating"
                    checked={settings.require_rating}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, require_rating: checked }))}
                  />
                </div>

                {settings.require_rating && (
                  <div>
                    <Label htmlFor="rating_scale">Rating Scale</Label>
                    <Select
                      value={settings.rating_scale.toString()}
                      onValueChange={(value) => 
                        setSettings(prev => ({ ...prev, rating_scale: parseInt(value) }))
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">1-3 scale</SelectItem>
                        <SelectItem value="5">1-5 scale</SelectItem>
                        <SelectItem value="10">1-10 scale</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end space-x-4">
            <Button
              variant="outline"
              onClick={() => handleSave('draft')}
              disabled={saving}
            >
              <Save className="h-4 w-4 mr-2" />
              Save as Draft
            </Button>
            <Button
              onClick={() => handleSave('active')}
              disabled={saving || !settings.title.trim()}
            >
              {saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              ) : (
                <Users className="h-4 w-4 mr-2" />
              )}
              Publish Peer Review
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}