export interface Rubric {
  id: string
  name: string
  description?: string
  teacherId: string
  classId?: string
  isTemplate: boolean
  criteria: RubricCriterion[]
  totalPoints: number
  createdAt: Date
  updatedAt: Date
}

export interface RubricCriterion {
  id: string
  name: string
  description?: string
  weight: number // percentage of total grade
  levels: RubricLevel[]
}

export interface RubricLevel {
  id: string
  name: string
  description: string
  points: number
  qualityIndicators?: string[]
}

export interface Grade {
  id: string
  submissionId: string
  assignmentId: string
  studentId: string
  teacherId: string
  rubricId?: string
  criteriaGrades: CriterionGrade[]
  totalPoints: number
  maxPoints: number
  percentage: number
  letterGrade?: string
  feedback: GradeFeedback
  status: "draft" | "published" | "returned"
  gradedAt: Date
  publishedAt?: Date
}

export interface CriterionGrade {
  criterionId: string
  levelId: string
  points: number
  feedback?: string
}

export interface GradeFeedback {
  overallComments?: string
  strengths?: string[]
  improvements?: string[]
  annotations?: Annotation[]
  audioFeedback?: string
  videoFeedback?: string
}

export interface Annotation {
  id: string
  type: "highlight" | "comment" | "suggestion"
  content: string
  position?: {
    page?: number
    x: number
    y: number
    width?: number
    height?: number
  }
  timestamp: Date
}

export interface GradeTemplate {
  id: string
  name: string
  teacherId: string
  rubricId: string
  feedbackTemplate: {
    strengthsTemplates: string[]
    improvementTemplates: string[]
    commentTemplates: string[]
  }
  createdAt: Date
}

// Mock data stores
export const rubrics: Rubric[] = [
  {
    id: "rubric_1",
    name: "Essay Writing Rubric",
    description: "Comprehensive rubric for evaluating written essays",
    teacherId: "1",
    classId: "class_1",
    isTemplate: false,
    totalPoints: 100,
    criteria: [
      {
        id: "crit_1",
        name: "Content & Ideas",
        description: "Quality and relevance of ideas presented",
        weight: 40,
        levels: [
          {
            id: "level_1_1",
            name: "Excellent",
            description: "Ideas are original, well-developed, and highly relevant",
            points: 40,
            qualityIndicators: [
              "Original and creative thinking",
              "Well-developed arguments",
              "Highly relevant to topic",
            ],
          },
          {
            id: "level_1_2",
            name: "Good",
            description: "Ideas are clear and mostly relevant",
            points: 32,
            qualityIndicators: ["Clear thinking", "Adequate development", "Mostly relevant"],
          },
          {
            id: "level_1_3",
            name: "Satisfactory",
            description: "Ideas are basic but acceptable",
            points: 24,
            qualityIndicators: ["Basic understanding", "Limited development", "Somewhat relevant"],
          },
          {
            id: "level_1_4",
            name: "Needs Improvement",
            description: "Ideas are unclear or irrelevant",
            points: 16,
            qualityIndicators: ["Unclear thinking", "Poor development", "Not relevant"],
          },
        ],
      },
      {
        id: "crit_2",
        name: "Organization",
        description: "Structure and flow of the writing",
        weight: 25,
        levels: [
          {
            id: "level_2_1",
            name: "Excellent",
            description: "Clear structure with smooth transitions",
            points: 25,
          },
          {
            id: "level_2_2",
            name: "Good",
            description: "Generally well organized",
            points: 20,
          },
          {
            id: "level_2_3",
            name: "Satisfactory",
            description: "Basic organization present",
            points: 15,
          },
          {
            id: "level_2_4",
            name: "Needs Improvement",
            description: "Poor or no clear organization",
            points: 10,
          },
        ],
      },
      {
        id: "crit_3",
        name: "Grammar & Mechanics",
        description: "Proper use of grammar, spelling, and punctuation",
        weight: 20,
        levels: [
          {
            id: "level_3_1",
            name: "Excellent",
            description: "Virtually no errors",
            points: 20,
          },
          {
            id: "level_3_2",
            name: "Good",
            description: "Few minor errors",
            points: 16,
          },
          {
            id: "level_3_3",
            name: "Satisfactory",
            description: "Some errors but don't interfere with meaning",
            points: 12,
          },
          {
            id: "level_3_4",
            name: "Needs Improvement",
            description: "Many errors that interfere with understanding",
            points: 8,
          },
        ],
      },
      {
        id: "crit_4",
        name: "Citations & Sources",
        description: "Proper use and citation of sources",
        weight: 15,
        levels: [
          {
            id: "level_4_1",
            name: "Excellent",
            description: "Perfect citations and credible sources",
            points: 15,
          },
          {
            id: "level_4_2",
            name: "Good",
            description: "Good citations with minor errors",
            points: 12,
          },
          {
            id: "level_4_3",
            name: "Satisfactory",
            description: "Adequate citations",
            points: 9,
          },
          {
            id: "level_4_4",
            name: "Needs Improvement",
            description: "Poor or missing citations",
            points: 6,
          },
        ],
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

export const grades: Grade[] = [
  {
    id: "grade_1",
    submissionId: "sub_1",
    assignmentId: "assign_2",
    studentId: "2",
    teacherId: "1",
    rubricId: "rubric_1",
    criteriaGrades: [
      { criterionId: "crit_1", levelId: "level_1_2", points: 32, feedback: "Good ideas but could be more developed" },
      { criterionId: "crit_2", levelId: "level_2_1", points: 25, feedback: "Excellent organization and flow" },
      { criterionId: "crit_3", levelId: "level_3_2", points: 16, feedback: "Few minor grammar errors" },
      { criterionId: "crit_4", levelId: "level_4_3", points: 9, feedback: "Citations need improvement" },
    ],
    totalPoints: 82,
    maxPoints: 100,
    percentage: 82,
    letterGrade: "B+",
    feedback: {
      overallComments:
        "Good work overall! Your ideas are clear and well-organized. Focus on developing your arguments further and improving your citation format.",
      strengths: ["Clear and logical organization", "Good understanding of the topic", "Engaging writing style"],
      improvements: [
        "Develop arguments with more detail and examples",
        "Improve citation format according to APA guidelines",
        "Proofread for minor grammar errors",
      ],
      annotations: [],
    },
    status: "published",
    gradedAt: new Date("2024-01-12"),
    publishedAt: new Date("2024-01-12"),
  },
]

export const gradeTemplates: GradeTemplate[] = [
  {
    id: "template_1",
    name: "Essay Feedback Template",
    teacherId: "1",
    rubricId: "rubric_1",
    feedbackTemplate: {
      strengthsTemplates: [
        "Clear and logical organization",
        "Strong understanding of the topic",
        "Engaging writing style",
        "Good use of examples",
        "Creative approach to the topic",
      ],
      improvementTemplates: [
        "Develop arguments with more detail",
        "Improve citation format",
        "Proofread for grammar errors",
        "Add more supporting evidence",
        "Strengthen the conclusion",
      ],
      commentTemplates: [
        "Good work! Keep up the excellent effort.",
        "You're making great progress. Focus on [specific area] for next time.",
        "This shows good understanding. Consider expanding on [specific point].",
        "Well done! Your improvement in [area] is noticeable.",
      ],
    },
    createdAt: new Date(),
  },
]
