"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Save, Send, Clock, FileText, Star, Plus, Minus, AlertCircle, Download } from "lucide-react"

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

interface ReviewResponse {
  questionId: string
  type: string
  value: string | number | string[]
  comments?: string
}

export default function PeerReviewPage() {
  const params = useParams()
  const router = useRouter()
  const reviewId = params.id as string
  const pairId = params.pairId as string

  const [responses, setResponses] = useState<ReviewResponse[]>([])
  const [overallComments, setOverallComments] = useState("")
  const [strengths, setStrengths] = useState<string[]>([])
  const [improvements, setImprovements] = useState<string[]>([])
  const [newStrength, setNewStrength] = useState("")
  const [newImprovement, setNewImprovement] = useState("")
  const [timeSpent, setTimeSpent] = useState(0)
  const [startTime] = useState(Date.now())

  // Mock data - replace with API calls
  const reviewAssignment = {
    id: reviewId,
    title: "Essay Peer Review",
    description: "Review your classmate's essay and provide constructive feedback",
    reviewType: "anonymous",
    endDate: "2024-01-20",
    questions: [
      {
        id: "q1",
        type: "rating" as const,
        question: "How clear is the thesis statement?",
        description: "Rate the clarity and strength of the main argument",
        required: true,
        scale: { min: 1, max: 5, labels: { 1: "Very unclear", 3: "Somewhat clear", 5: "Very clear" } },
        weight: 20,
      },
      {
        id: "q2",
        type: "text" as const,
        question: "What is the strongest part of this essay?",
        description: "Identify specific strengths in the writing",
        required: true,
        weight: 25,
      },
      {
        id: "q3",
        type: "text" as const,
        question: "What could be improved?",
        description: "Provide specific, constructive suggestions",
        required: true,
        weight: 25,
      },
      {
        id: "q4",
        type: "checklist" as const,
        question: "Which elements are present in this essay?",
        required: true,
        options: [
          "Clear introduction",
          "Strong thesis statement",
          "Supporting evidence",
          "Logical organization",
          "Effective conclusion",
          "Proper citations",
        ],
        weight: 15,
      },
      {
        id: "q5",
        type: "rating" as const,
        question: "Overall quality of the essay",
        required: true,
        scale: { min: 1, max: 10 },
        weight: 15,
      },
    ] as ReviewQuestion[],
  }

  const submission = {
    id: "sub_1",
    authorName: reviewAssignment.reviewType === "blind" ? "Anonymous Author" : "John Doe",
    title: "The Impact of Climate Change on Marine Ecosystems",
    content: `Climate change represents one of the most pressing challenges of our time, with far-reaching consequences for marine ecosystems worldwide. This essay examines the multifaceted impacts of rising global temperatures on ocean environments and the species that inhabit them.

The primary driver of marine ecosystem disruption is ocean warming. As global temperatures rise, ocean temperatures follow suit, leading to thermal stress in marine organisms. Coral reefs, often called the "rainforests of the sea," are particularly vulnerable to temperature increases. When water temperatures rise even slightly above normal ranges, corals expel the symbiotic algae living in their tissues, causing coral bleaching events that can lead to widespread coral death.

Ocean acidification, another consequence of increased atmospheric CO2, poses additional threats to marine life. As oceans absorb more carbon dioxide from the atmosphere, seawater becomes more acidic, making it difficult for shell-forming organisms like mollusks, crustaceans, and some plankton species to build and maintain their calcium carbonate structures.

Rising sea levels, caused by thermal expansion of seawater and melting ice sheets, threaten coastal marine habitats including salt marshes, mangrove forests, and shallow coral reefs. These ecosystems serve as crucial nursery areas for many marine species and provide important coastal protection services.

The evidence clearly demonstrates that climate change poses unprecedented challenges to marine ecosystems. Immediate action is required to reduce greenhouse gas emissions and implement adaptive management strategies to protect these vital ocean environments for future generations.`,
    attachments: ["essay_draft.pdf", "references.docx"],
    submittedAt: "2024-01-14 14:30",
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeSpent(Math.floor((Date.now() - startTime) / 1000 / 60))
    }, 60000)

    return () => clearInterval(interval)
  }, [startTime])

  const updateResponse = (questionId: string, value: string | number | string[], comments?: string) => {
    const question = reviewAssignment.questions.find((q) => q.id === questionId)
    if (!question) return

    setResponses((prev) => {
      const existing = prev.find((r) => r.questionId === questionId)
      if (existing) {
        return prev.map((r) => (r.questionId === questionId ? { ...r, value, comments } : r))
      } else {
        return [...prev, { questionId, type: question.type, value, comments }]
      }
    })
  }

  const addStrength = () => {
    if (newStrength.trim()) {
      setStrengths([...strengths, newStrength.trim()])
      setNewStrength("")
    }
  }

  const addImprovement = () => {
    if (newImprovement.trim()) {
      setImprovements([...improvements, newImprovement.trim()])
      setNewImprovement("")
    }
  }

  const removeStrength = (index: number) => {
    setStrengths(strengths.filter((_, i) => i !== index))
  }

  const removeImprovement = (index: number) => {
    setImprovements(improvements.filter((_, i) => i !== index))
  }

  const getCompletionPercentage = () => {
    const requiredQuestions = reviewAssignment.questions.filter((q) => q.required)
    const completedRequired = requiredQuestions.filter((q) =>
      responses.some((r) => r.questionId === q.id && r.value !== ""),
    )
    return Math.round((completedRequired.length / requiredQuestions.length) * 100)
  }

  const canSubmit = () => {
    const requiredQuestions = reviewAssignment.questions.filter((q) => q.required)
    return requiredQuestions.every((q) => responses.some((r) => r.questionId === q.id && r.value !== ""))
  }

  const saveReview = async (submit = false) => {
    const reviewData = {
      pairId,
      responses,
      overallComments,
      strengths,
      improvements,
      timeSpent,
      status: submit ? "submitted" : "draft",
    }

    try {
      const response = await fetch(`/api/peer-reviews/${reviewId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reviewData),
      })

      if (response.ok) {
        if (submit) {
          alert("Review submitted successfully!")
          router.push("/dashboard/student/peer-reviews")
        } else {
          alert("Review saved as draft!")
        }
      }
    } catch (error) {
      console.error("Error saving review:", error)
      alert("Error saving review")
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{reviewAssignment.title}</h1>
              <p className="text-gray-600 dark:text-gray-400">Reviewing: {submission.title}</p>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant="outline">
                <Clock className="h-3 w-3 mr-1" />
                {timeSpent} min
              </Badge>
              <Badge variant="outline">Due: {reviewAssignment.endDate}</Badge>
              <Progress value={getCompletionPercentage()} className="w-24" />
              <span className="text-sm text-gray-600">{getCompletionPercentage()}%</span>
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
                    <AvatarFallback>{reviewAssignment.reviewType === "blind" ? "?" : "JD"}</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle>{submission.title}</CardTitle>
                    <CardDescription>
                      By: {submission.authorName} • Submitted: {submission.submittedAt}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="secondary">
                  <FileText className="h-3 w-3 mr-1" />
                  Essay
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-3">Essay Content</h4>
                  <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg prose prose-sm max-w-none">
                    {submission.content.split("\n\n").map((paragraph, index) => (
                      <p key={index} className="mb-4 leading-relaxed">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>

                {submission.attachments.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Attachments</h4>
                    <div className="space-y-2">
                      {submission.attachments.map((attachment, index) => (
                        <div key={index} className="flex items-center space-x-2 p-2 border rounded">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm flex-1">{attachment}</span>
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

        {/* Review Panel */}
        <div className="w-96 bg-white dark:bg-gray-800 border-l p-6 overflow-y-auto">
          <div className="space-y-6">
            {/* Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Review Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Completion</span>
                    <span className="text-sm font-medium">{getCompletionPercentage()}%</span>
                  </div>
                  <Progress value={getCompletionPercentage()} />
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>Time spent: {timeSpent} minutes</span>
                    <span>
                      {responses.filter((r) => r.value !== "").length} / {reviewAssignment.questions.length} answered
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Review Questions */}
            <div className="space-y-4">
              <h3 className="font-semibold">Review Questions</h3>

              {reviewAssignment.questions.map((question, index) => (
                <Card key={question.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-sm">
                          {index + 1}. {question.question}
                          {question.required && <span className="text-red-500 ml-1">*</span>}
                        </CardTitle>
                        {question.description && (
                          <CardDescription className="mt-1">{question.description}</CardDescription>
                        )}
                      </div>
                      <Badge variant="outline" className="ml-2">
                        {question.weight}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {question.type === "rating" && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {Array.from(
                            { length: (question.scale?.max || 5) - (question.scale?.min || 1) + 1 },
                            (_, i) => {
                              const value = (question.scale?.min || 1) + i
                              const isSelected = responses.find((r) => r.questionId === question.id)?.value === value
                              return (
                                <Button
                                  key={i}
                                  variant={isSelected ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => updateResponse(question.id, value)}
                                  className="min-w-[40px]"
                                >
                                  {value}
                                </Button>
                              )
                            },
                          )}
                        </div>
                        {question.scale?.labels && (
                          <div className="text-xs text-gray-500 space-y-1">
                            {Object.entries(question.scale.labels).map(([key, label]) => (
                              <div key={key} className="flex justify-between">
                                <span>{key}:</span>
                                <span>{label}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {question.type === "text" && (
                      <Textarea
                        placeholder="Enter your response..."
                        value={(responses.find((r) => r.questionId === question.id)?.value as string) || ""}
                        onChange={(e) => updateResponse(question.id, e.target.value)}
                        rows={4}
                      />
                    )}

                    {question.type === "checklist" && (
                      <div className="space-y-2">
                        {question.options?.map((option, optionIndex) => {
                          const currentValues =
                            (responses.find((r) => r.questionId === question.id)?.value as string[]) || []
                          const isChecked = currentValues.includes(option)

                          return (
                            <div key={optionIndex} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`${question.id}_${optionIndex}`}
                                checked={isChecked}
                                onChange={(e) => {
                                  const newValues = e.target.checked
                                    ? [...currentValues, option]
                                    : currentValues.filter((v) => v !== option)
                                  updateResponse(question.id, newValues)
                                }}
                                className="rounded"
                              />
                              <Label htmlFor={`${question.id}_${optionIndex}`} className="text-sm cursor-pointer">
                                {option}
                              </Label>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Additional Feedback */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Additional Feedback</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="overallComments">Overall Comments</Label>
                  <Textarea
                    id="overallComments"
                    placeholder="Provide overall feedback on the submission..."
                    value={overallComments}
                    onChange={(e) => setOverallComments(e.target.value)}
                    rows={3}
                  />
                </div>

                <div>
                  <Label className="flex items-center space-x-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <span>Strengths</span>
                  </Label>
                  <div className="space-y-2 mt-2">
                    {strengths.map((strength, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <div className="flex-1 bg-green-50 dark:bg-green-900/20 p-2 rounded text-sm">{strength}</div>
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
                    {improvements.map((improvement, index) => (
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

            {/* Action Buttons */}
            <div className="space-y-2">
              <Button onClick={() => saveReview(false)} variant="outline" className="w-full">
                <Save className="h-4 w-4 mr-2" />
                Save Draft
              </Button>
              <Button onClick={() => saveReview(true)} className="w-full" disabled={!canSubmit()}>
                <Send className="h-4 w-4 mr-2" />
                Submit Review
              </Button>
              {!canSubmit() && (
                <p className="text-xs text-red-600 text-center">
                  Please answer all required questions before submitting
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
