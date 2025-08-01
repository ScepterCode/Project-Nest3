"use client"

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useState, useEffect } from 'react'
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "../../../../lib/supabase-client"
import { RoleGate } from '@/components/ui/permission-gate'
import { DatabaseStatusBanner } from '@/components/database-status-banner'

interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  role: 'teacher' | 'student' | 'institution_admin'
  institution_id?: string
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([])
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState<'teacher' | 'student'>('student')

  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    if (!user) return
    fetchUsers()
  }, [user])

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from('users').select('id, email, first_name, last_name, role, institution_id')
      
      if (error) {
        console.error("Error fetching users:", error);
        setUsers([]);
      } else {
        setUsers(data as User[]);
      }
    } catch (error) {
      console.error("Database connection error:", error);
      setUsers([]);
    }
  }

  const handleInviteUser = async () => {
    try {
      // Create user via Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: "TempPassword123!", // Temporary password - user should reset
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            role: role,
          },
        },
      });

      if (error) {
        alert(`Failed to invite user: ${error.message}`);
        return;
      }

      if (data.user) {
        alert(`User invitation sent successfully!\n\nInvited: ${firstName} ${lastName}\nEmail: ${email}\nRole: ${role}\n\nThey will receive an email to confirm their account.`);
        
        // Reset form
        setEmail('');
        setFirstName('');
        setLastName('');
        setRole('student');
        
        // Refresh users list
        fetchUsers();
      }
    } catch (error) {
      console.error("Error inviting user:", error);
      alert(`Failed to invite user: ${error}`);
    }
  }

  const handleSuspendUser = async (id: string) => {
    // This would typically involve updating a status field in your 'users' table
    // Supabase auth.admin.updateUserById might be used for more direct auth user management
    alert('Suspend user functionality not fully implemented yet.')
  }

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user?")) {
      return
    }
    const { error } = await supabase.from('users').delete().eq('id', id)
    if (error) {
      alert('Failed to delete user.' + error.message)
    } else {
      alert('User deleted successfully!')
      fetchUsers()
    }
  }

  if (authLoading) {
    return <div>Loading...</div>
  }

  if (!user) {
    return <div>Access Denied</div>
  }

  return (
    <RoleGate userId={user.id} allowedRoles={['institution_admin']}>
    <div className="flex flex-col gap-4 p-4 md:gap-8 md:p-6">
      <DatabaseStatusBanner />
      <h1 className="text-lg font-semibold md:text-2xl">User Management</h1>

      <Card>
        <CardHeader>
          <CardTitle>Invite New User</CardTitle>
          <CardDescription>Send an email invitation to a new teacher or student.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="john.doe@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(value: 'teacher' | 'student') => setRole(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="student">Student</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleInviteUser}>Invite User</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Users</CardTitle>
          <CardDescription>Manage existing teacher and student accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.first_name} {user.last_name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => handleSuspendUser(user.id)} className="mr-2">Suspend</Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteUser(user.id)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    </RoleGate>
  )
}
