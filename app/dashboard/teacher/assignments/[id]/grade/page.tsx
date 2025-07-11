"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
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

  // Mock data - replace with API calls
  const assignment = {
    id: assignmentId,
    title: "Cell Structure Lab Report",
    description: "Complete analysis of cellular structures observed under microscope",
    dueDate: "2024-01-15",
    maxPoints: 100,
  }

  const submissions: Submission[] = [
    {
      id: "sub_1",
      studentName: "John Obi",
      studentEmail: "john.obi@student.edu",
      submittedAt: "2024-01-14 14:30",
      content: "Lab Report Content Here...",
      attachments: ["lab_report.pdf", "microscope_images.zip"],
      status: "submitted",
    },
    {
      id: "sub_2",
      studentName: "Adaeze Nwoko",
      studentEmail: "adaeze.nwoko@student.edu",
      submittedAt: "2024-01-14 16:45",
      content: "Detailed analysis of cellular structures...",
      attachments: ["report.docx"],
      status: "submitted",
    },
    {
      id: "sub_3",
      studentName: "Musa Lawal",
      studentEmail: "musa.lawal@student.edu",
      submittedAt: "2024-01-15 09:15",
      content: "Comprehensive lab report with observations...",
      attachments: ["final_report.pdf", "data_analysis.xlsx"],
      status: "graded",
    },
  ]

  const rubric = {
    id: "rubric_1",
    name: "Lab Report Rubric",
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
    const gradePayload = {
      submissionId: currentSubmission.id,
      assignmentId: assignment.id,
      studentId: currentSubmission.id, // In real app, get actual student ID
      rubricId: rubric.id,
      criteriaGrades: gradeData.criteriaGrades,
      feedback: {
        overallComments: gradeData.overallComments,
        strengths: gradeData.strengths,
        improvements: gradeData.improvements,
        annotations: [],
      },
      status: publish ? "published" : "draft",
    }

    try {
      const response = await fetch("/api/grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gradePayload),
      })

      if (response.ok) {
        alert(publish ? "Grade published successfully!" : "Grade saved as draft!")
      }
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
