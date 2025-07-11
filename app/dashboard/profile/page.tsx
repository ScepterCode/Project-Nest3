"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/components/session-provider"

export default function UserProfilePage() {
  const supabase = useSupabase()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError

        if (user) {
          const { data: userProfileData, error: profileError } = await supabase
            .from('users')
            .select('first_name, last_name, email')
            .eq('id', user.id)
            .single()

          if (profileError) throw profileError

          setFirstName(userProfileData.first_name)
          setLastName(userProfileData.last_name)
          setEmail(userProfileData.email)
        }
      } catch (error: any) {
        setError(error.message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchUserProfile()
  }, [supabase])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsUpdating(true)

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      if (user) {
        const { error: updateError } = await supabase
          .from('users')
          .update({ first_name: firstName, last_name: lastName })
          .eq('id', user.id)

        if (updateError) throw updateError

        // Optionally update email in auth.users table if needed
        // const { error: authUpdateError } = await supabase.auth.updateUser({ email: email })
        // if (authUpdateError) throw authUpdateError

        alert("Profile updated successfully!")
      }
    } catch (error: any) {
      console.error("Error updating profile:", error)
      alert(error.message || "Failed to update profile")
    } finally {
      setIsUpdating(false)
    }
  }

  if (isLoading) {
    return <div className="p-6">Loading profile...</div>
  }

  if (error) {
    return <div className="p-6 text-red-500">Error: {error}</div>
  }

  return (
    <div className="p-6">
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>User Profile</CardTitle>
          <CardDescription>Update your personal information.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} disabled />
            </div>
            <Button type="submit" className="w-full" disabled={isUpdating}>
              {isUpdating ? "Updating..." : "Update Profile"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
