"use client"

import { ThemeProvider } from "next-themes"
import { AuthProvider } from "@/contexts/auth-context"
import type React from "react"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </AuthProvider>
  )
}
