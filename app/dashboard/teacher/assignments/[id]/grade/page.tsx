"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { FileText, Download, Save, Send, ChevronLeft, ChevronRight, Star, AlertCircle, Plus, Minus } from "lucide-react"

interface Submission {
  id: string
  studentName: string
  studentEmail: string
  submittedAt: string
  content: string
  attachments: string[]
  status: string
}

interface RubricCriterion {
  id: string
  name: string
  description: string
  weight: number
  levels: Array<{
    id: string
    name: string
    description: string
    points: number
    qualityIndicators?: string[]
  }>
}

export default function GradingPage() {
  const params = useParams()
  const assignmentId = params.id as string

  const [currentSubmissionIndex, setCurrentSubmissionIndex] = useState(0)
  const [activeTab, setActiveTab] = useState("rubric")
  const [gradeData, setGradeData] = useState({
    criteriaGrades: [] as any[],
    overallComments: "",
    strengths: [] as string[],
    improvements: [] as string[],
    status: "draft" as "draft" | "published",
  })
  const [newStrength, setNewStrength] = useState("")
  const [newImprovement, setNewImprovement] = useState("")

  // Real data from database
  const [assignment, setAssignment] = useState<any>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAssignmentAndSubmissions()
  }, [assignmentId])

  const loadAssignmentAndSubmissions = async () => {
    try {
      const supabase = createClient()
      
      // First check if assignments table exists
      const { data: testAssignments, error: testError } = await supabase
        .from('assignments')
        .select('count')
        .limit(1)

      if (testError) {
        console.error('Assignments table not accessible:', testError)
        setLoading(false)
        return
      }

      // Load assignment details with proper error handling
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('assignments')
        .select(`
          id, title, description, due_date, points, teacher_id, class_id, rubric
        `)
        .eq('id', assignmentId)
        .single()

      if (assignmentError) {
        console.error('Error loading assignment:', assignmentError)
        console.error('Assignment error details:', JSON.stringify(assignmentError, null, 2))
        setLoading(false)
        return
      }

      // Verify teacher access
      const { data: currentUser, error: userError } = await supabase.auth.getUser()
      if (userError || !currentUser.user) {
        console.error('Auth error:', userError)
        setLoading(false)
        return
      }
      
      if (assignmentData.teacher_id !== currentUser.user.id) {
        console.error('Access denied: Not the teacher for this assignment')
        console.error('Expected teacher ID:', assignmentData.teacher_id)
        console.error('Current user ID:', currentUser.user.id)
        setLoading(false)
        return
      }

      // Get class name
      const { data: classData } = await supabase
        .from('classes')
        .select('name')
        .eq('id', assignmentData.class_id)
        .single()

      setAssignment({
        id: assignmentData.id,
        title: assignmentData.title,
        description: assignmentData.description,
        dueDate: assignmentData.due_date,
        maxPoints: assignmentData.points || 100,
        className: classData?.name || 'Unknown Class',
        rubric: assignmentData.rubric || null
      })

      // Load submissions for this assignment
      const { data: submissionsData, error: submissionsError } = await supabase
        .from('submissions')
        .select(`
          id, student_id, content, file_url, link_url, 
          submitted_at, status, grade, feedback
        `)
        .eq('assignment_id', assignmentId)

      if (submissionsError) {
        console.error('Error loading submissions:', submissionsError)
        setSubmissions([])
        setLoading(false)
        return
      }

      // Get student names for submissions
      if (submissionsData && submissionsData.length > 0) {
        const studentIds = submissionsData.map(s => s.student_id)
        
        // Try user_profiles first, fallback to users table
        let studentsData = null
        const { data: profilesData, error: profilesError } = await supabase
          .from('user_profiles')
          .select('user_id, first_name, last_name, email')
          .in('user_id', studentIds)

        if (profilesError || !profilesData || profilesData.length === 0) {
          // Fallback to users table
          const { data: usersData } = await supabase
            .from('users')
            .select('id, first_name, last_name, email')
            .in('id', studentIds)
          
          studentsData = usersData?.map(u => ({
            user_id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email
          }))
        } else {
          studentsData = profilesData
        }

        const submissionsWithNames = submissionsData.map(submission => {
          const student = studentsData?.find(s => s.user_id === submission.student_id)
          return {
            id: submission.id,
            studentName: student 
              ? `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown Student'
              : 'Unknown Student',
            studentEmail: student?.email || 'unknown@email.com',
            submittedAt: new Date(submission.submitted_at).toLocaleString(),
            content: submission.content || 'No text content',
            attachments: submission.file_url ? [submission.file_url.split('/').pop() || 'file'] : [],
            status: submission.status || 'submitted',
            grade: submission.grade,
            feedback: submission.feedback
          }
        })

        setSubmissions(submissionsWithNames)
      } else {
        setSubmissions([])
      }

    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Use rubric from assignment or fallback to default
  const rubric = assignment?.rubric && assignment.rubric.criteria ? assignment.rubric : {
    id: "default_rubric",
    name: "Assignment Rubric",
    criteria: [
      {
        id: "crit_1",
        name: "Scientific Accuracy",
        description: "Correctness of observations and conclusions",
        weight: 35,
        levels: [
          {
            id: "level_1_1",
            name: "Excellent (31-35 pts)",
            description: "All observations and conclusions are scientifically accurate",
            points: 35,
            qualityIndicators: [
              "Accurate identification of cellular structures",
              "Correct use of scientific terminology",
              "Valid conclusions based on observations",
            ],
          },
          {
            id: "level_1_2",
            name: "Good (28-30 pts)",
            description: "Most observations and conclusions are accurate",
            points: 30,
            qualityIndicators: ["Mostly accurate observations", "Generally correct terminology"],
          },
          {
            id: "level_1_3",
            name: "Satisfactory (24-27 pts)",
            description: "Some accurate observations with minor errors",
            points: 27,
            qualityIndicators: ["Some accurate observations", "Basic terminology used"],
          },
          {
            id: "level_1_4",
            name: "Needs Improvement (0-23 pts)",
            description: "Many inaccurate observations and conclusions",
            points: 20,
            qualityIndicators: ["Inaccurate observations", "Incorrect terminology"],
          },
        ],
      },
      {
        id: "crit_2",
        name: "Data Analysis",
        description: "Quality of data interpretation and analysis",
        weight: 25,
        levels: [
          {
            id: "level_2_1",
            name: "Excellent (23-25 pts)",
            description: "Thorough and insightful data analysis",
            points: 25,
          },
          {
            id: "level_2_2",
            name: "Good (20-22 pts)",
            description: "Good data analysis with minor gaps",
            points: 22,
          },
          {
            id: "level_2_3",
            name: "Satisfactory (17-19 pts)",
            description: "Basic data analysis present",
            points: 19,
          },
          {
            id: "level_2_4",
            name: "Needs Improvement (0-16 pts)",
            description: "Poor or missing data analysis",
            points: 15,
          },
        ],
      },
      {
        id: "crit_3",
        name: "Organization & Presentation",
        description: "Structure, clarity, and professional presentation",
        weight: 25,
        levels: [
          {
            id: "level_3_1",
            name: "Excellent (23-25 pts)",
            description: "Exceptionally well organized and presented",
            points: 25,
          },
          {
            id: "level_3_2",
            name: "Good (20-22 pts)",
            description: "Well organized with clear structure",
            points: 22,
          },
          {
            id: "level_3_3",
            name: "Satisfactory (17-19 pts)",
            description: "Adequately organized",
            points: 19,
          },
          {
            id: "level_3_4",
            name: "Needs Improvement (0-16 pts)",
            description: "Poor organization and presentation",
            points: 15,
          },
        ],
      },
      {
        id: "crit_4",
        name: "Lab Procedures & Methods",
        description: "Documentation of procedures and methodology",
        weight: 15,
        levels: [
          {
            id: "level_4_1",
            name: "Excellent (14-15 pts)",
            description: "Complete and detailed procedure documentation",
            points: 15,
          },
          {
            id: "level_4_2",
            name: "Good (12-13 pts)",
            description: "Good procedure documentation",
            points: 13,
          },
          {
            id: "level_4_3",
            name: "Satisfactory (10-11 pts)",
            description: "Basic procedure documentation",
            points: 11,
          },
          {
            id: "level_4_4",
            name: "Needs Improvement (0-9 pts)",
            description: "Poor or missing procedure documentation",
            points: 8,
          },
        ],
      },
    ],
  }

  const currentSubmission = submissions[currentSubmissionIndex]

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg">Loading assignment and submissions...</div>
        </div>
      </div>
    )
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-red-600">Assignment not found</div>
        </div>
      </div>
    )
  }

  if (submissions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <header className="bg-white dark:bg-gray-800 border-b">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Grading: {assignment.title}</h1>
                <p className="text-gray-600 dark:text-gray-400">No submissions yet</p>
              </div>
            </div>
          </div>
        </header>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="text-lg text-gray-600">No submissions to grade yet</div>
            <p className="text-sm text-gray-500 mt-2">Students haven't submitted their work for this assignment.</p>
          </div>
        </div>
      </div>
    )
  }

  const calculateTotalGrade = () => {
    return gradeData.criteriaGrades.reduce((sum, grade) => sum + (grade.points || 0), 0)
  }

  const calculatePercentage = () => {
    const total = calculateTotalGrade()
    return Math.round((total / assignment.maxPoints) * 100)
  }

  const handleCriterionGrade = (criterionId: string, levelId: string, points: number) => {
    setGradeData((prev) => ({
      ...prev,
      criteriaGrades: [
        ...prev.criteriaGrades.filter((g) => g.criterionId !== criterionId),
        { criterionId, levelId, points, feedback: "" },
      ],
    }))
  }

  const handleCriterionFeedback = (criterionId: string, feedback: string) => {
    setGradeData((prev) => ({
      ...prev,
      criteriaGrades: prev.criteriaGrades.map((g) => (g.criterionId === criterionId ? { ...g, feedback } : g)),
    }))
  }

  const addStrength = () => {
    if (newStrength.trim()) {
      setGradeData((prev) => ({
        ...prev,
        strengths: [...prev.strengths, newStrength.trim()],
      }))
      setNewStrength("")
    }
  }

  const addImprovement = () => {
    if (newImprovement.trim()) {
      setGradeData((prev) => ({
        ...prev,
        improvements: [...prev.improvements, newImprovement.trim()],
      }))
      setNewImprovement("")
    }
  }

  const removeStrength = (index: number) => {
    setGradeData((prev) => ({
      ...prev,
      strengths: prev.strengths.filter((_, i) => i !== index),
    }))
  }

  const removeImprovement = (index: number) => {
    setGradeData((prev) => ({
      ...prev,
      improvements: prev.improvements.filter((_, i) => i !== index),
    }))
  }

  const saveGrade = async (publish = false) => {
    try {
      const supabase = createClient()
      
      const totalGrade = calculateTotalGrade()
      const feedbackText = [
        gradeData.overallComments,
        gradeData.strengths.length > 0 ? `Strengths: ${gradeData.strengths.join(', ')}` : '',
        gradeData.improvements.length > 0 ? `Areas for improvement: ${gradeData.improvements.join(', ')}` : ''
      ].filter(Boolean).join('\n\n')

      const { error } = await supabase
        .from('submissions')
        .update({
          grade: totalGrade,
          feedback: feedbackText,
          status: 'graded',
          graded_at: new Date().toISOString(),
        })
        .eq('id', currentSubmission.id)

      if (error) {
        console.error('Error saving grade:', error)
        alert('Error saving grade: ' + error.message)
        return
      }

      // Update local state
      setSubmissions(prev => prev.map(sub => 
        sub.id === currentSubmission.id 
          ? { ...sub, status: 'graded' }
          : sub
      ))

      alert(publish ? "Grade published successfully!" : "Grade saved successfully!")
      
    } catch (error) {
      console.error("Error saving grade:", error)
      alert("Error saving grade")
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Grading: {assignment.title}</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Submission {currentSubmissionIndex + 1} of {submissions.length}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                onClick={() => setCurrentSubmissionIndex(Math.max(0, currentSubmissionIndex - 1))}
                disabled={currentSubmissionIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              <Button
                variant="outline"
                onClick={() => setCurrentSubmissionIndex(Math.min(submissions.length - 1, currentSubmissionIndex + 1))}
                disabled={currentSubmissionIndex === submissions.length - 1}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Submission Content */}
        <div className="flex-1 p-6">
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Avatar>
                    <AvatarFallback>
                      {currentSubmission.studentName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle>{currentSubmission.studentName}</CardTitle>
                    <CardDescription>{currentSubmission.studentEmail}</CardDescription>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={currentSubmission.status === "graded" ? "default" : "secondary"}>
                    {currentSubmission.status}
                  </Badge>
                  <p className="text-sm text-gray-500 mt-1">Submitted: {currentSubmission.submittedAt}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Submission Content</h4>
                  <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                    <p className="text-sm">{currentSubmission.content}</p>
                  </div>
                </div>
                {currentSubmission.attachments.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Attachments</h4>
                    <div className="space-y-2">
                      {currentSubmission.attachments.map((attachment, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">{attachment}</span>
                          <Button variant="ghost" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Grading Panel */}
        <div className="w-96 bg-white dark:bg-gray-800 border-l p-6 overflow-y-auto">
          <div className="space-y-6">
            {/* Grade Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Grade Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">
                      {calculateTotalGrade()}/{assignment.maxPoints}
                    </div>
                    <div className="text-lg text-gray-600">{calculatePercentage()}%</div>
                    <Progress value={calculatePercentage()} className="mt-2" />
                  </div>
                  <div className="flex space-x-2">
                    <Button onClick={() => saveGrade(false)} variant="outline" className="flex-1">
                      <Save className="h-4 w-4 mr-2" />
                      Save Draft
                    </Button>
                    <Button onClick={() => saveGrade(true)} className="flex-1">
                      <Send className="h-4 w-4 mr-2" />
                      Publish
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="rubric">Rubric</TabsTrigger>
                <TabsTrigger value="feedback">Feedback</TabsTrigger>
              </TabsList>

              <TabsContent value="rubric" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{rubric.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {rubric.criteria.map((criterion) => (
                      <div key={criterion.id} className="space-y-3">
                        <div>
                          <h4 className="font-medium">{criterion.name}</h4>
                          <p className="text-sm text-gray-600">{criterion.description}</p>
                          <Badge variant="outline" className="mt-1">
                            {criterion.weight}% of grade
                          </Badge>
                        </div>

                        <div className="space-y-2">
                          {criterion.levels.map((level) => (
                            <div key={level.id} className="border rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="radio"
                                    name={`criterion_${criterion.id}`}
                                    value={level.id}
                                    onChange={() => handleCriterionGrade(criterion.id, level.id, level.points)}
                                    className="w-4 h-4"
                                  />
                                  <span className="font-medium text-sm">{level.name}</span>
                                </div>
                                <Badge variant="secondary">{level.points} pts</Badge>
                              </div>
                              <p className="text-xs text-gray-600 mb-2">{level.description}</p>
                              {level.qualityIndicators && (
                                <ul className="text-xs text-gray-500 space-y-1">
                                  {level.qualityIndicators.map((indicator, index) => (
                                    <li key={index} className="flex items-start space-x-1">
                                      <span>•</span>
                                      <span>{indicator}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>

                        <div>
                          <Label htmlFor={`feedback_${criterion.id}`} className="text-sm">
                            Specific Feedback (Optional)
                          </Label>
                          <Textarea
                            id={`feedback_${criterion.id}`}
                            placeholder="Add specific feedback for this criterion..."
                            className="mt-1"
                            rows={2}
                            onChange={(e) => handleCriterionFeedback(criterion.id, e.target.value)}
                          />
                        </div>

                        <Separator />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="feedback" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Overall Feedback</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="overallComments">General Comments</Label>
                      <Textarea
                        id="overallComments"
                        placeholder="Provide overall feedback on the submission..."
                        rows={4}
                        value={gradeData.overallComments}
                        onChange={(e) => setGradeData((prev) => ({ ...prev, overallComments: e.target.value }))}
                      />
                    </div>

                    <div>
                      <Label className="flex items-center space-x-2">
                        <Star className="h-4 w-4 text-yellow-500" />
                        <span>Strengths</span>
                      </Label>
                      <div className="space-y-2 mt-2">
                        {gradeData.strengths.map((strength, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <div className="flex-1 bg-green-50 dark:bg-green-900/20 p-2 rounded text-sm">
                              {strength}
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => removeStrength(index)}>
                              <Minus className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex space-x-2">
                          <Input
                            placeholder="Add a strength..."
                            value={newStrength}
                            onChange={(e) => setNewStrength(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && addStrength()}
                          />
                          <Button onClick={addStrength} size="sm">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="flex items-center space-x-2">
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        <span>Areas for Improvement</span>
                      </Label>
                      <div className="space-y-2 mt-2">
                        {gradeData.improvements.map((improvement, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <div className="flex-1 bg-orange-50 dark:bg-orange-900/20 p-2 rounded text-sm">
                              {improvement}
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => removeImprovement(index)}>
                              <Minus className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex space-x-2">
                          <Input
                            placeholder="Add an improvement area..."
                            value={newImprovement}
                            onChange={(e) => setNewImprovement(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && addImprovement()}
                          />
                          <Button onClick={addImprovement} size="sm">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}
