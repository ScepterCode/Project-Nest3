"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import type { User } from "@/lib/auth"
import { createClient } from "@/lib/supabase-client"

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; redirectUrl?: string }>
  logout: () => Promise<void>
  register: (userData: {
    firstName: string
    lastName: string
    email: string
    password: string
    role: "teacher" | "student" | "institution"
    institutionName?: string
  }) => Promise<{ success: boolean; redirectUrl?: string }>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const refreshUser = async () => {
    try {
      const { data: { user: supabaseUser }, error } = await supabase.auth.getUser()

      if (error) {
        console.error("Supabase get user error:", error)
        setUser(null)
        return
      }

      if (supabaseUser) {
        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', supabaseUser.id)
          .single()

        if (profileError) {
          console.error("Error fetching user profile:", profileError, JSON.stringify(profileError, null, 2))
          setUser(null)
          return
        }
        setUser(userProfile as User)
      } else {
        setUser(null)
      }
    } catch (error) {
      console.error("Failed to fetch user:", error)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const login = async (email: string, password: string): Promise<{ success: boolean; redirectUrl?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error("Supabase login error:", error)
        return { success: false }
      }

      if (data.user) {
        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('role')
          .eq('id', data.user.id)
          .single()

        if (profileError) {
          console.error("Error fetching user profile:", profileError)
          return { success: false }
        }

        const redirectUrl = `/dashboard/${userProfile.role}`
        await refreshUser()
        return { success: true, redirectUrl }
      }
      return { success: false }
    } catch (error) {
      console.error("Login error:", error)
      return { success: false }
    }
  }

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error("Supabase logout error:", error)
      }
      setUser(null)
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  const register = async (userData: {
    firstName: string
    lastName: string
    email: string
    password: string
    role: "teacher" | "student" | "institution"
    institutionName?: string
  }): Promise<{ success: boolean; redirectUrl?: string }> => {
    try {
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
        return { success: false }
      }

      if (data.user) {
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
          console.error("Error inserting new user profile:", insertError, JSON.stringify(insertError, null, 2))
          return { success: false }
        }

        const redirectUrl = `/dashboard/${userData.role}`
        await refreshUser()
        return { success: true, redirectUrl }
      }
      return { success: false }
    } catch (error) {
      console.error("Registration error:", error)
      return { success: false }
    }
  }

  useEffect(() => {
    refreshUser()
  }, [])

  return <AuthContext.Provider value={{ user, loading, login, logout, register, refreshUser }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
