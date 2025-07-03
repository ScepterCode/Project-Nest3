"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Plus, Minus, Save, Eye, BookOpen, Target, Star, Trash2, GripVertical } from "lucide-react"

interface RubricLevel {
  id: string
  name: string
  description: string
  points: number
  qualityIndicators: string[]
}

interface RubricCriterion {
  id: string
  name: string
  description: string
  weight: number
  levels: RubricLevel[]
}

export default function CreateRubricPage() {
  const router = useRouter()
  const [rubricData, setRubricData] = useState({
    name: "",
    description: "",
    isTemplate: false,
    classId: "",
  })
  const [criteria, setCriteria] = useState<RubricCriterion[]>([])
  const [previewMode, setPreviewMode] = useState(false)

  const addCriterion = () => {
    const newCriterion: RubricCriterion = {
      id: `criterion_${Date.now()}`,
      name: "",
      description: "",
      weight: 25,
      levels: [
        {
          id: `level_${Date.now()}_1`,
          name: "Excellent",
          description: "",
          points: 4,
          qualityIndicators: [],
        },
        {
          id: `level_${Date.now()}_2`,
          name: "Good",
          description: "",
          points: 3,
          qualityIndicators: [],
        },
        {
          id: `level_${Date.now()}_3`,
          name: "Satisfactory",
          description: "",
          points: 2,
          qualityIndicators: [],
        },
        {
          id: `level_${Date.now()}_4`,
          name: "Needs Improvement",
          description: "",
          points: 1,
          qualityIndicators: [],
        },
      ],
    }
    setCriteria([...criteria, newCriterion])
  }

  const removeCriterion = (criterionId: string) => {
    setCriteria(criteria.filter((c) => c.id !== criterionId))
  }

  const updateCriterion = (criterionId: string, updates: Partial<RubricCriterion>) => {
    setCriteria(criteria.map((c) => (c.id === criterionId ? { ...c, ...updates } : c)))
  }

  const updateLevel = (criterionId: string, levelId: string, updates: Partial<RubricLevel>) => {
    setCriteria(
      criteria.map((c) =>
        c.id === criterionId
          ? {
              ...c,
              levels: c.levels.map((l) => (l.id === levelId ? { ...l, ...updates } : l)),
            }
          : c,
      ),
    )
  }

  const addQualityIndicator = (criterionId: string, levelId: string) => {
    updateLevel(criterionId, levelId, {
      qualityIndicators: [
        ...(criteria.find((c) => c.id === criterionId)?.levels.find((l) => l.id === levelId)?.qualityIndicators || []),
        "",
      ],
    })
  }

  const updateQualityIndicator = (criterionId: string, levelId: string, indicatorIndex: number, value: string) => {
    const criterion = criteria.find((c) => c.id === criterionId)
    const level = criterion?.levels.find((l) => l.id === levelId)
    if (level) {
      const newIndicators = [...level.qualityIndicators]
      newIndicators[indicatorIndex] = value
      updateLevel(criterionId, levelId, { qualityIndicators: newIndicators })
    }
  }

  const removeQualityIndicator = (criterionId: string, levelId: string, indicatorIndex: number) => {
    const criterion = criteria.find((c) => c.id === criterionId)
    const level = criterion?.levels.find((l) => l.id === levelId)
    if (level) {
      const newIndicators = level.qualityIndicators.filter((_, i) => i !== indicatorIndex)
      updateLevel(criterionId, levelId, { qualityIndicators: newIndicators })
    }
  }

  const calculateTotalPoints = () => {
    return criteria.reduce((sum, criterion) => {
      const maxPoints = Math.max(...criterion.levels.map((level) => level.points))
      return sum + maxPoints
    }, 0)
  }

  const saveRubric = async () => {
    const rubricPayload = {
      ...rubricData,
      criteria,
      totalPoints: calculateTotalPoints(),
    }

    try {
      const response = await fetch("/api/rubrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rubricPayload),
      })

      if (response.ok) {
        alert("Rubric created successfully!")
        router.push("/dashboard/teacher/rubrics")
      }
    } catch (error) {
      console.error("Error creating rubric:", error)
      alert("Error creating rubric")
    }
  }

  const loadTemplate = (templateName: string) => {
    // Load predefined templates
    if (templateName === "essay") {
      setCriteria([
        {
          id: "crit_content",
          name: "Content & Ideas",
          description: "Quality and relevance of ideas presented",
          weight: 40,
          levels: [
            {
              id: "level_content_4",
              name: "Excellent (36-40 pts)",
              description: "Ideas are original, well-developed, and highly relevant",
              points: 40,
              qualityIndicators: [
                "Original and creative thinking",
                "Well-developed arguments",
                "Highly relevant to topic",
              ],
            },
            {
              id: "level_content_3",
              name: "Good (32-35 pts)",
              description: "Ideas are clear and mostly relevant",
              points: 35,
              qualityIndicators: ["Clear thinking", "Adequate development", "Mostly relevant"],
            },
            {
              id: "level_content_2",
              name: "Satisfactory (28-31 pts)",
              description: "Ideas are basic but acceptable",
              points: 31,
              qualityIndicators: ["Basic understanding", "Limited development", "Somewhat relevant"],
            },
            {
              id: "level_content_1",
              name: "Needs Improvement (0-27 pts)",
              description: "Ideas are unclear or irrelevant",
              points: 25,
              qualityIndicators: ["Unclear thinking", "Poor development", "Not relevant"],
            },
          ],
        },
        {
          id: "crit_organization",
          name: "Organization",
          description: "Structure and flow of the writing",
          weight: 30,
          levels: [
            {
              id: "level_org_4",
              name: "Excellent (27-30 pts)",
              description: "Clear structure with smooth transitions",
              points: 30,
              qualityIndicators: ["Logical flow", "Smooth transitions", "Clear structure"],
            },
            {
              id: "level_org_3",
              name: "Good (24-26 pts)",
              description: "Generally well organized",
              points: 26,
              qualityIndicators: ["Good structure", "Most transitions work"],
            },
            {
              id: "level_org_2",
              name: "Satisfactory (21-23 pts)",
              description: "Basic organization present",
              points: 23,
              qualityIndicators: ["Basic structure", "Some organization"],
            },
            {
              id: "level_org_1",
              name: "Needs Improvement (0-20 pts)",
              description: "Poor or no clear organization",
              points: 18,
              qualityIndicators: ["No clear structure", "Confusing flow"],
            },
          ],
        },
        {
          id: "crit_grammar",
          name: "Grammar & Mechanics",
          description: "Proper use of grammar, spelling, and punctuation",
          weight: 30,
          levels: [
            {
              id: "level_grammar_4",
              name: "Excellent (27-30 pts)",
              description: "Virtually no errors",
              points: 30,
              qualityIndicators: ["No grammar errors", "Perfect spelling", "Correct punctuation"],
            },
            {
              id: "level_grammar_3",
              name: "Good (24-26 pts)",
              description: "Few minor errors",
              points: 26,
              qualityIndicators: ["Minor errors only", "Generally correct"],
            },
            {
              id: "level_grammar_2",
              name: "Satisfactory (21-23 pts)",
              description: "Some errors but don't interfere with meaning",
              points: 23,
              qualityIndicators: ["Some errors", "Meaning still clear"],
            },
            {
              id: "level_grammar_1",
              name: "Needs Improvement (0-20 pts)",
              description: "Many errors that interfere with understanding",
              points: 18,
              qualityIndicators: ["Many errors", "Interferes with understanding"],
            },
          ],
        },
      ])
    }
  }

  if (previewMode) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Rubric Preview</h1>
            <Button onClick={() => setPreviewMode(false)} variant="outline">
              <Eye className="h-4 w-4 mr-2" />
              Exit Preview
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{rubricData.name || "Untitled Rubric"}</CardTitle>
              <CardDescription>{rubricData.description}</CardDescription>
              <div className="flex items-center space-x-4">
                <Badge variant="outline">Total Points: {calculateTotalPoints()}</Badge>
                <Badge variant="outline">{criteria.length} Criteria</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                {criteria.map((criterion) => (
                  <div key={criterion.id} className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold">{criterion.name}</h3>
                      <p className="text-gray-600">{criterion.description}</p>
                      <Badge variant="secondary" className="mt-1">
                        {criterion.weight}% of grade
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {criterion.levels.map((level) => (
                        <Card key={level.id} className="border-2">
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm">{level.name}</CardTitle>
                              <Badge>{level.points} pts</Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <p className="text-sm text-gray-600 mb-2">{level.description}</p>
                            {level.qualityIndicators.length > 0 && (
                              <ul className="text-xs space-y-1">
                                {level.qualityIndicators.map((indicator, index) => (
                                  <li key={index} className="flex items-start space-x-1">
                                    <span>•</span>
                                    <span>{indicator}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <Separator />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Create Rubric</h1>
            <p className="text-gray-600">Build a comprehensive grading rubric</p>
          </div>
          <div className="flex space-x-2">
            <Button onClick={() => setPreviewMode(true)} variant="outline">
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button onClick={saveRubric}>
              <Save className="h-4 w-4 mr-2" />
              Save Rubric
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Rubric Details */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Rubric Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">Rubric Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Essay Writing Rubric"
                    value={rubricData.name}
                    onChange={(e) => setRubricData({ ...rubricData, name: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of this rubric..."
                    value={rubricData.description}
                    onChange={(e) => setRubricData({ ...rubricData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="template"
                    checked={rubricData.isTemplate}
                    onCheckedChange={(checked) => setRubricData({ ...rubricData, isTemplate: checked })}
                  />
                  <Label htmlFor="template">Save as template</Label>
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium mb-2">Quick Templates</h4>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start bg-transparent"
                      onClick={() => loadTemplate("essay")}
                    >
                      <BookOpen className="h-4 w-4 mr-2" />
                      Essay Writing
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start bg-transparent">
                      <Target className="h-4 w-4 mr-2" />
                      Lab Report
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start bg-transparent">
                      <Star className="h-4 w-4 mr-2" />
                      Presentation
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span>Total Criteria:</span>
                    <Badge variant="outline">{criteria.length}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Points:</span>
                    <Badge variant="outline">{calculateTotalPoints()}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Criteria Builder */}
          <div className="lg:col-span-3">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Criteria</h2>
                <Button onClick={addCriterion}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Criterion
                </Button>
              </div>

              {criteria.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Target className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No criteria yet</h3>
                    <p className="text-gray-600 mb-4">Add your first grading criterion to get started</p>
                    <Button onClick={addCriterion}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Criterion
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  {criteria.map((criterion, criterionIndex) => (
                    <Card key={criterion.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <GripVertical className="h-4 w-4 text-gray-400" />
                            <div className="flex-1">
                              <Input
                                placeholder="Criterion name (e.g., Content & Ideas)"
                                value={criterion.name}
                                onChange={(e) => updateCriterion(criterion.id, { name: e.target.value })}
                                className="font-medium"
                              />
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeCriterion(criterion.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="md:col-span-3">
                            <Textarea
                              placeholder="Describe what this criterion evaluates..."
                              value={criterion.description}
                              onChange={(e) => updateCriterion(criterion.id, { description: e.target.value })}
                              rows={2}
                            />
                          </div>
                          <div>
                            <Label>Weight (%)</Label>
                            <Input
                              type="number"
                              min="1"
                              max="100"
                              value={criterion.weight}
                              onChange={(e) =>
                                updateCriterion(criterion.id, { weight: Number.parseInt(e.target.value) || 0 })
                              }
                            />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <h4 className="font-medium">Performance Levels</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {criterion.levels.map((level, levelIndex) => (
                              <Card key={level.id} className="border-2">
                                <CardHeader className="pb-2">
                                  <Input
                                    placeholder="Level name"
                                    value={level.name}
                                    onChange={(e) => updateLevel(criterion.id, level.id, { name: e.target.value })}
                                    className="font-medium text-sm"
                                  />
                                  <Input
                                    type="number"
                                    placeholder="Points"
                                    value={level.points}
                                    onChange={(e) =>
                                      updateLevel(criterion.id, level.id, {
                                        points: Number.parseInt(e.target.value) || 0,
                                      })
                                    }
                                    className="text-sm"
                                  />
                                </CardHeader>
                                <CardContent className="pt-0 space-y-2">
                                  <Textarea
                                    placeholder="Describe this performance level..."
                                    value={level.description}
                                    onChange={(e) =>
                                      updateLevel(criterion.id, level.id, { description: e.target.value })
                                    }
                                    rows={3}
                                    className="text-sm"
                                  />

                                  <div>
                                    <Label className="text-xs">Quality Indicators</Label>
                                    <div className="space-y-1">
                                      {level.qualityIndicators.map((indicator, indicatorIndex) => (
                                        <div key={indicatorIndex} className="flex space-x-1">
                                          <Input
                                            placeholder="Quality indicator..."
                                            value={indicator}
                                            onChange={(e) =>
                                              updateQualityIndicator(
                                                criterion.id,
                                                level.id,
                                                indicatorIndex,
                                                e.target.value,
                                              )
                                            }
                                            className="text-xs"
                                          />
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              removeQualityIndicator(criterion.id, level.id, indicatorIndex)
                                            }
                                          >
                                            <Minus className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      ))}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => addQualityIndicator(criterion.id, level.id)}
                                        className="w-full"
                                      >
                                        <Plus className="h-3 w-3 mr-1" />
                                        Add Indicator
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
