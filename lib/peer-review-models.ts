export interface PeerReviewAssignment {
  id: string
  title: string
  description: string
  assignmentId: string // Original assignment being reviewed
  classId: string
  teacherId: string
  reviewType: "anonymous" | "named" | "blind" // blind = reviewers see work but not author names
  reviewMethod: "random" | "manual" | "self-select"
  reviewsPerStudent: number // How many reviews each student must complete
  reviewsPerSubmission: number // How many reviews each submission receives
  rubricId?: string
  customQuestions: PeerReviewQuestion[]
  settings: {
    allowSelfReview: boolean
    requireAllReviews: boolean // Must complete all reviews to see own feedback
    showReviewerNames: boolean
    enableReviewOfReviews: boolean // Students can rate review quality
    deadlineOffset: number // Days after original assignment deadline
  }
  status: "draft" | "active" | "completed" | "closed"
  startDate: Date
  endDate: Date
  createdAt: Date
  updatedAt: Date
}

export interface PeerReviewQuestion {
  id: string
  type: "rating" | "text" | "multiple_choice" | "checklist"
  question: string
  description?: string
  required: boolean
  options?: string[] // For multiple choice
  scale?: {
    min: number
    max: number
    labels?: { [key: number]: string }
  }
  weight: number // For calculating overall review score
}

export interface PeerReviewAssignmentPair {
  id: string
  reviewAssignmentId: string
  reviewerId: string // Student doing the review
  submissionId: string // Submission being reviewed
  authorId: string // Student who created the submission
  status: "pending" | "in_progress" | "completed" | "overdue"
  assignedAt: Date
  startedAt?: Date
  completedAt?: Date
  remindersSent: number
}

export interface PeerReview {
  id: string
  pairId: string
  reviewAssignmentId: string
  reviewerId: string
  submissionId: string
  authorId: string
  responses: PeerReviewResponse[]
  overallRating?: number
  overallComments?: string
  strengths: string[]
  improvements: string[]
  isAnonymous: boolean
  status: "draft" | "submitted" | "flagged" | "approved"
  timeSpent: number // Minutes spent on review
  submittedAt?: Date
  flaggedReason?: string
  moderatorNotes?: string
}

export interface PeerReviewResponse {
  questionId: string
  type: "rating" | "text" | "multiple_choice" | "checklist"
  value: string | number | string[]
  comments?: string
}

export interface ReviewQualityRating {
  id: string
  reviewId: string
  raterId: string // Student rating the review quality
  helpfulness: number // 1-5 scale
  specificity: number // 1-5 scale
  constructiveness: number // 1-5 scale
  comments?: string
  submittedAt: Date
}

export interface PeerReviewTemplate {
  id: string
  name: string
  description: string
  teacherId: string
  subject: string
  questions: PeerReviewQuestion[]
  isPublic: boolean
  usageCount: number
  createdAt: Date
}

// Mock data stores
export const peerReviewAssignments: PeerReviewAssignment[] = [
  {
    id: "peer_assign_1",
    title: "Essay Peer Review",
    description: "Review your classmates' essays and provide constructive feedback",
    assignmentId: "assign_1",
    classId: "class_1",
    teacherId: "1",
    reviewType: "anonymous",
    reviewMethod: "random",
    reviewsPerStudent: 2,
    reviewsPerSubmission: 3,
    customQuestions: [
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
        question: "What is the strongest part of this essay?",
        description: "Identify specific strengths in the writing",
        required: true,
        weight: 15,
      },
      {
        id: "q3",
        type: "text",
        question: "What could be improved?",
        description: "Provide specific, constructive suggestions",
        required: true,
        weight: 15,
      },
      {
        id: "q4",
        type: "checklist",
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
        weight: 25,
      },
      {
        id: "q5",
        type: "rating",
        question: "Overall quality of the essay",
        required: true,
        scale: { min: 1, max: 10 },
        weight: 25,
      },
    ],
    settings: {
      allowSelfReview: false,
      requireAllReviews: true,
      showReviewerNames: false,
      enableReviewOfReviews: true,
      deadlineOffset: 3,
    },
    status: "active",
    startDate: new Date("2024-01-16"),
    endDate: new Date("2024-01-20"),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

export const peerReviewPairs: PeerReviewAssignmentPair[] = [
  {
    id: "pair_1",
    reviewAssignmentId: "peer_assign_1",
    reviewerId: "2",
    submissionId: "sub_1",
    authorId: "3",
    status: "completed",
    assignedAt: new Date("2024-01-16"),
    startedAt: new Date("2024-01-16"),
    completedAt: new Date("2024-01-17"),
    remindersSent: 0,
  },
  {
    id: "pair_2",
    reviewAssignmentId: "peer_assign_1",
    reviewerId: "2",
    submissionId: "sub_2",
    authorId: "4",
    status: "in_progress",
    assignedAt: new Date("2024-01-16"),
    startedAt: new Date("2024-01-17"),
    remindersSent: 1,
  },
]

export const peerReviews: PeerReview[] = [
  {
    id: "review_1",
    pairId: "pair_1",
    reviewAssignmentId: "peer_assign_1",
    reviewerId: "2",
    submissionId: "sub_1",
    authorId: "3",
    responses: [
      { questionId: "q1", type: "rating", value: 4, comments: "Thesis is clear but could be stronger" },
      {
        questionId: "q2",
        type: "text",
        value: "The introduction effectively hooks the reader and the examples are relevant",
      },
      {
        questionId: "q3",
        type: "text",
        value: "The conclusion could be more impactful and tie back to the thesis more clearly",
      },
      {
        questionId: "q4",
        type: "checklist",
        value: ["Clear introduction", "Strong thesis statement", "Supporting evidence", "Logical organization"],
      },
      { questionId: "q5", type: "rating", value: 7 },
    ],
    overallRating: 7,
    overallComments: "Good essay with strong content. Focus on strengthening the conclusion and thesis statement.",
    strengths: ["Clear writing style", "Good use of examples", "Logical flow"],
    improvements: ["Stronger thesis", "More impactful conclusion", "Better transitions between paragraphs"],
    isAnonymous: true,
    status: "submitted",
    timeSpent: 25,
    submittedAt: new Date("2024-01-17"),
  },
]

export const reviewQualityRatings: ReviewQualityRating[] = [
  {
    id: "quality_1",
    reviewId: "review_1",
    raterId: "3",
    helpfulness: 4,
    specificity: 4,
    constructiveness: 5,
    comments: "Very helpful feedback with specific suggestions for improvement",
    submittedAt: new Date("2024-01-18"),
  },
]

export const peerReviewTemplates: PeerReviewTemplate[] = [
  {
    id: "template_1",
    name: "Essay Review Template",
    description: "Comprehensive template for reviewing written essays",
    teacherId: "1",
    subject: "English",
    questions: [
      {
        id: "t1_q1",
        type: "rating",
        question: "How clear is the thesis statement?",
        required: true,
        scale: { min: 1, max: 5 },
        weight: 20,
      },
      {
        id: "t1_q2",
        type: "text",
        question: "What is the strongest part of this essay?",
        required: true,
        weight: 25,
      },
      {
        id: "t1_q3",
        type: "text",
        question: "What could be improved?",
        required: true,
        weight: 25,
      },
      {
        id: "t1_q4",
        type: "rating",
        question: "Overall quality",
        required: true,
        scale: { min: 1, max: 10 },
        weight: 30,
      },
    ],
    isPublic: true,
    usageCount: 15,
    createdAt: new Date(),
  },
]
