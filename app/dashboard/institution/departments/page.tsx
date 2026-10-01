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
import { createClient } from '@/lib/supabase/client';
import { MemberPicker } from '@/components/institution/member-picker';
import { RoleGate } from '@/components/ui/permission-gate';
import { DatabaseStatusBanner } from '@/components/database-status-banner';

import { toast } from '@/lib/toast';
interface Department {
  id: string;
  name: string;
}

export default function DepartmentManagementPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');
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

  const handleCreateDepartment = async () => {
    if (!newDepartmentName.trim()) {
      toast.error('Department name cannot be empty.');
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
        toast.error(
          "Your account isn't linked to an institution yet, so departments can't be created."
        );
        return;
      }

      const { error } = await supabase.from('departments').insert({
        name: newDepartmentName,
        institution_id: profile.institution_id,
      });

      if (error) {
        toast.error(`Failed to create department: ${error.message}`);
      } else {
        toast.success('Department created successfully!');
        setNewDepartmentName('');
        fetchDepartments();
      }
    } catch (error) {
      console.error('Error creating department:', error);
      toast.error('Failed to create department. Please try again.');
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
      toast.error('Failed to delete department.' + error.message);
    } else if (!data || data.length === 0) {
      toast.error('You can only delete departments in your own institution.');
    } else {
      toast.success('Department deleted successfully!');
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
      toast.error('Failed to add member to department. ' + error);
    } else {
      toast.success('Member added to department successfully!');
    }
  };

  const handleAssignTeacherToDepartment = async () => {
    if (!selectedDepartment || !selectedTeacher) return;

    const error = await setUserDepartment(selectedDepartment, selectedTeacher);
    if (error) {
      toast.error('Failed to assign teacher to department. ' + error);
    } else {
      toast.success('Teacher assigned to department successfully!');
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
              <MemberPicker
                id="selectTeacher"
                role="teacher"
                value={selectedTeacher}
                onChange={setSelectedTeacher}
              />
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
              <MemberPicker
                id="selectStudent"
                role="student"
                value={selectedStudent}
                onChange={setSelectedStudent}
              />
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
