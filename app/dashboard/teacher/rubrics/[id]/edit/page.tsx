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
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  Minus, 
  Trash2, 
  GripVertical,
  Eye
} from "lucide-react"

// Reuse the same interfaces from create page
interface RubricLevel {
  id: string
  name: string
  description: string
  points: number
  qualityIndicators: string[]
  order_index: number
}

interface RubricCriterion {
  id: string
  name: string
  description: string
  weight: number
  levels: RubricLevel[]
  order_index: number
}

interface Class {
  id: string
  name: string
}

export default function EditRubricPage() {
  const router = useRouter()
  const params = useParams()
  const { user } = useAuth()
  const [rubricData, setRubricData] = useState({
    name: "",
    description: "",
    isTemplate: false,
    classId: "",
  })
  const [criteria, setCriteria] = useState<RubricCriterion[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (user && params.id) {
      fetchRubricData()
      fetchClasses()
    }
  }, [user, params.id])

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', user.id)
        .order('name')

      if (error) throw error
      setClasses(data || [])
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }

  const fetchRubricData = async () => {
    try {
      // Fetch rubric basic info
      const { data: rubricData_db, error: rubricError } = await supabase
        .from('rubrics')
        .select(`
          id,
          name,
          description,
          is_template,
          class_id
        `)
        .eq('id', params.id)
        .eq('teacher_id', user.id)
        .single()

      if (rubricError) throw rubricError

      setRubricData({
        name: rubricData_db.name,
        description: rubricData_db.description || '',
        isTemplate: rubricData_db.is_template,
        classId: rubricData_db.class_id || ''
      })

      // Fetch criteria with levels and quality indicators
      const { data: criteriaData, error: criteriaError } = await supabase
        .from('rubric_criteria')
        .select(`
          id,
          name,
          description,
          weight,
          order_index,
          rubric_levels(
            id,
            name,
            description,
            points,
            order_index,
            rubric_quality_indicators(
              id,
              indicator,
              order_index
            )
          )
        `)
        .eq('rubric_id', params.id)
        .order('order_index')

      if (criteriaError) throw criteriaError

      const formattedCriteria = criteriaData?.map(criterion => ({
        id: criterion.id,
        name: criterion.name,
        description: criterion.description,
        weight: criterion.weight,
        order_index: criterion.order_index,
        levels: criterion.rubric_levels
          ?.sort((a, b) => a.order_index - b.order_index)
          .map(level => ({
            id: level.id,
            name: level.name,
            description: level.description,
            points: level.points,
            order_index: level.order_index,
            qualityIndicators: level.rubric_quality_indicators
              ?.sort((a, b) => a.order_index - b.order_index)
              .map(qi => qi.indicator) || []
          })) || []
      })) || []

      setCriteria(formattedCriteria)
    } catch (error) {
      console.error('Error fetching rubric data:', error)
      router.push('/dashboard/teacher/rubrics')
    } finally {
      setLoading(false)
    }
  }

  // Reuse functions from create page with modifications for editing
  const addCriterion = () => {
    const newCriterion: RubricCriterion = {
      id: `new_criterion_${Date.now()}`,
      name: "",
      description: "",
      weight: Math.round(100 / (criteria.length + 1)),
      order_index: criteria.length,
      levels: [
        {
          id: `new_level_${Date.now()}_1`,
          name: "Excellent",
          description: "",
          points: 4,
          qualityIndicators: [],
          order_index: 0
        },
        {
          id: `new_level_${Date.now()}_2`,
          name: "Good",
          description: "",
          points: 3,
          qualityIndicators: [],
          order_index: 1
        },
        {
          id: `new_level_${Date.now()}_3`,
          name: "Satisfactory",
          description: "",
          points: 2,
          qualityIndicators: [],
          order_index: 2
        },
        {
          id: `new_level_${Date.now()}_4`,
          name: "Needs Improvement",
          description: "",
          points: 1,
          qualityIndicators: [],
          order_index: 3
        },
      ],
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
    const updatedCriteria = criteria.filter((c) => c.id !== criterionId)
    setCriteria(updatedCriteria)
    redistributeWeights(updatedCriteria)
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
    const criterion = criteria.find(c => c.id === criterionId)
    const level = criterion?.levels.find(l => l.id === levelId)
    if (level) {
      updateLevel(criterionId, levelId, {
        qualityIndicators: [...level.qualityIndicators, ""]
      })
    }
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

  const validateRubric = () => {
    if (!rubricData.name.trim()) {
      alert("Please enter a rubric name")
      return false
    }
    if (criteria.length === 0) {
      alert("Please add at least one criterion")
      return false
    }
    for (const criterion of criteria) {
      if (!criterion.name.trim()) {
        alert("Please name all criteria")
        return false
      }
      if (criterion.levels.length < 2) {
        alert("Each criterion must have at least 2 performance levels")
        return false
      }
      for (const level of criterion.levels) {
        if (!level.name.trim()) {
          alert("Please name all performance levels")
          return false
        }
      }
    }
    return true
  }

  const saveRubric = async () => {
    if (!user || !validateRubric()) return

    setSaving(true)
    try {
      // Update the main rubric record
      const { error: rubricError } = await supabase
        .from('rubrics')
        .update({
          name: rubricData.name,
          description: rubricData.description,
          class_id: rubricData.classId || null,
          is_template: rubricData.isTemplate,
          updated_at: new Date().toISOString()
        })
        .eq('id', params.id)

      if (rubricError) throw rubricError

      // Delete existing criteria (cascade will handle levels and indicators)
      const { error: deleteError } = await supabase
        .from('rubric_criteria')
        .delete()
        .eq('rubric_id', params.id)

      if (deleteError) throw deleteError

      // Recreate criteria and their levels
      for (const criterion of criteria) {
        const { data: criterionData, error: criterionError } = await supabase
          .from('rubric_criteria')
          .insert({
            rubric_id: params.id,
            name: criterion.name,
            description: criterion.description,
            weight: criterion.weight,
            order_index: criterion.order_index
          })
          .select()
          .single()

        if (criterionError) throw criterionError

        // Create levels for this criterion
        for (const level of criterion.levels) {
          const { data: levelData, error: levelError } = await supabase
            .from('rubric_levels')
            .insert({
              criterion_id: criterionData.id,
              name: level.name,
              description: level.description,
              points: level.points,
              order_index: level.order_index
            })
            .select()
            .single()

          if (levelError) throw levelError

          // Create quality indicators for this level
          if (level.qualityIndicators.length > 0) {
            const indicators = level.qualityIndicators
              .filter(indicator => indicator.trim())
              .map((indicator, index) => ({
                level_id: levelData.id,
                indicator: indicator.trim(),
                order_index: index
              }))

            if (indicators.length > 0) {
              const { error: indicatorError } = await supabase
                .from('rubric_quality_indicators')
                .insert(indicators)

              if (indicatorError) throw indicatorError
            }
          }
        }
      }

      alert("Rubric updated successfully!")
      router.push(`/dashboard/teacher/rubrics/${params.id}`)
    } catch (error) {
      console.error("Error updating rubric:", error)
      alert("Failed to update rubric. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Edit Rubric</h1>
            <p className="text-gray-600">Modify your grading rubric</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={saveRubric} disabled={saving}>
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>Update the basic details for your rubric</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Rubric Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Essay Writing Rubric"
                value={rubricData.name}
                onChange={(e) => setRubricData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="class">Associated Class (Optional)</Label>
              <Select 
                value={rubricData.classId || "none"} 
                onValueChange={(value) => setRubricData(prev => ({ ...prev, classId: value === "none" ? "" : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific class</SelectItem>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe what this rubric evaluates..."
              value={rubricData.description}
              onChange={(e) => setRubricData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="template"
              checked={rubricData.isTemplate}
              onCheckedChange={(checked) => setRubricData(prev => ({ ...prev, isTemplate: checked }))}
            />
            <Label htmlFor="template">Save as template for future use</Label>
          </div>
        </CardContent>
      </Card>

      {/* Criteria Section - Reuse the same UI from create page */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Evaluation Criteria</CardTitle>
              <CardDescription>
                Modify the criteria and performance levels for evaluation
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setPreviewMode(!previewMode)}
                size="sm"
              >
                <Eye className="h-4 w-4 mr-2" />
                {previewMode ? 'Hide Preview' : 'Show Preview'}
              </Button>
              <Button onClick={addCriterion} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Criterion
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Preview Section */}
          {previewMode && criteria.length > 0 && (
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="text-lg">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-xl font-bold">{rubricData.name || 'Untitled Rubric'}</h3>
                    {rubricData.description && (
                      <p className="text-gray-600 mt-2">{rubricData.description}</p>
                    )}
                    <p className="text-sm text-gray-500 mt-2">Total Points: {calculateTotalPoints()}</p>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-white">
                          <th className="border border-gray-300 p-2 text-left">Criteria</th>
                          {criteria[0]?.levels.map((level) => (
                            <th key={level.id} className="border border-gray-300 p-2 text-center">
                              {level.name} ({level.points} pts)
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {criteria.map((criterion) => (
                          <tr key={criterion.id}>
                            <td className="border border-gray-300 p-2 font-medium bg-white">
                              <div>
                                <div className="font-semibold">{criterion.name}</div>
                                <div className="text-sm text-gray-600">{criterion.description}</div>
                                <div className="text-xs text-gray-500">Weight: {criterion.weight}%</div>
                              </div>
                            </td>
                            {criterion.levels.map((level) => (
                              <td key={level.id} className="border border-gray-300 p-2 text-sm bg-white">
                                <div className="space-y-1">
                                  <div className="font-medium">{level.description}</div>
                                  {level.qualityIndicators.length > 0 && (
                                    <ul className="text-xs text-gray-600 list-disc list-inside">
                                      {level.qualityIndicators.map((indicator, idx) => (
                                        <li key={idx}>{indicator}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Criteria Editor - Same as create page */}
          {criteria.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
              <h3 className="text-lg font-medium mb-2">No criteria yet</h3>
              <p className="text-gray-600 mb-4">Add your first evaluation criterion to get started</p>
              <Button onClick={addCriterion}>
                <Plus className="h-4 w-4 mr-2" />
                Add First Criterion
              </Button>
            </div>
          ) : (
            criteria.map((criterion) => (
              <Card key={criterion.id} className="border-l-4 border-l-blue-500">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Criterion name (e.g., Content Quality)"
                          value={criterion.name}
                          onChange={(e) => updateCriterion(criterion.id, { name: e.target.value })}
                          className="font-medium"
                        />
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Label className="text-sm">Weight:</Label>
                          <Input
                            type="number"
                            min="1"
                            max="100"
                            value={criterion.weight}
                            onChange={(e) => updateCriterion(criterion.id, { weight: parseInt(e.target.value) || 0 })}
                            className="w-16"
                          />
                          <span className="text-sm text-gray-500">%</span>
                        </div>
                      </div>
                      <Textarea
                        placeholder="Describe what this criterion evaluates..."
                        value={criterion.description}
                        onChange={(e) => updateCriterion(criterion.id, { description: e.target.value })}
                        rows={2}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCriterion(criterion.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Label className="text-sm font-medium">Performance Levels</Label>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {criterion.levels.map((level) => (
                        <Card key={level.id} className="relative">
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <Input
                                placeholder="Level name"
                                value={level.name}
                                onChange={(e) => updateLevel(criterion.id, level.id, { name: e.target.value })}
                                className="font-medium text-sm"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs">Points:</Label>
                              <Input
                                type="number"
                                min="0"
                                value={level.points}
                                onChange={(e) => updateLevel(criterion.id, level.id, { points: parseInt(e.target.value) || 0 })}
                                className="w-16 text-sm"
                              />
                            </div>
                          </CardHeader>
                          <CardContent className="pt-2">
                            <Textarea
                              placeholder="Describe this performance level..."
                              value={level.description}
                              onChange={(e) => updateLevel(criterion.id, level.id, { description: e.target.value })}
                              rows={3}
                              className="text-sm"
                            />
                            
                            <div className="mt-3 space-y-2">
                              <Label className="text-xs font-medium">Quality Indicators:</Label>
                              {level.qualityIndicators.map((indicator, indicatorIndex) => (
                                <div key={indicatorIndex} className="flex gap-1">
                                  <Input
                                    placeholder="Quality indicator..."
                                    value={indicator}
                                    onChange={(e) => updateQualityIndicator(criterion.id, level.id, indicatorIndex, e.target.value)}
                                    className="text-xs"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeQualityIndicator(criterion.id, level.id, indicatorIndex)}
                                    className="p-1"
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => addQualityIndicator(criterion.id, level.id)}
                                className="text-xs"
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Add Indicator
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}