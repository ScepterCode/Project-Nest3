"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus,
  Minus,
  Save,
  Eye,
  Users,
  Clock,
  Settings,
  Star,
  MessageSquare,
  CheckSquare,
  BarChart3,
} from "lucide-react"

interface ReviewQuestion {
  id: string
  type: "rating" | "text" | "multiple_choice" | "checklist"
  question: string
  description?: string
  required: boolean
  options?: string[]
  scale?: { min: number; max: number; labels?: { [key: number]: string } }
  weight: number
}

export default function CreatePeerReviewPage() {
  const params = useParams()
  const router = useRouter()
  const assignmentId = params.id as string

  const [reviewData, setReviewData] = useState({
    title: "",
    description: "",
    reviewType: "anonymous" as "anonymous" | "named" | "blind",
    reviewMethod: "random" as "random" | "manual" | "self-select",
    reviewsPerStudent: 2,
    reviewsPerSubmission: 3,
    endDate: "",
  })

  const [settings, setSettings] = useState({
    allowSelfReview: false,
    requireAllReviews: true,
    showReviewerNames: false,
    enableReviewOfReviews: true,
    deadlineOffset: 3,
  })

  const [questions, setQuestions] = useState<ReviewQuestion[]>([])
  const [activeTab, setActiveTab] = useState("setup")

  // Mock assignment data
  const assignment = {
    id: assignmentId,
    title: "Cell Structure Lab Report",
    description: "Complete analysis of cellular structures",
    dueDate: "2024-01-15",
    submissions: 25,
  }

  const addQuestion = (type: ReviewQuestion["type"]) => {
    const newQuestion: ReviewQuestion = {
      id: `q_${Date.now()}`,
      type,
      question: "",
      description: "",
      required: true,
      weight: 10,
      ...(type === "rating" && { scale: { min: 1, max: 5 } }),
      ...(type === "multiple_choice" && { options: [""] }),
      ...(type === "checklist" && { options: [""] }),
    }
    setQuestions([...questions, newQuestion])
  }

  const updateQuestion = (id: string, updates: Partial<ReviewQuestion>) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, ...updates } : q)))
  }

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id))
  }

  const addOption = (questionId: string) => {
    const question = questions.find((q) => q.id === questionId)
    if (question && question.options) {
      updateQuestion(questionId, { options: [...question.options, ""] })
    }
  }

  const updateOption = (questionId: string, optionIndex: number, value: string) => {
    const question = questions.find((q) => q.id === questionId)
    if (question && question.options) {
      const newOptions = [...question.options]
      newOptions[optionIndex] = value
      updateQuestion(questionId, { options: newOptions })
    }
  }

  const removeOption = (questionId: string, optionIndex: number) => {
    const question = questions.find((q) => q.id === questionId)
    if (question && question.options) {
      const newOptions = question.options.filter((_, i) => i !== optionIndex)
      updateQuestion(questionId, { options: newOptions })
    }
  }

  const loadTemplate = (templateName: string) => {
    if (templateName === "essay") {
      setQuestions([
        {
          id: "q1",
          type: "rating",
          question: "How clear is the thesis statement?",
          description: "Rate the clarity and strength of the main argument",
          required: true,
          scale: { min: 1, max: 5, labels: { 1: "Very unclear", 3: "Somewhat clear", 5: "Very clear" } },
          weight: 20,
        },
        {
          id: "q2",
          type: "text",
          question: "What is the strongest part of this work?",
          description: "Identify specific strengths",
          required: true,
          weight: 25,
        },
        {
          id: "q3",
          type: "text",
          question: "What could be improved?",
          description: "Provide specific, constructive suggestions",
          required: true,
          weight: 25,
        },
        {
          id: "q4",
          type: "rating",
          question: "Overall quality",
          required: true,
          scale: { min: 1, max: 10 },
          weight: 30,
        },
      ])
    } else if (templateName === "presentation") {
      setQuestions([
        {
          id: "q1",
          type: "rating",
          question: "How clear was the presentation?",
          required: true,
          scale: { min: 1, max: 5 },
          weight: 25,
        },
        {
          id: "q2",
          type: "checklist",
          question: "Which elements were present?",
          required: true,
          options: ["Clear introduction", "Well-organized content", "Good visual aids", "Strong conclusion"],
          weight: 30,
        },
        {
          id: "q3",
          type: "text",
          question: "What was most effective?",
          required: true,
          weight: 22.5,
        },
        {
          id: "q4",
          type: "text",
          question: "Suggestions for improvement",
          required: true,
          weight: 22.5,
        },
      ])
    }
  }

  const savePeerReview = async () => {
    const payload = {
      ...reviewData,
      assignmentId,
      classId: "class_1", // In real app, get from assignment
      customQuestions: questions,
      settings,
    }

    try {
      const response = await fetch("/api/peer-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        alert("Peer review assignment created successfully!")
        router.push(`/dashboard/teacher/assignments/${assignmentId}`)
      }
    } catch (error) {
      console.error("Error creating peer review:", error)
      alert("Error creating peer review")
    }
  }

  const getTotalWeight = () => {
    return questions.reduce((sum, q) => sum + q.weight, 0)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Create Peer Review</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Set up peer review for: <span className="font-medium">{assignment.title}</span>
            </p>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline">
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button onClick={savePeerReview}>
              <Save className="h-4 w-4 mr-2" />
              Create Peer Review
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="questions">Review Questions</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Basic Information */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                    <CardDescription>Configure the peer review assignment details</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="title">Review Title</Label>
                      <Input
                        id="title"
                        placeholder="e.g., Essay Peer Review"
                        value={reviewData.title}
                        onChange={(e) => setReviewData({ ...reviewData, title: e.target.value })}
                      />
                    </div>

                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Explain what students should focus on when reviewing..."
                        value={reviewData.description}
                        onChange={(e) => setReviewData({ ...reviewData, description: e.target.value })}
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Review Type</Label>
                        <Select
                          value={reviewData.reviewType}
                          onValueChange={(value: any) => setReviewData({ ...reviewData, reviewType: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="anonymous">Anonymous</SelectItem>
                            <SelectItem value="named">Named</SelectItem>
                            <SelectItem value="blind">Blind Review</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500 mt-1">
                          {reviewData.reviewType === "anonymous" && "Reviewers' identities are hidden"}
                          {reviewData.reviewType === "named" && "Reviewers' names are visible"}
                          {reviewData.reviewType === "blind" && "Author names are hidden from reviewers"}
                        </p>
                      </div>

                      <div>
                        <Label>Assignment Method</Label>
                        <Select
                          value={reviewData.reviewMethod}
                          onValueChange={(value: any) => setReviewData({ ...reviewData, reviewMethod: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="random">Random Assignment</SelectItem>
                            <SelectItem value="manual">Manual Assignment</SelectItem>
                            <SelectItem value="self-select">Student Self-Select</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="reviewsPerStudent">Reviews per Student</Label>
                        <Input
                          id="reviewsPerStudent"
                          type="number"
                          min="1"
                          max="10"
                          value={reviewData.reviewsPerStudent}
                          onChange={(e) =>
                            setReviewData({ ...reviewData, reviewsPerStudent: Number.parseInt(e.target.value) || 1 })
                          }
                        />
                        <p className="text-xs text-gray-500 mt-1">How many reviews each student must complete</p>
                      </div>

                      <div>
                        <Label htmlFor="reviewsPerSubmission">Reviews per Submission</Label>
                        <Input
                          id="reviewsPerSubmission"
                          type="number"
                          min="1"
                          max="10"
                          value={reviewData.reviewsPerSubmission}
                          onChange={(e) =>
                            setReviewData({ ...reviewData, reviewsPerSubmission: Number.parseInt(e.target.value) || 1 })
                          }
                        />
                        <p className="text-xs text-gray-500 mt-1">How many reviews each submission will receive</p>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="endDate">Review Deadline</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={reviewData.endDate}
                        onChange={(e) => setReviewData({ ...reviewData, endDate: e.target.value })}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Templates */}
              <div>
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Templates</CardTitle>
                    <CardDescription>Start with a pre-built template</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      variant="outline"
                      className="w-full justify-start bg-transparent"
                      onClick={() => loadTemplate("essay")}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Essay Review
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start bg-transparent"
                      onClick={() => loadTemplate("presentation")}
                    >
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Presentation Review
                    </Button>
                    <Button variant="outline" className="w-full justify-start bg-transparent">
                      <CheckSquare className="h-4 w-4 mr-2" />
                      Lab Report Review
                    </Button>
                  </CardContent>
                </Card>

                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle>Assignment Info</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Original Due Date:</span>
                      <span>{assignment.dueDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Submissions:</span>
                      <Badge variant="outline">{assignment.submissions}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Reviews:</span>
                      <Badge variant="outline">{assignment.submissions * reviewData.reviewsPerSubmission}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="questions" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Review Questions</h2>
                <p className="text-gray-600">Create questions to guide student reviews</p>
              </div>
              <div className="flex space-x-2">
                <Button variant="outline" onClick={() => addQuestion("rating")}>
                  <Star className="h-4 w-4 mr-2" />
                  Rating
                </Button>
                <Button variant="outline" onClick={() => addQuestion("text")}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Text
                </Button>
                <Button variant="outline" onClick={() => addQuestion("checklist")}>
                  <CheckSquare className="h-4 w-4 mr-2" />
                  Checklist
                </Button>
              </div>
            </div>

            {questions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No questions yet</h3>
                  <p className="text-gray-600 mb-4">Add questions to guide student peer reviews</p>
                  <div className="flex justify-center space-x-2">
                    <Button onClick={() => addQuestion("rating")}>Add Rating Question</Button>
                    <Button variant="outline" onClick={() => addQuestion("text")}>
                      Add Text Question
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {questions.map((question, index) => (
                  <Card key={question.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">
                            {question.type === "rating" && <Star className="h-3 w-3 mr-1" />}
                            {question.type === "text" && <MessageSquare className="h-3 w-3 mr-1" />}
                            {question.type === "checklist" && <CheckSquare className="h-3 w-3 mr-1" />}
                            {question.type}
                          </Badge>
                          <span className="text-sm text-gray-500">Question {index + 1}</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removeQuestion(question.id)}>
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                          <Label>Question</Label>
                          <Input
                            placeholder="Enter your question..."
                            value={question.question}
                            onChange={(e) => updateQuestion(question.id, { question: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Weight (%)</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={question.weight}
                            onChange={(e) =>
                              updateQuestion(question.id, { weight: Number.parseInt(e.target.value) || 0 })
                            }
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Description (Optional)</Label>
                        <Textarea
                          placeholder="Provide additional context or instructions..."
                          value={question.description}
                          onChange={(e) => updateQuestion(question.id, { description: e.target.value })}
                          rows={2}
                        />
                      </div>

                      {question.type === "rating" && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Scale</Label>
                            <div className="flex space-x-2">
                              <Input
                                type="number"
                                placeholder="Min"
                                value={question.scale?.min || 1}
                                onChange={(e) =>
                                  updateQuestion(question.id, {
                                    scale: { ...question.scale, min: Number.parseInt(e.target.value) || 1 },
                                  })
                                }
                              />
                              <Input
                                type="number"
                                placeholder="Max"
                                value={question.scale?.max || 5}
                                onChange={(e) =>
                                  updateQuestion(question.id, {
                                    scale: { ...question.scale, max: Number.parseInt(e.target.value) || 5 },
                                  })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {(question.type === "multiple_choice" || question.type === "checklist") && (
                        <div>
                          <Label>Options</Label>
                          <div className="space-y-2">
                            {question.options?.map((option, optionIndex) => (
                              <div key={optionIndex} className="flex space-x-2">
                                <Input
                                  placeholder={`Option ${optionIndex + 1}`}
                                  value={option}
                                  onChange={(e) => updateOption(question.id, optionIndex, e.target.value)}
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeOption(question.id, optionIndex)}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            <Button variant="outline" size="sm" onClick={() => addOption(question.id)}>
                              <Plus className="h-4 w-4 mr-2" />
                              Add Option
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center space-x-2">
                        <Switch
                          id={`required_${question.id}`}
                          checked={question.required}
                          onCheckedChange={(checked) => updateQuestion(question.id, { required: checked })}
                        />
                        <Label htmlFor={`required_${question.id}`}>Required question</Label>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Total Weight:</span>
                      <Badge variant={getTotalWeight() === 100 ? "default" : "destructive"}>{getTotalWeight()}%</Badge>
                    </div>
                    {getTotalWeight() !== 100 && (
                      <p className="text-sm text-orange-600 mt-1">Weights should total 100% for balanced scoring</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Settings className="h-5 w-5" />
                    <span>Review Settings</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Allow Self-Review</Label>
                      <p className="text-sm text-gray-600">Students can review their own submissions</p>
                    </div>
                    <Switch
                      checked={settings.allowSelfReview}
                      onCheckedChange={(checked) => setSettings({ ...settings, allowSelfReview: checked })}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Require All Reviews</Label>
                      <p className="text-sm text-gray-600">Students must complete all reviews to see their feedback</p>
                    </div>
                    <Switch
                      checked={settings.requireAllReviews}
                      onCheckedChange={(checked) => setSettings({ ...settings, requireAllReviews: checked })}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Show Reviewer Names</Label>
                      <p className="text-sm text-gray-600">Display reviewer identities to authors</p>
                    </div>
                    <Switch
                      checked={settings.showReviewerNames}
                      onCheckedChange={(checked) => setSettings({ ...settings, showReviewerNames: checked })}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Enable Review Quality Rating</Label>
                      <p className="text-sm text-gray-600">Students can rate the helpfulness of reviews</p>
                    </div>
                    <Switch
                      checked={settings.enableReviewOfReviews}
                      onCheckedChange={(checked) => setSettings({ ...settings, enableReviewOfReviews: checked })}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Clock className="h-5 w-5" />
                    <span>Timing & Deadlines</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Deadline Offset (Days)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="30"
                      value={settings.deadlineOffset}
                      onChange={(e) =>
                        setSettings({ ...settings, deadlineOffset: Number.parseInt(e.target.value) || 3 })
                      }
                    />
                    <p className="text-sm text-gray-600 mt-1">
                      Days after assignment deadline when peer reviews are due
                    </p>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <h4 className="font-medium mb-2">Timeline Preview</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Assignment Due:</span>
                        <span>{assignment.dueDate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Reviews Start:</span>
                        <span>{assignment.dueDate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Reviews Due:</span>
                        <span>{reviewData.endDate || "Not set"}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Peer Review Preview</CardTitle>
                <CardDescription>How students will see the review assignment</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold">{reviewData.title || "Untitled Review"}</h3>
                    <p className="text-gray-600">{reviewData.description}</p>
                    <div className="flex items-center space-x-4 mt-2">
                      <Badge variant="outline">
                        <Users className="h-3 w-3 mr-1" />
                        {reviewData.reviewType}
                      </Badge>
                      <Badge variant="outline">
                        <Clock className="h-3 w-3 mr-1" />
                        Due: {reviewData.endDate}
                      </Badge>
                      <Badge variant="outline">{reviewData.reviewsPerStudent} reviews required</Badge>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-medium">Review Questions</h4>
                    {questions.map((question, index) => (
                      <div key={question.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">
                            {index + 1}. {question.question}
                          </span>
                          <Badge variant="outline">{question.weight}%</Badge>
                        </div>
                        {question.description && <p className="text-sm text-gray-600 mb-3">{question.description}</p>}

                        {question.type === "rating" && (
                          <div className="flex space-x-2">
                            {Array.from(
                              { length: (question.scale?.max || 5) - (question.scale?.min || 1) + 1 },
                              (_, i) => (
                                <Button key={i} variant="outline" size="sm" disabled>
                                  {(question.scale?.min || 1) + i}
                                </Button>
                              ),
                            )}
                          </div>
                        )}

                        {question.type === "text" && (
                          <Textarea placeholder="Student would type their response here..." disabled rows={3} />
                        )}

                        {question.type === "checklist" && (
                          <div className="space-y-2">
                            {question.options?.map((option, optionIndex) => (
                              <div key={optionIndex} className="flex items-center space-x-2">
                                <input type="checkbox" disabled />
                                <span className="text-sm">{option}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
