"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  ArrowLeft, 
  Edit, 
  Copy, 
  Trash2, 
  FileText, 
  Star, 
  Users, 
  Calendar,
  BarChart3,
  Settings
} from "lucide-react"

interface RubricData {
  id: string
  name: string
  description: string
  total_points: number
  usage_count: number
  status: string
  created_at: string
  is_template: boolean
  class_name?: string
}

interface Criterion {
  id: string
  name: string
  description: string
  weight: number
  order_index: number
  levels: Level[]
}

interface Level {
  id: string
  name: string
  description: string
  points: number
  order_index: number
  quality_indicators: QualityIndicator[]
}

interface QualityIndicator {
  id: string
  indicator: string
  order_index: number
}

export default function RubricDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { user } = useAuth()
  const [rubric, setRubric] = useState<RubricData | null>(null)
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("overview")

  const supabase = createClient()

  useEffect(() => {
    if (user && params.id) {
      fetchRubricData()
    }
  }, [user, params.id])

  const fetchRubricData = async () => {
    try {
      // Fetch rubric basic info
      const { data: rubricData, error: rubricError } = await supabase
        .from('rubrics')
        .select(`
          id,
          name,
          description,
          total_points,
          usage_count,
          status,
          created_at,
          is_template,
          classes(name)
        `)
        .eq('id', params.id)
        .eq('teacher_id', user.id)
        .single()

      if (rubricError) throw rubricError

      setRubric({
        ...rubricData,
        class_name: rubricData.classes?.name
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
            quality_indicators: level.rubric_quality_indicators
              ?.sort((a, b) => a.order_index - b.order_index) || []
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

  const duplicateRubric = async () => {
    if (!rubric || !user) return

    try {
      const newName = `${rubric.name} (Copy)`
      
      // Create new rubric
      const { data: newRubric, error: rubricError } = await supabase
        .from('rubrics')
        .insert({
          name: newName,
          description: rubric.description,
          teacher_id: user.id,
          status: 'draft'
        })
        .select()
        .single()

      if (rubricError) throw rubricError

      // Duplicate criteria and levels
      for (const criterion of criteria) {
        const { data: newCriterion, error: criterionError } = await supabase
          .from('rubric_criteria')
          .insert({
            rubric_id: newRubric.id,
            name: criterion.name,
            description: criterion.description,
            weight: criterion.weight,
            order_index: criterion.order_index
          })
          .select()
          .single()

        if (criterionError) throw criterionError

        // Duplicate levels
        for (const level of criterion.levels) {
          const { data: newLevel, error: levelError } = await supabase
            .from('rubric_levels')
            .insert({
              criterion_id: newCriterion.id,
              name: level.name,
              description: level.description,
              points: level.points,
              order_index: level.order_index
            })
            .select()
            .single()

          if (levelError) throw levelError

          // Duplicate quality indicators
          if (level.quality_indicators.length > 0) {
            const indicators = level.quality_indicators.map(indicator => ({
              level_id: newLevel.id,
              indicator: indicator.indicator,
              order_index: indicator.order_index
            }))

            const { error: indicatorError } = await supabase
              .from('rubric_quality_indicators')
              .insert(indicators)

            if (indicatorError) throw indicatorError
          }
        }
      }

      alert('Rubric duplicated successfully!')
      router.push(`/dashboard/teacher/rubrics/${newRubric.id}/edit`)
    } catch (error) {
      console.error('Error duplicating rubric:', error)
      alert('Failed to duplicate rubric')
    }
  }

  const deleteRubric = async () => {
    if (!rubric) return

    if (rubric.usage_count > 0) {
      alert('Cannot delete a rubric that has been used in assignments. Archive it instead.')
      return
    }

    if (!confirm('Are you sure you want to delete this rubric? This action cannot be undone.')) {
      return
    }

    try {
      const { error } = await supabase
        .from('rubrics')
        .delete()
        .eq('id', rubric.id)

      if (error) throw error

      alert('Rubric deleted successfully!')
      router.push('/dashboard/teacher/rubrics')
    } catch (error) {
      console.error('Error deleting rubric:', error)
      alert('Failed to delete rubric')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!rubric) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-4">Rubric Not Found</h2>
        <p className="text-gray-600 mb-4">The rubric you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Link href="/dashboard/teacher/rubrics">
          <Button>Back to Rubrics</Button>
        </Link>
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
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{rubric.name}</h1>
              <Badge variant={rubric.status === 'active' ? 'default' : 'secondary'}>
                {rubric.status}
              </Badge>
              {rubric.is_template && (
                <Badge variant="outline">Template</Badge>
              )}
            </div>
            <p className="text-gray-600">{rubric.description}</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={duplicateRubric}>
            <Copy className="h-4 w-4 mr-2" />
            Duplicate
          </Button>
          <Link href={`/dashboard/teacher/rubrics/${rubric.id}/edit`}>
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
          <Button variant="destructive" onClick={deleteRubric}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500" />
              <div>
                <p className="text-sm text-gray-600">Total Points</p>
                <p className="text-2xl font-bold">{rubric.total_points}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-sm text-gray-600">Criteria</p>
                <p className="text-2xl font-bold">{criteria.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-sm text-gray-600">Times Used</p>
                <p className="text-2xl font-bold">{rubric.usage_count}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-sm text-gray-600">Created</p>
                <p className="text-sm font-medium">
                  {new Date(rubric.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="space-y-6">
            {criteria.map((criterion) => (
              <Card key={criterion.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{criterion.name}</CardTitle>
                      <CardDescription>{criterion.description}</CardDescription>
                    </div>
                    <Badge variant="outline">{criterion.weight}% weight</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {criterion.levels.map((level) => (
                      <Card key={level.id} className="border-l-4 border-l-blue-500">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm">{level.name}</CardTitle>
                            <Badge variant="secondary">{level.points} pts</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-2">
                          <p className="text-sm text-gray-600 mb-3">{level.description}</p>
                          {level.quality_indicators.length > 0 && (
                            <div>
                              <p className="text-xs font-medium mb-2">Quality Indicators:</p>
                              <ul className="text-xs text-gray-600 space-y-1">
                                {level.quality_indicators.map((indicator) => (
                                  <li key={indicator.id} className="flex items-start gap-1">
                                    <span className="text-blue-500">•</span>
                                    {indicator.indicator}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="preview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Rubric Preview</CardTitle>
              <CardDescription>How this rubric will appear to students</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="text-xl font-bold">{rubric.name}</h3>
                  {rubric.description && (
                    <p className="text-gray-600 mt-2">{rubric.description}</p>
                  )}
                  <p className="text-sm text-gray-500 mt-2">Total Points: {rubric.total_points}</p>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 p-3 text-left">Criteria</th>
                        {criteria[0]?.levels.map((level) => (
                          <th key={level.id} className="border border-gray-300 p-3 text-center">
                            {level.name} ({level.points} pts)
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {criteria.map((criterion) => (
                        <tr key={criterion.id}>
                          <td className="border border-gray-300 p-3 font-medium">
                            <div>
                              <div className="font-semibold">{criterion.name}</div>
                              <div className="text-sm text-gray-600">{criterion.description}</div>
                              <div className="text-xs text-gray-500">Weight: {criterion.weight}%</div>
                            </div>
                          </td>
                          {criterion.levels.map((level) => (
                            <td key={level.id} className="border border-gray-300 p-3 text-sm">
                              <div className="space-y-2">
                                <div className="font-medium">{level.description}</div>
                                {level.quality_indicators.length > 0 && (
                                  <ul className="text-xs text-gray-600 list-disc list-inside">
                                    {level.quality_indicators.map((indicator) => (
                                      <li key={indicator.id}>{indicator.indicator}</li>
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
        </TabsContent>

        <TabsContent value="usage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Usage Statistics</CardTitle>
              <CardDescription>How this rubric has been used</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Rubric Usage</h3>
                <p className="text-gray-600">
                  This rubric can be used across multiple assignments and classes.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}