"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSupabase } from "@/components/session-provider"
import { UserRoleProfileSection } from "@/components/role-management/user-role-profile-section"
import { RoleRequestForm } from "@/components/role-management/role-request-form"
import { RoleChangeHistory } from "@/components/role-management/role-change-history"
import { User, Shield, History, UserPlus } from "lucide-react"

export default function UserProfilePage() {
  const supabase = useSupabase()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [userId, setUserId] = useState<string | null>(null)
  const [institutionId, setInstitutionId] = useState<string | null>(null)
  const [departmentId, setDepartmentId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRoleRequestForm, setShowRoleRequestForm] = useState(false)

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError

        if (user) {
          setUserId(user.id)
          
          const { data: userProfileData, error: profileError } = await supabase
            .from('users')
            .select('first_name, last_name, email, institution_id, department_id')
            .eq('id', user.id)
            .single()

          if (profileError) throw profileError

          setFirstName(userProfileData.first_name)
          setLastName(userProfileData.last_name)
          setEmail(userProfileData.email)
          setInstitutionId(userProfileData.institution_id)
          setDepartmentId(userProfileData.department_id)
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
    return (
      <div className="p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2">Loading profile...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return <div className="p-6 text-red-500">Error: {error}</div>
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground">
          Manage your personal information, roles, and permissions
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile" className="flex items-center">
            <User className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center">
            <Shield className="h-4 w-4 mr-2" />
            Roles & Permissions
          </TabsTrigger>
          <TabsTrigger value="request" className="flex items-center">
            <UserPlus className="h-4 w-4 mr-2" />
            Request Role
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center">
            <History className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Profile Information Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="h-5 w-5 mr-2" />
                Personal Information
              </CardTitle>
              <CardDescription>
                Update your basic profile information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md">
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
                  <p className="text-xs text-muted-foreground">
                    Contact support to change your email address
                  </p>
                </div>
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating ? "Updating..." : "Update Profile"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Roles & Permissions Tab */}
        <TabsContent value="roles">
          {userId && (
            <UserRoleProfileSection userId={userId} />
          )}
        </TabsContent>

        {/* Request Role Tab */}
        <TabsContent value="request">
          {userId && institutionId && (
            <RoleRequestForm
              userId={userId}
              institutionId={institutionId}
              departmentId={departmentId || undefined}
              onSuccess={() => {
                // Optionally switch to history tab or show success message
                setShowRoleRequestForm(false)
              }}
            />
          )}
        </TabsContent>

        {/* Role History Tab */}
        <TabsContent value="history">
          {userId && (
            <RoleChangeHistory userId={userId} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
