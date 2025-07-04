export interface Institution {
  id: string
  name: string
  domain?: string
  settings: {
    allowSelfRegistration: boolean
    requireApproval: boolean
  }
  createdAt: Date
  updatedAt: Date
}

export interface Class {
  id: string
  name: string
  code: string
  description?: string
  teacherId: string
  institutionId?: string
  settings: {
    allowStudentJoin: boolean
    requireApproval: boolean
    isArchived: boolean
  }
  createdAt: Date
  updatedAt: Date
}

export interface ClassEnrollment {
  id: string
  classId: string
  studentId: string
  enrolledAt: Date
  status: "active" | "inactive" | "pending"
}

export interface Assignment {
  id: string
  title: string
  description?: string
  classId: string
  teacherId: string
  dueDate: Date
  maxPoints?: number
  allowLateSubmission: boolean
  instructions?: string
  attachments?: string[]
  status: "draft" | "published" | "closed"
  createdAt: Date
  updatedAt: Date
}

export interface Submission {
  id: string
  assignmentId: string
  studentId: string
  content?: string
  attachments?: string[]
  submittedAt: Date
  status: "submitted" | "graded" | "returned"
  grade?: number
  feedback?: string
  gradedAt?: Date
  gradedBy?: string
}

export interface Notification {
  id: string
  userId: string
  title: string
  message: string
  type: "assignment" | "grade" | "class" | "system"
  read: boolean
  createdAt: Date
}

export interface Department {
  id: string
  name: string
  institutionId: string
  createdAt: Date
  updatedAt: Date
}

export interface DepartmentMember {
  id: string
  departmentId: string
  userId: string
  role: "teacher" | "student"
  createdAt: Date
}

// Mock data stores
export const institutions: Institution[] = [
  {
    id: "inst_1",
    name: "Demo High School",
    domain: "demo.edu",
    settings: {
      allowSelfRegistration: true,
      requireApproval: false,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

export const classes: Class[] = [
  {
    id: "class_1",
    name: "Grade 11 Biology",
    code: "BIO11A",
    description: "Advanced Biology course covering cellular structure, genetics, and ecology",
    teacherId: "1",
    institutionId: "inst_1",
    settings: {
      allowStudentJoin: true,
      requireApproval: false,
      isArchived: false,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "class_2",
    name: "Grade 10 Chemistry",
    code: "CHEM10B",
    description: "Introduction to Chemistry fundamentals",
    teacherId: "1",
    institutionId: "inst_1",
    settings: {
      allowStudentJoin: true,
      requireApproval: false,
      isArchived: false,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "class_3",
    name: "Advanced Physics",
    code: "PHYS12A",
    description: "Advanced Physics for senior students",
    teacherId: "1",
    institutionId: "inst_1",
    settings: {
      allowStudentJoin: true,
      requireApproval: false,
      isArchived: false,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

export const enrollments: ClassEnrollment[] = [
  { id: "enroll_1", classId: "class_1", studentId: "2", enrolledAt: new Date(), status: "active" },
  { id: "enroll_2", classId: "class_2", studentId: "2", enrolledAt: new Date(), status: "active" },
  { id: "enroll_3", classId: "class_3", studentId: "2", enrolledAt: new Date(), status: "active" },
]

export const assignments: Assignment[] = [
  {
    id: "assign_1",
    title: "Cell Structure Lab Report",
    description: "Complete the lab report on cell structure observations",
    classId: "class_1",
    teacherId: "1",
    dueDate: new Date("2024-01-15"),
    maxPoints: 100,
    allowLateSubmission: true,
    status: "published",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "assign_2",
    title: "Chemical Reactions Quiz",
    description: "Online quiz covering chemical reactions",
    classId: "class_2",
    teacherId: "1",
    dueDate: new Date("2024-01-12"),
    maxPoints: 50,
    allowLateSubmission: false,
    status: "published",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "assign_3",
    title: "Newton's Laws Project",
    description: "Group project on Newton's laws of motion",
    classId: "class_3",
    teacherId: "1",
    dueDate: new Date("2024-01-20"),
    maxPoints: 150,
    allowLateSubmission: true,
    status: "published",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

export const submissions: Submission[] = [
  {
    id: "sub_1",
    assignmentId: "assign_2",
    studentId: "2",
    content: "Quiz completed",
    submittedAt: new Date("2024-01-11"),
    status: "graded",
    grade: 45,
    feedback: "Good work! Minor errors in question 3.",
    gradedAt: new Date("2024-01-12"),
    gradedBy: "1",
  },
]
