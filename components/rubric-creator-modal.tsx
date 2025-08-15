"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Minus, Save } from "lucide-react"

interface RubricLevel {
  id: string
  name: string
  description: string
  points: number
}

interface RubricCriterion {
  id: string
  name: string
  description: string
  weight: number
  levels: RubricLevel[]
}

interface RubricCreatorModalProps {
  assignmentId: string
  onRubricCreated: (rubric: any) => void
  trigger?: React.ReactNode
}

export function RubricCreatorModal({ assignmentId, onRubricCreated, trigger }: RubricCreatorModalProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rubricName, setRubricName] = useState("")
  const [rubricDescription, setRubricDescription] = useState("")
  const [criteria, setCriteria] = useState<RubricCriterion[]>([])

  const addCriterion = () => {
    const newCriterion: RubricCriterion = {
      id: `criterion_${Date.now()}`,
      name: "",
      description: "",
      weight: Math.round(100 / (criteria.length + 1)),
      levels: [
        {
          id: `level_${Date.now()}_1`,
          name: "Excellent",
          description: "Outstanding work",
          points: 4
        },
        {
          id: `level_${Date.now()}_2`,
          name: "Good",
          description: "Good work",
          points: 3
        },
        {
          id: `level_${Date.now()}_3`,
          name: "Satisfactory",
          description: "Acceptable work",
          points: 2
        },
        {
          id: `level_${Date.now()}_4`,
          name: "Needs Improvement",
          description: "Below expectations",
          points: 1
        }
      ]
    }
    setCriteria([...criteria, newCriterion])
    redistributeWeights([...criteria, newCriterion])
  }

  const redistributeWeights = (criteriaList: RubricCriterion[]) => {
    const equalWeight = Math.round(100 / criteriaList.length)
    const updatedCriteria = criteriaList.map(criterion => ({
      ...criterion,
      weight: equalWeight
    }))
    setCriteria(updatedCriteria)
  }

  const removeCriterion = (criterionId: string) => {
    const updatedCriteria = criteria.filter(c => c.id !== criterionId)
    setCriteria(updatedCriteria)
    redistributeWeights(updatedCriteria)
  }

  const updateCriterion = (criterionId: string, field: string, value: any) => {
    setCriteria(criteria.map(c => 
      c.id === criterionId ? { ...c, [field]: value } : c
    ))
  }

  const updateLevel = (criterionId: string, levelId: string, field: string, value: any) => {
    setCriteria(criteria.map(c => 
      c.id === criterionId 
        ? {
            ...c,
            levels: c.levels.map(l => 
              l.id === levelId ? { ...l, [field]: value } : l
            )
          }
        : c
    ))
  }

  const createRubric = async () => {
    if (!rubricName.trim() || criteria.length === 0) {
      alert("Please provide a rubric name and at least one criterion")
      return
    }

    // Validate criteria
    for (const criterion of criteria) {
      if (!criterion.name.trim()) {
        alert("Please name all criteria")
        return
      }
    }

    setSaving(true)
    try {
      const rubric = {
        name: rubricName,
        description: rubricDescription,
        criteria: criteria.map(criterion => ({
          id: criterion.id,
          name: criterion.name,
          description: criterion.description,
          weight: criterion.weight,
          levels: criterion.levels.map(level => ({
            id: level.id,
            name: level.name,
            description: level.description,
            points: level.points
          }))
        }))
      }

      const response = await fetch(`/api/assignments/${assignmentId}/rubric`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rubric }),
      })

      if (!response.ok) {
        throw new Error('Failed to create rubric')
      }

      onRubricCreated(rubric)
      setOpen(false)
      
      // Reset form
      setRubricName("")
      setRubricDescription("")
      setCriteria([])
      
      alert("Rubric created and added to assignment successfully!")

    } catch (error) {
      console.error('Error creating rubric:', error)
      alert('Failed to create rubric. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const loadTemplate = (templateName: string) => {
    if (templateName === "essay") {
      setRubricName("Essay Rubric")
      setRubricDescription("Rubric for evaluating essays")
      setCriteria([
        {
          id: "content",
          name: "Content & Ideas",
          description: "Quality and relevance of ideas",
          weight: 40,
          levels: [
            { id: "content_4", name: "Excellent", description: "Original, well-developed ideas", points: 4 },
            { id: "content_3", name: "Good", description: "Clear, relevant ideas", points: 3 },
            { id: "content_2", name: "Satisfactory", description: "Basic but acceptable ideas", points: 2 },
            { id: "content_1", name: "Needs Improvement", description: "Unclear or irrelevant ideas", points: 1 }
          ]
        },
        {
          id: "organization",
          name: "Organization",
          description: "Structure and flow of writing",
          weight: 30,
          levels: [
            { id: "org_4", name: "Excellent", description: "Clear structure with smooth transitions", points: 4 },
            { id: "org_3", name: "Good", description: "Generally well organized", points: 3 },
            { id: "org_2", name: "Satisfactory", description: "Basic organization present", points: 2 },
            { id: "org_1", name: "Needs Improvement", description: "Poor or no clear organization", points: 1 }
          ]
        },
        {
          id: "grammar",
          name: "Grammar & Mechanics",
          description: "Proper use of grammar and spelling",
          weight: 30,
          levels: [
            { id: "gram_4", name: "Excellent", description: "Virtually no errors", points: 4 },
            { id: "gram_3", name: "Good", description: "Few minor errors", points: 3 },
            { id: "gram_2", name: "Satisfactory", description: "Some errors, doesn't interfere with meaning", points: 2 },
            { id: "gram_1", name: "Needs Improvement", description: "Many errors that interfere with understanding", points: 1 }
          ]
        }
      ])
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Rubric
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Rubric</DialogTitle>
          <DialogDescription>
            Create a rubric for structured grading with detailed criteria
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="rubric-name">Rubric Name</Label>
              <Input
                id="rubric-name"
                value={rubricName}
                onChange={(e) => setRubricName(e.target.value)}
                placeholder="e.g., Essay Writing Rubric"
              />
            </div>
            <div>
              <Label htmlFor="rubric-description">Description (Optional)</Label>
              <Textarea
                id="rubric-description"
                value={rubricDescription}
                onChange={(e) => setRubricDescription(e.target.value)}
                placeholder="Describe what this rubric evaluates..."
                rows={2}
              />
            </div>
          </div>

          {/* Quick Templates */}
          <div>
            <Label>Quick Start Templates</Label>
            <div className="flex gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadTemplate("essay")}
              >
                Essay Template
              </Button>
            </div>
          </div>

          {/* Criteria */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <Label>Criteria ({criteria.length})</Label>
              <Button onClick={addCriterion} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Criterion
              </Button>
            </div>

            {criteria.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                <p className="text-gray-500">No criteria yet. Add your first criterion to get started.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {criteria.map((criterion) => (
                  <Card key={criterion.id}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="Criterion name"
                              value={criterion.name}
                              onChange={(e) => updateCriterion(criterion.id, 'name', e.target.value)}
                            />
                            <div className="flex items-center gap-1 min-w-[100px]">
                              <Input
                                type="number"
                                min="1"
                                max="100"
                                value={criterion.weight}
                                onChange={(e) => updateCriterion(criterion.id, 'weight', parseInt(e.target.value) || 0)}
                                className="w-16"
                              />
                              <span className="text-sm">%</span>
                            </div>
                          </div>
                          <Textarea
                            placeholder="Describe this criterion..."
                            value={criterion.description}
                            onChange={(e) => updateCriterion(criterion.id, 'description', e.target.value)}
                            rows={2}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCriterion(criterion.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {criterion.levels.map((level) => (
                          <div key={level.id} className="border rounded p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Input
                                placeholder="Level name"
                                value={level.name}
                                onChange={(e) => updateLevel(criterion.id, level.id, 'name', e.target.value)}
                                className="text-sm"
                              />
                              <Input
                                type="number"
                                min="0"
                                value={level.points}
                                onChange={(e) => updateLevel(criterion.id, level.id, 'points', parseInt(e.target.value) || 0)}
                                className="w-16 text-sm"
                              />
                            </div>
                            <Textarea
                              placeholder="Describe this level..."
                              value={level.description}
                              onChange={(e) => updateLevel(criterion.id, level.id, 'description', e.target.value)}
                              rows={2}
                              className="text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createRubric} disabled={saving}>
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Create Rubric
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}