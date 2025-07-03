"use client"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Download, Star, AlertCircle, TrendingUp, Award, MessageSquare, Calendar, FileText } from "lucide-react"

export default function StudentGradeDetailPage() {
  const params = useParams()
  const assignmentId = params.assignmentId as string

  // Mock data - replace with API calls
  const assignment = {
    id: assignmentId,
    title: "Cell Structure Lab Report",
    description: "Complete analysis of cellular structures observed under microscope",
    dueDate: "2024-01-15",
    submittedAt: "2024-01-14 14:30",
    maxPoints: 100,
  }

  const grade = {
    id: "grade_1",
    totalPoints: 82,
    maxPoints: 100,
    percentage: 82,
    letterGrade: "B+",
    status: "published",
    gradedAt: "2024-01-16 10:30",
    feedback: {
      overallComments:
        "Good work overall! Your observations were accurate and well-documented. The analysis shows a solid understanding of cellular structures. To improve further, focus on providing more detailed explanations of the biological processes you observed and strengthen your conclusions with additional supporting evidence.",
      strengths: [
        "Accurate identification of cellular structures",
        "Clear and organized presentation",
        "Good use of scientific terminology",
        "Detailed microscope observations",
        "Professional lab report format",
      ],
      improvements: [
        "Develop more detailed analysis of biological processes",
        "Strengthen conclusions with additional evidence",
        "Include more comparative analysis between cell types",
        "Expand discussion of experimental limitations",
      ],
    },
    criteriaGrades: [
      {
        criterionName: "Scientific Accuracy",
        description: "Correctness of observations and conclusions",
        weight: 35,
        maxPoints: 35,
        earnedPoints: 30,
        levelName: "Good (28-30 pts)",
        levelDescription: "Most observations and conclusions are accurate",
        feedback:
          "Your observations were mostly accurate with good attention to detail. Minor improvements needed in some conclusions.",
      },
      {
        criterionName: "Data Analysis",
        description: "Quality of data interpretation and analysis",
        weight: 25,
        maxPoints: 25,
        earnedPoints: 22,
        levelName: "Good (20-22 pts)",
        levelDescription: "Good data analysis with minor gaps",
        feedback: "Strong analytical skills demonstrated. Consider expanding your interpretation of the data patterns.",
      },
      {
        criterionName: "Organization & Presentation",
        description: "Structure, clarity, and professional presentation",
        weight: 25,
        maxPoints: 25,
        earnedPoints: 25,
        levelName: "Excellent (23-25 pts)",
        levelDescription: "Exceptionally well organized and presented",
        feedback: "Excellent organization and professional presentation throughout the report.",
      },
      {
        criterionName: "Lab Procedures & Methods",
        description: "Documentation of procedures and methodology",
        weight: 15,
        maxPoints: 15,
        earnedPoints: 13,
        levelName: "Good (12-13 pts)",
        levelDescription: "Good procedure documentation",
        feedback:
          "Good documentation of methods. Include more detail about equipment settings and observation conditions.",
      },
    ],
  }

  const classAverage = {
    percentage: 78,
    letterGrade: "B-",
  }

  const getGradeColor = (percentage: number) => {
    if (percentage >= 90) return "text-green-600"
    if (percentage >= 80) return "text-blue-600"
    if (percentage >= 70) return "text-yellow-600"
    if (percentage >= 60) return "text-orange-600"
    return "text-red-600"
  }

  const getPerformanceMessage = (percentage: number, average: number) => {
    const diff = percentage - average
    if (diff > 10) return "Excellent work! You performed significantly above the class average."
    if (diff > 5) return "Great job! You performed above the class average."
    if (diff > -5) return "Good work! You performed around the class average."
    if (diff > -10) return "You performed slightly below the class average. Keep working!"
    return "You performed below the class average. Consider seeking additional help."
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{assignment.title}</h1>
              <p className="text-gray-600 dark:text-gray-400">Grade Details</p>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline">
                <Calendar className="h-3 w-3 mr-1" />
                Graded: {grade.gradedAt}
              </Badge>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download Report
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Grade Summary */}
          <div className="lg:col-span-1">
            <div className="space-y-6">
              {/* Overall Grade */}
              <Card>
                <CardHeader className="text-center">
                  <CardTitle>Your Grade</CardTitle>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                  <div>
                    <div className={`text-4xl font-bold ${getGradeColor(grade.percentage)}`}>{grade.letterGrade}</div>
                    <div className="text-2xl text-gray-600">
                      {grade.totalPoints}/{grade.maxPoints}
                    </div>
                    <div className="text-lg text-gray-500">{grade.percentage}%</div>
                  </div>
                  <Progress value={grade.percentage} className="h-3" />
                  <Badge variant={grade.percentage >= 80 ? "default" : "secondary"} className="text-sm">
                    {grade.status === "published" ? "Final Grade" : "Draft Grade"}
                  </Badge>
                </CardContent>
              </Card>

              {/* Class Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5" />
                    <span>Class Performance</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Your Score:</span>
                    <Badge variant="outline">{grade.percentage}%</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Class Average:</span>
                    <Badge variant="outline">{classAverage.percentage}%</Badge>
                  </div>
                  <Separator />
                  <div className="text-sm text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    {getPerformanceMessage(grade.percentage, classAverage.percentage)}
                  </div>
                </CardContent>
              </Card>

              {/* Assignment Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <FileText className="h-5 w-5" />
                    <span>Assignment Details</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Due Date:</span>
                    <span>{assignment.dueDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Submitted:</span>
                    <span>{assignment.submittedAt}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Max Points:</span>
                    <span>{assignment.maxPoints}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <Badge variant="default">Graded</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Detailed Feedback */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="rubric" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="rubric">Rubric Breakdown</TabsTrigger>
                <TabsTrigger value="feedback">Detailed Feedback</TabsTrigger>
                <TabsTrigger value="improvement">Improvement Plan</TabsTrigger>
              </TabsList>

              <TabsContent value="rubric" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Rubric Breakdown</CardTitle>
                    <CardDescription>See how you performed on each grading criterion</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {grade.criteriaGrades.map((criterion, index) => (
                        <div key={index} className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-semibold">{criterion.criterionName}</h4>
                              <p className="text-sm text-gray-600">{criterion.description}</p>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold">
                                {criterion.earnedPoints}/{criterion.maxPoints}
                              </div>
                              <Badge variant="outline">{criterion.weight}% weight</Badge>
                            </div>
                          </div>

                          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-sm">{criterion.levelName}</span>
                              <Badge variant="secondary">
                                {Math.round((criterion.earnedPoints / criterion.maxPoints) * 100)}%
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{criterion.levelDescription}</p>
                            {criterion.feedback && (
                              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border-l-4 border-blue-500">
                                <p className="text-sm">{criterion.feedback}</p>
                              </div>
                            )}
                          </div>

                          <Progress value={(criterion.earnedPoints / criterion.maxPoints) * 100} className="h-2" />

                          {index < grade.criteriaGrades.length - 1 && <Separator />}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="feedback" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <MessageSquare className="h-5 w-5" />
                      <span>Teacher Feedback</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Overall Comments */}
                    <div>
                      <h4 className="font-semibold mb-3">Overall Comments</h4>
                      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                        <p className="text-sm leading-relaxed">{grade.feedback.overallComments}</p>
                      </div>
                    </div>

                    {/* Strengths */}
                    <div>
                      <h4 className="font-semibold mb-3 flex items-center space-x-2">
                        <Star className="h-4 w-4 text-yellow-500" />
                        <span>Strengths</span>
                      </h4>
                      <div className="space-y-2">
                        {grade.feedback.strengths.map((strength, index) => (
                          <div
                            key={index}
                            className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border-l-4 border-green-500"
                          >
                            <p className="text-sm">{strength}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Areas for Improvement */}
                    <div>
                      <h4 className="font-semibold mb-3 flex items-center space-x-2">
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        <span>Areas for Improvement</span>
                      </h4>
                      <div className="space-y-2">
                        {grade.feedback.improvements.map((improvement, index) => (
                          <div
                            key={index}
                            className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border-l-4 border-orange-500"
                          >
                            <p className="text-sm">{improvement}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="improvement" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Award className="h-5 w-5" />
                      <span>Your Improvement Plan</span>
                    </CardTitle>
                    <CardDescription>Based on your performance, here are specific steps to improve</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Action Items */}
                    <div>
                      <h4 className="font-semibold mb-3">Recommended Actions</h4>
                      <div className="space-y-3">
                        {grade.feedback.improvements.map((improvement, index) => (
                          <div key={index} className="flex items-start space-x-3 p-3 border rounded-lg">
                            <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{index + 1}</span>
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium">{improvement}</p>
                              <p className="text-xs text-gray-500 mt-1">Focus on this area for your next assignment</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Resources */}
                    <div>
                      <h4 className="font-semibold mb-3">Helpful Resources</h4>
                      <div className="space-y-2">
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <h5 className="font-medium text-sm">Study Guide: Cellular Biology</h5>
                          <p className="text-xs text-gray-600 mt-1">
                            Review key concepts about cellular structures and functions
                          </p>
                        </div>
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <h5 className="font-medium text-sm">Lab Report Writing Guide</h5>
                          <p className="text-xs text-gray-600 mt-1">
                            Learn how to write more detailed scientific analyses
                          </p>
                        </div>
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <h5 className="font-medium text-sm">Office Hours</h5>
                          <p className="text-xs text-gray-600 mt-1">
                            Schedule a meeting to discuss your performance and get personalized help
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Next Steps */}
                    <div>
                      <h4 className="font-semibold mb-3">Next Steps</h4>
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 rounded-lg">
                        <p className="text-sm mb-3">
                          <strong>Goal for next assignment:</strong> Aim for 85% or higher by focusing on detailed
                          analysis and stronger conclusions.
                        </p>
                        <div className="flex space-x-2">
                          <Button size="sm">Schedule Office Hours</Button>
                          <Button variant="outline" size="sm">
                            View Study Resources
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
