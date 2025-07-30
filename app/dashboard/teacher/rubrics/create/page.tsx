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
import { useAuth } from "@/contexts/auth-context"
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

  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()

  const addCriterion = () => {
    const newCriterion: RubricCriterion = {
      id: `criterion_${new Date().toISOString()}`,
      name: "",
      description: "",
      weight: 25,
      levels: [
        {
          id: `level_${new Date().toISOString()}_1`,
          name: "Excellent",
          description: "",
          points: 4,
          qualityIndicators: [],
        },
        {
          id: `level_${new Date().toISOString()}_2`,
          name: "Good",
          description: "",
          points: 3,
          qualityIndicators: [],
        },
        {
          id: `level_${new Date().toISOString()}_3`,
          name: "Satisfactory",
          description: "",
          points: 2,
          qualityIndicators: [],
        },
        {
          id: `level_${new Date().toISOString()}_4`,
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
    if (!user) {
      alert("You must be logged in to save a rubric.")
      return
    }

    const rubricPayload = {
      name: rubricData.name,
      description: rubricData.description,
      is_template: rubricData.isTemplate,
      teacher_id: user.id,
      class_id: rubricData.classId || null, // Assuming classId can be optional
      criteria: JSON.stringify(criteria), // Store criteria as JSON string
      total_points: calculateTotalPoints(),
    }

    try {
      const { error } = await supabase.from('rubrics').insert([rubricPayload])

      if (error) {
        console.error("Error creating rubric:", error)
        alert(error.message || "Failed to create rubric")
      } else {
        alert("Rubric created successfully!")
        router.push("/dashboard/teacher/rubrics")
      }
    } catch (error) {
      console.error("Error creating rubric:", error)
      alert("An error occurred while saving the rubric.")
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
              qualityIndicators: ["Few minor errors", "Generally correct"],
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

  if (authLoading) {
    return <div>Loading...</div>
  }

  if (!user || user.role !== 'teacher') {
    return <div>Access Denied</div>
  }

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">Create Rubric</h1>
      <p>Rubric creation interface coming soon...</p>
    </div>
  )
}
