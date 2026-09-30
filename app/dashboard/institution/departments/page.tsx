'use client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '../../../../lib/supabase-client';
import { RoleGate } from '@/components/ui/permission-gate';
import { DatabaseStatusBanner } from '@/components/database-status-banner';

interface Department {
  id: string;
  name: string;
}

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'institution_admin' | 'department_admin' | 'teacher' | 'student';
  institution_id?: string;
  institution_name?: string;
}

export default function DepartmentManagementPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(
    null
  );
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  const { user, loading: authLoading } = useAuth();
  const supabase = createClient();

  useEffect(() => {
    if (!user) return;
    fetchDepartments();
    fetchUsers();
  }, [user]);

  const fetchDepartments = async () => {
    try {
      const { data, error } = await supabase.from('departments').select('*');
      if (error) {
        console.error('Error fetching departments:', error);
        setDepartments([]);
      } else {
        setDepartments(data);
      }
    } catch (error) {
      console.error('Database connection error:', error);
      setDepartments([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, role, institution_id');
      if (error) {
        console.error('Error fetching users:', error);
        setUsers([]);
      } else {
        setUsers(data as User[]);
      }
    } catch (error) {
      console.error('Database connection error:', error);
      setUsers([]);
    }
  };

  const handleCreateDepartment = async () => {
    if (!newDepartmentName.trim()) {
      alert('Department name cannot be empty.');
      return;
    }

    try {
      // Departments belong to the signed-in admin's own institution.
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('institution_id')
        .eq('id', user!.id)
        .single();

      if (profileError || !profile?.institution_id) {
        alert(
          "Your account isn't linked to an institution yet, so departments can't be created."
        );
        return;
      }

      const { error } = await supabase.from('departments').insert({
        name: newDepartmentName,
        institution_id: profile.institution_id,
      });

      if (error) {
        alert(`Failed to create department: ${error.message}`);
      } else {
        alert('Department created successfully!');
        setNewDepartmentName('');
        fetchDepartments();
      }
    } catch (error) {
      console.error('Error creating department:', error);
      alert('Failed to create department. Please try again.');
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    // RLS silently skips rows you may not delete, so check what was removed.
    const { data, error } = await supabase
      .from('departments')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) {
      alert('Failed to delete department.' + error.message);
    } else if (!data || data.length === 0) {
      alert('You can only delete departments in your own institution.');
    } else {
      alert('Department deleted successfully!');
      fetchDepartments();
    }
  };

  // Department membership is users.department_id. RLS and the users guard
  // trigger only allow this for members of the admin's own institution.
  const setUserDepartment = async (departmentId: string, userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .update({ department_id: departmentId })
      .eq('id', userId)
      .select('id');
    if (error) return error.message;
    if (!data || data.length === 0)
      return "This user isn't in your institution.";
    return null;
  };

  const handleAddMemberToDepartment = async (
    departmentId: string,
    userId: string
  ) => {
    const error = await setUserDepartment(departmentId, userId);
    if (error) {
      alert('Failed to add member to department. ' + error);
    } else {
      alert('Member added to department successfully!');
    }
  };

  const handleAssignTeacherToDepartment = async () => {
    if (!selectedDepartment || !selectedTeacher) return;

    const error = await setUserDepartment(selectedDepartment, selectedTeacher);
    if (error) {
      alert('Failed to assign teacher to department. ' + error);
    } else {
      alert('Teacher assigned to department successfully!');
      setSelectedDepartment(null);
      setSelectedTeacher(null);
    }
  };

  if (authLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <div>Access Denied</div>;
  }

  return (
    <RoleGate userId={user.id} allowedRoles={['institution_admin']}>
      <div className="flex flex-col gap-4 p-4 md:gap-8 md:p-6">
        <DatabaseStatusBanner />
        <h1 className="text-lg font-semibold md:text-2xl">
          Department Management
        </h1>

        <Card>
          <CardHeader>
            <CardTitle>Create New Department</CardTitle>
            <CardDescription>
              Organize students and teachers into departments.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="departmentName">Department Name</Label>
              <Input
                id="departmentName"
                value={newDepartmentName}
                onChange={e => setNewDepartmentName(e.target.value)}
              />
            </div>
            <Button onClick={handleCreateDepartment}>Create Department</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing Departments</CardTitle>
            <CardDescription>
              Manage your institution&apos;s departments.
            </CardDescription>
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
                {departments.map(dept => (
                  <TableRow key={dept.id}>
                    <TableCell>{dept.name}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteDepartment(dept.id)}
                      >
                        Delete
                      </Button>
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
            <CardDescription>
              Assign teachers to manage specific departments (groups of
              students).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="selectDepartment">Select Department</Label>
              <select
                id="selectDepartment"
                value={selectedDepartment || ''}
                onChange={e => setSelectedDepartment(e.target.value)}
                className="p-2 border rounded"
              >
                <option value="">-- Select --</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="selectTeacher">Select Teacher</Label>
              <select
                id="selectTeacher"
                value={selectedTeacher || ''}
                onChange={e => setSelectedTeacher(e.target.value)}
                className="p-2 border rounded"
              >
                <option value="">-- Select --</option>
                {users
                  .filter(user => user.role === 'teacher')
                  .map(teacher => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.first_name} {teacher.last_name}
                    </option>
                  ))}
              </select>
            </div>
            <Button
              onClick={handleAssignTeacherToDepartment}
              disabled={!selectedDepartment || !selectedTeacher}
            >
              Assign Teacher
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Group Students into Departments</CardTitle>
            <CardDescription>
              Add students to specific departments.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="selectDepartmentForStudent">
                Select Department
              </Label>
              <select
                id="selectDepartmentForStudent"
                value={selectedDepartment || ''}
                onChange={e => setSelectedDepartment(e.target.value)}
                className="p-2 border rounded"
              >
                <option value="">-- Select --</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="selectStudent">Select Student</Label>
              <select
                id="selectStudent"
                value={selectedStudent || ''}
                onChange={e => setSelectedStudent(e.target.value)}
                className="p-2 border rounded"
              >
                <option value="">-- Select --</option>
                {users
                  .filter(user => user.role === 'student')
                  .map(student => (
                    <option key={student.id} value={student.id}>
                      {student.first_name} {student.last_name}
                    </option>
                  ))}
              </select>
            </div>
            <Button
              onClick={() =>
                handleAddMemberToDepartment(
                  selectedDepartment!,
                  selectedStudent!
                )
              }
              disabled={!selectedDepartment || !selectedStudent}
            >
              Add Student to Department
            </Button>
          </CardContent>
        </Card>
      </div>
    </RoleGate>
  );
}
