import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "../lib/supabase-server"

export interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  role: "teacher" | "student" | "institution"
  institution_id?: string
  institution_name?: string
  department_id?: string
  created_at: string
  updated_at: string
}

export interface Session {
  userId: string
  email: string
  role: string
  institutionId?: string
  expiresAt: Date
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
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    console.error("Supabase authentication error:", error)
    return null
  }

  if (!data.user) {
    return null
  }

  // Fetch user profile from your 'users' table
  const { data: userProfile, error: profileError } = await supabase
    .from("users")
    .select("*")
    .eq("id", data.user.id)
    .single()

  if (profileError) {
    console.error("Error fetching user profile:", profileError)
    return null
  }

  return userProfile as User
}

export async function createUser(userData: {
  email: string
  firstName: string
  lastName: string
  role: "teacher" | "student" | "institution"
  institutionName?: string
  password: string
}): Promise<User | null> {
  const supabase = createClient()

  const { data, error } = await supabase.auth.signUp({
    email: userData.email,
    password: userData.password,
    options: {
      data: {
        first_name: userData.firstName,
        last_name: userData.lastName,
        role: userData.role,
        institution_name: userData.institutionName,
      },
    },
  })

  if (error) {
    console.error("Supabase sign up error:", error)
    return null
  }

  if (!data.user) {
    return null
  }

  // Insert into your public.users table
  const { data: newUserProfile, error: insertError } = await supabase
    .from("users")
    .insert([
      {
        id: data.user.id,
        email: userData.email,
        first_name: userData.firstName,
        last_name: userData.lastName,
        role: userData.role,
        institution_name: userData.institutionName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
    .select()
    .single()

  if (insertError) {
    console.error("Error inserting new user profile:", insertError)
    return null
  }

  return newUserProfile as User
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error) {
    console.error("Error getting current user:", error)
    return null
  }

  if (!user) {
    return null
  }

  const { data: userProfile, error: profileError } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single()

  if (profileError) {
    console.error("Error fetching user profile:", profileError)
    return null
  }

  return userProfile as User
}

export async function deleteSession(): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error("Error signing out:", error)
  }
}



