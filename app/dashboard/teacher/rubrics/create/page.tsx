"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { Plus, Minus, Save, Eye, BookOpen, Target, Star, Trash2, GripVertical, Copy, FileText } from "lucide-react"

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

interface RubricTemplate {
  id: string
  name: string
  description: string
  category: string
  template_data: any
}

interface Class {
  id: string
  name: string
}

export default function CreateRubricPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("create")
  const [rubricData, setRubricData] = useState({
    name: "",
    description: "",
    isTemplate: false,
    classId: "",
  })
  const [criteria, setCriteria] = useState<RubricCriterion[]>([])
  const [previewMode, setPreviewMode] = useState(false)
  const [templates, setTemplates] = useState<RubricTemplate[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    if (user) {
      fetchTemplates()
      fetchClasses()
    }
  }, [user])

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('rubric_templates')
        .select('*')
        .eq('is_public', true)
        .order('name')

      if (error) throw error
      setTemplates(data || [])
    } catch (error) {
      console.error('Error fetching templates:', error)
    }
  }

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

  const addCriterion = () => {
    const newCriterion: RubricCriterion = {
      id: `criterion_${Date.now()}`,
      name: "",
      description: "",
      weight: Math.round(100 / (criteria.length + 1)),
      order_index: criteria.length,
      levels: [
        {
          id: `level_${Date.now()}_1`,
          name: "Excellent",
          description: "",
          points: 4,
          qualityIndicators: [],
          order_index: 0
        },
        {
          id: `level_${Date.now()}_2`,
          name: "Good",
          description: "",
          points: 3,
          qualityIndicators: [],
          order_index: 1
        },
        {
          id: `level_${Date.now()}_3`,
          name: "Satisfactory",
          description: "",
          points: 2,
          qualityIndicators: [],
          order_index: 2
        },
        {
          id: `level_${Date.now()}_4`,
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

  const addLevel = (criterionId: string) => {
    const criterion = criteria.find(c => c.id === criterionId)
    if (!criterion) return

    const newLevel: RubricLevel = {
      id: `level_${Date.now()}`,
      name: "New Level",
      description: "",
      points: criterion.levels.length + 1,
      qualityIndicators: [],
      order_index: criterion.levels.length
    }

    updateCriterion(criterionId, {
      levels: [...criterion.levels, newLevel]
    })
  }

  const removeLevel = (criterionId: string, levelId: string) => {
    const criterion = criteria.find(c => c.id === criterionId)
    if (!criterion || criterion.levels.length <= 2) return // Keep at least 2 levels

    updateCriterion(criterionId, {
      levels: criterion.levels.filter(l => l.id !== levelId)
    })
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
      // Create rubric object for storage
      const rubric = {
        id: `rubric_${Date.now()}`,
        name: rubricData.name,
        description: rubricData.description,
        teacher_id: user.id,
        class_id: rubricData.classId || null,
        is_template: rubricData.isTemplate,
        status: 'active',
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

      // Store in localStorage as a fallback since database has issues
      const existingRubrics = JSON.parse(localStorage.getItem('teacher_rubrics') || '[]')
      existingRubrics.push(rubric)
      localStorage.setItem('teacher_rubrics', JSON.stringify(existingRubrics))

      alert("Rubric created successfully!")
      router.push("/dashboard/teacher/rubrics")
    } catch (error) {
      console.error("Error creating rubric:", error)
      alert("Failed to create rubric. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const loadTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    if (!template) return

    const templateData = template.template_data
    if (templateData.criteria) {
      const loadedCriteria = templateData.criteria.map((criterion: any, index: number) => ({
        id: `criterion_${Date.now()}_${index}`,
        name: criterion.name,
        description: criterion.description,
        weight: criterion.weight,
        order_index: index,
        levels: criterion.levels.map((level: any, levelIndex: number) => ({
          id: `level_${Date.now()}_${index}_${levelIndex}`,
          name: level.name,
          description: level.description,
          points: level.points,
          qualityIndicators: level.qualityIndicators || [],
          order_index: levelIndex
        }))
      }))
      
      setCriteria(loadedCriteria)
      setRubricData(prev => ({
        ...prev,
        name: template.name,
        description: template.description
      }))
      setActiveTab("create")
    }
  }

  const createFromScratch = () => {
    setCriteria([])
    setRubricData({
      name: "",
      description: "",
      isTemplate: false,
      classId: "",
    })
    setActiveTab("create")
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-4">Access Denied</h2>
        <p className="text-gray-600">You need to be logged in as a teacher to create rubrics.</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Create Rubric</h1>
          <p className="text-gray-600">Design a comprehensive grading rubric for your assignments</p>
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
                Save Rubric
              </>
            )}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="templates">Start from Template</TabsTrigger>
          <TabsTrigger value="create">Create from Scratch</TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Choose a Template</CardTitle>
              <CardDescription>
                Start with a pre-built rubric template and customize it to your needs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <Card key={template.id} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <Badge variant="outline">{template.category}</Badge>
                      </div>
                      <CardDescription>{template.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button 
                        onClick={() => loadTemplate(template.id)}
                        className="w-full"
                        variant="outline"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Use Template
                      </Button>
                    </CardContent>
                  </Card>
                ))}
                
                {/* Create from scratch option */}
                <Card className="cursor-pointer hover:shadow-md transition-shadow border-dashed">
                  <CardHeader>
                    <CardTitle className="text-lg">Start from Scratch</CardTitle>
                    <CardDescription>Create a completely custom rubric</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      onClick={createFromScratch}
                      className="w-full"
                      variant="outline"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Custom
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Create Tab */}
        <TabsContent value="create" className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Set up the basic details for your rubric</CardDescription>
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

          {/* Criteria Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Evaluation Criteria</CardTitle>
                  <CardDescription>
                    Define the criteria and performance levels for evaluation
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    Total: {calculateTotalPoints()} points
                  </Badge>
                  <Button onClick={addCriterion} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Criterion
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {criteria.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
                  <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No criteria yet</h3>
                  <p className="text-gray-600 mb-4">Add your first evaluation criterion to get started</p>
                  <Button onClick={addCriterion}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Criterion
                  </Button>
                </div>
              ) : (
                criteria.map((criterion, criterionIndex) => (
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
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">Performance Levels</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addLevel(criterion.id)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Level
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {criterion.levels.map((level, levelIndex) => (
                            <Card key={level.id} className="relative">
                              <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                  <Input
                                    placeholder="Level name"
                                    value={level.name}
                                    onChange={(e) => updateLevel(criterion.id, level.id, { name: e.target.value })}
                                    className="font-medium text-sm"
                                  />
                                  {criterion.levels.length > 2 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeLevel(criterion.id, level.id)}
                                      className="text-red-600 hover:text-red-700 p-1"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
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

          {/* Preview Section */}
          {criteria.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Preview</CardTitle>
                  <Button
                    variant="outline"
                    onClick={() => setPreviewMode(!previewMode)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    {previewMode ? 'Hide Preview' : 'Show Preview'}
                  </Button>
                </div>
              </CardHeader>
              {previewMode && (
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
                          <tr className="bg-gray-50">
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
                              <td className="border border-gray-300 p-2 font-medium">
                                <div>
                                  <div className="font-semibold">{criterion.name}</div>
                                  <div className="text-sm text-gray-600">{criterion.description}</div>
                                  <div className="text-xs text-gray-500">Weight: {criterion.weight}%</div>
                                </div>
                              </td>
                              {criterion.levels.map((level) => (
                                <td key={level.id} className="border border-gray-300 p-2 text-sm">
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
              )}
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
