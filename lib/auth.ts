import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: "teacher" | "student" | "institution"
  institutionId?: string
  institutionName?: string
  createdAt: Date
  updatedAt: Date
}

export interface Session {
  userId: string
  email: string
  role: string
  institutionId?: string
  expiresAt: Date
}

// Mock database - replace with actual database
const users: User[] = [
  {
    id: "1",
    email: "teacher@demo.com",
    firstName: "Sarah",
    lastName: "Johnson",
    role: "teacher",
    institutionName: "Demo High School",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "2",
    email: "student@demo.com",
    firstName: "Alex",
    lastName: "Thompson",
    role: "student",
    institutionName: "Demo High School",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "3",
    email: "admin@demo.com",
    firstName: "John",
    lastName: "Administrator",
    role: "institution",
    institutionId: "inst_1",
    institutionName: "Demo High School",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

const sessions: Map<string, Session> = new Map()

export async function createSession(user: User): Promise<string> {
  const sessionId = generateSessionId()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const session: Session = {
    userId: user.id,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    expiresAt,
  }

  sessions.set(sessionId, session)

  // Set cookie
  const cookieStore = await cookies()
  cookieStore.set("session", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
  })

  return sessionId
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get("session")?.value

  if (!sessionId) return null

  const session = sessions.get(sessionId)
  if (!session) return null

  if (session.expiresAt < new Date()) {
    sessions.delete(sessionId)
    return null
  }

  return session
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get("session")?.value

  if (sessionId) {
    sessions.delete(sessionId)
  }

  cookieStore.delete("session")
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession()
  if (!session) return null

  return users.find((user) => user.id === session.userId) || null
}

export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/auth/login")
  }
  return user
}

export async function requireRole(allowedRoles: string[]): Promise<User> {
  const user = await requireAuth()
  if (!allowedRoles.includes(user.role)) {
    redirect("/unauthorized")
  }
  return user
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  // Mock authentication - replace with actual password verification
  if (password !== "demo123") return null

  return users.find((user) => user.email === email) || null
}

export async function createUser(userData: {
  email: string
  firstName: string
  lastName: string
  role: "teacher" | "student" | "institution"
  institutionName?: string
  password: string
}): Promise<User> {
  const newUser: User = {
    id: generateUserId(),
    email: userData.email,
    firstName: userData.firstName,
    lastName: userData.lastName,
    role: userData.role,
    institutionName: userData.institutionName,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  users.push(newUser)
  return newUser
}

function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

function generateUserId(): string {
  return "user_" + Math.random().toString(36).substring(2) + Date.now().toString(36)
}
