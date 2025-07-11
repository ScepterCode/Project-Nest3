"use client"

"use client"

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useState, useEffect } from 'react'
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase-client"

interface Department {
  id: string
  name: string
}

interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  role: 'teacher' | 'student' | 'institution'
  institution_id?: string
  institution_name?: string
}

export default function DepartmentManagementPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [newDepartmentName, setNewDepartmentName] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null)
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null)

  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    if (!user) return
    fetchDepartments()
    fetchUsers()
  }, [user])

  const fetchDepartments = async () => {
    const { data, error } = await supabase.from('departments').select('*')
    if (error) {
      console.error("Error fetching departments:", error)
    } else {
      setDepartments(data)
    }
  }

  const fetchUsers = async () => {
    const { data, error } = await supabase.from('users').select('id, email, first_name, last_name, role, institution_id, institution_name')
    if (error) {
      console.error("Error fetching users:", error)
    } else {
      setUsers(data as User[])
    }
  }

  const handleCreateDepartment = async () => {
    const { error } = await supabase.from('departments').insert({ name: newDepartmentName, institution_id: user?.institution_id })
    if (error) {
      alert('Failed to create department.' + error.message)
    } else {
      alert('Department created successfully!')
      setNewDepartmentName('')
      fetchDepartments()
    }
  }

  const handleDeleteDepartment = async (id: string) => {
    const { error } = await supabase.from('departments').delete().eq('id', id)
    if (error) {
      alert('Failed to delete department.' + error.message)
    } else {
      alert('Department deleted successfully!')
      fetchDepartments()
    }
  }

  const handleAddMemberToDepartment = async (departmentId: string, userId: string, role: 'teacher' | 'student') => {
    const { error } = await supabase.from('department_members').insert({ department_id: departmentId, user_id: userId, role })
    if (error) {
      alert('Failed to add member to department.' + error.message)
    } else {
      alert('Member added to department successfully!')
    }
  }

  const handleAssignTeacherToDepartment = async () => {
    if (!selectedDepartment || !selectedTeacher) return

    const { error } = await supabase.from('department_members').insert({ department_id: selectedDepartment, user_id: selectedTeacher, role: 'teacher' })
    if (error) {
      alert('Failed to assign teacher to department.' + error.message)
    } else {
      alert('Teacher assigned to department successfully!')
      setSelectedDepartment(null)
      setSelectedTeacher(null)
    }
  }

  if (authLoading) {
    return <div>Loading...</div>
  }

  if (!user || user.role !== 'institution') {
    return <div>Access Denied</div>
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:gap-8 md:p-6">
      <h1 className="text-lg font-semibold md:text-2xl">Department Management</h1>

      <Card>
        <CardHeader>
          <CardTitle>Create New Department</CardTitle>
          <CardDescription>Organize students and teachers into departments.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="departmentName">Department Name</Label>
            <Input id="departmentName" value={newDepartmentName} onChange={(e) => setNewDepartmentName(e.target.value)} />
          </div>
          <Button onClick={handleCreateDepartment}>Create Department</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Departments</CardTitle>
          <CardDescription>Manage your institution&apos;s departments.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((dept) => (
                <TableRow key={dept.id}>
                  <TableCell>{dept.name}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteDepartment(dept.id)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assign Teachers to Departments</CardTitle>
          <CardDescription>Assign teachers to manage specific departments (groups of students).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="selectDepartment">Select Department</Label>
            <select id="selectDepartment" value={selectedDepartment || ''} onChange={(e) => setSelectedDepartment(e.target.value)} className="p-2 border rounded">
              <option value="">-- Select --</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="selectTeacher">Select Teacher</Label>
            <select id="selectTeacher" value={selectedTeacher || ''} onChange={(e) => setSelectedTeacher(e.target.value)} className="p-2 border rounded">
              <option value="">-- Select --</option>
              {users.filter(user => user.role === 'teacher').map((teacher) => (
                <option key={teacher.id} value={teacher.id}>{teacher.first_name} {teacher.last_name}</option>
              ))}
            </select>
          </div>
          <Button onClick={handleAssignTeacherToDepartment} disabled={!selectedDepartment || !selectedTeacher}>Assign Teacher</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Group Students into Departments</CardTitle>
          <CardDescription>Add students to specific departments.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="selectDepartmentForStudent">Select Department</Label>
            <select id="selectDepartmentForStudent" value={selectedDepartment || ''} onChange={(e) => setSelectedDepartment(e.target.value)} className="p-2 border rounded">
              <option value="">-- Select --</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="selectStudent">Select Student</Label>
            <select id="selectStudent" value={selectedStudent || ''} onChange={(e) => setSelectedStudent(e.target.value)} className="p-2 border rounded">
              <option value="">-- Select --</option>
              {users.filter(user => user.role === 'student').map((student) => (
                <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>
              ))}
            </select>
          </div>
          <Button onClick={() => handleAddMemberToDepartment(selectedDepartment!, selectedStudent!, 'student')} disabled={!selectedDepartment || !selectedStudent}>Add Student to Department</Button>
        </CardContent>
      </Card>
    </div>
  )
}
