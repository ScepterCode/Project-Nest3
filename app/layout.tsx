import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "next-themes"
import { SupabaseProvider } from "@/components/session-provider"
import { Providers } from "@/components/providers"
import { AuthProvider } from "@/contexts/auth-context"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Next.js Community Starter",
  description: "A modern Next.js starter with theme support",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <SupabaseProvider>
          <AuthProvider>
            <Providers>
              {children}
            </Providers>
          </AuthProvider>
        </SupabaseProvider>
      </body>
    </html>
  )
}
