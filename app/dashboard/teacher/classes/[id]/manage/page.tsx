'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { RoleGate } from '@/components/ui/permission-gate';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Users,
  BookOpen,
  Settings,
  UserPlus,
  Copy,
  Check,
  UserMinus,
} from 'lucide-react';
import { ClassMaterials } from '@/components/classes/class-materials';
import { formatClassCodeForDisplay } from '@/lib/utils/class-code-generator';
import { confirmAction, errorMessage, toast } from '@/lib/toast';

interface ClassData {
  id: string;
  name: string;
  description: string;
  code: string;
  status: string;
  enrollment_count: number;
  created_at: string;
  teacher_id: string;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  enrolled_at: string;
}

export default function ManageClassPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [classData, setClassData] = useState<ClassData | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [pending, setPending] = useState<Student[]>([]);
  const [answering, setAnswering] = useState<string | null>(null);

  // ?tab=students opens a tab directly (used by join-request notifications).
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (
      tab &&
      ['overview', 'students', 'materials', 'settings'].includes(tab)
    ) {
      setActiveTab(tab);
    }
  }, []);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const classId = params?.id as string;

  useEffect(() => {
    if (!classId || !user) return;

    const fetchClassData = async () => {
      try {
        const supabase = createClient();

        // Fetch class data
        const { data: classInfo, error: classError } = await supabase
          .from('classes')
          .select('*')
          .eq('id', classId)
          .eq('teacher_id', user.id)
          .single();

        if (classError) {
          setError('Class not found or access denied');
          return;
        }

        setClassData(classInfo);
        setEditName(classInfo.name ?? '');
        setEditDescription(classInfo.description ?? '');

        // Fetch enrolled students
        const { data: enrolledStudents, error: studentsError } = await supabase
          .from('enrollments')
          .select(
            `
            id,
            enrolled_at,
            users!inner(
              id,
              first_name,
              last_name,
              email
            )
          `
          )
          .eq('class_id', classId)
          // Joining by class code creates 'enrolled' rows; older ones are 'active'.
          .in('status', ['enrolled', 'active']);

        if (studentsError) {
          console.error('Error fetching students:', studentsError.message);
          setError('Could not load the students in this class');
          return;
        }

        if (enrolledStudents) {
          const formattedStudents = enrolledStudents.map((enrollment: any) => ({
            id: enrollment.users.id,
            first_name: enrollment.users.first_name,
            last_name: enrollment.users.last_name,
            email: enrollment.users.email,
            enrolled_at: enrollment.enrolled_at,
          }));
          setStudents(formattedStudents);
        }

        // Students waiting for the teacher to accept them.
        const { data: requests, error: requestsError } = await supabase
          .from('enrollments')
          .select('enrolled_at, users!inner(id, first_name, last_name, email)')
          .eq('class_id', classId)
          .eq('status', 'pending')
          .order('enrolled_at', { ascending: true });
        if (requestsError) {
          console.error('Error fetching join requests:', requestsError.message);
        } else {
          setPending(
            (requests ?? []).map((r: any) => ({
              id: r.users.id,
              first_name: r.users.first_name,
              last_name: r.users.last_name,
              email: r.users.email,
              enrolled_at: r.enrolled_at,
            }))
          );
        }
      } catch (err) {
        console.error('Error fetching class data:', err);
        setError('Failed to load class data');
      } finally {
        setLoading(false);
      }
    };

    fetchClassData();
  }, [classId, user]);

  const answerRequest = async (student: Student, accept: boolean) => {
    if (!classData) return;
    setAnswering(student.id);
    const { error } = await createClient().rpc('review_join_request', {
      p_class: classData.id,
      p_student: student.id,
      p_accept: accept,
    });
    setAnswering(null);
    const name =
      `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim() ||
      student.email;
    if (error) {
      toast.error(errorMessage(error, 'Could not answer the request'));
      return;
    }
    setPending(current => current.filter(s => s.id !== student.id));
    if (accept) {
      setStudents(current => [
        ...current,
        { ...student, enrolled_at: new Date().toISOString() },
      ]);
      toast.success(`${name} joined the class`);
    } else {
      toast.success(`Declined ${name}'s request`);
    }
  };

  const removeStudent = async (student: Student) => {
    if (!classData) return;
    const name =
      `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim() ||
      student.email;
    const ok = await confirmAction({
      title: `Remove ${name} from this class?`,
      description:
        'They lose access to its materials and assignments. Their submitted work and grades are kept, and they can rejoin with the class code.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    const { error } = await createClient()
      .from('enrollments')
      .update({ status: 'dropped', updated_at: new Date().toISOString() })
      .eq('class_id', classData.id)
      .eq('student_id', student.id)
      .in('status', ['enrolled', 'active']);
    if (error) {
      toast.error(errorMessage(error, 'Could not remove the student'));
      return;
    }
    setStudents(current => current.filter(s => s.id !== student.id));
    toast.success(`${name} was removed from the class`);
  };

  const resetSettings = () => {
    setEditName(classData?.name ?? '');
    setEditDescription(classData?.description ?? '');
  };

  const saveSettings = async () => {
    if (!classData || !user) return;
    const name = editName.trim();
    if (!name) {
      toast.error('The class needs a name');
      return;
    }
    setSavingSettings(true);
    try {
      const { data, error } = await createClient()
        .from('classes')
        .update({
          name,
          description: editDescription.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', classData.id)
        .eq('teacher_id', user.id)
        .select('*')
        .single();
      if (error) throw error;
      setClassData(data);
      setEditName(data.name ?? '');
      setEditDescription(data.description ?? '');
      toast.success('Class updated');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the class'));
    } finally {
      setSavingSettings(false);
    }
  };

  const copyClassCode = async () => {
    if (!classData?.code) return;

    try {
      await navigator.clipboard.writeText(classData.code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !classData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-semibold mb-2">Error</h3>
            <p className="text-gray-600 mb-4">{error || 'Class not found'}</p>
            <Button onClick={() => router.push('/dashboard/teacher/classes')}>
              Back to Classes
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <RoleGate userId={user?.id || ''} allowedRoles={['teacher']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{classData.name}</h1>
            <p className="text-gray-600">{classData.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={classData.status === 'active' ? 'default' : 'secondary'}
            >
              {classData.status}
            </Badge>
          </div>
        </div>

        {/* Class Code Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Class Code
            </CardTitle>
            <CardDescription>
              Share this code with students so they can join your class
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="bg-gray-100 px-4 py-2 rounded-lg font-mono text-lg font-bold">
                {formatClassCodeForDisplay(classData.code)}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={copyClassCode}
                className="flex items-center gap-2"
              >
                {codeCopied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy Code
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="students">
              Students ({students.length})
              {pending.length > 0 && (
                <span className="ml-2 rounded-full bg-amber-500 px-2 text-xs text-white">
                  {pending.length} new
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="materials">Materials</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Students
                  </CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{students.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Class Status
                  </CardTitle>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold capitalize">
                    {classData.status}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Created</CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {new Date(classData.created_at).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="students" className="space-y-6">
            {pending.length > 0 && (
              <Card className="border-amber-200 bg-amber-50">
                <CardHeader>
                  <CardTitle className="text-base">
                    Waiting to join ({pending.length})
                  </CardTitle>
                  <CardDescription>
                    These students entered your class code. They can&apos;t see
                    the class until you accept them.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pending.map(student => (
                    <div
                      key={student.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-3 py-2"
                    >
                      <div>
                        <p className="font-medium">
                          {student.first_name} {student.last_name}
                        </p>
                        <p className="text-sm text-gray-600">
                          {student.email} · asked{' '}
                          {new Date(student.enrolled_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => answerRequest(student, true)}
                          disabled={answering === student.id}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => answerRequest(student, false)}
                          disabled={answering === student.id}
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Enrolled Students</h3>
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(classData.code);
                    toast.success(
                      `Class code ${classData.code} copied. Share it with your students; you accept each request here.`
                    );
                  } catch {
                    toast.info(
                      `Share the class code ${classData.code} with your students; you accept each request here.`
                    );
                  }
                }}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Students
              </Button>
            </div>

            {students.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    No students enrolled yet
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Share your class code with students so they can join your
                    class.
                  </p>
                  <Button onClick={copyClassCode}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Class Code
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {students.map(student => (
                  <Card key={student.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {student.first_name?.[0]}
                              {student.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {student.first_name} {student.last_name}
                            </p>
                            <p className="text-sm text-gray-600">
                              {student.email}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-sm text-gray-500">
                            Joined{' '}
                            {new Date(student.enrolled_at).toLocaleDateString()}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeStudent(student)}
                            aria-label={`Remove ${student.first_name ?? ''} ${student.last_name ?? ''} from the class`}
                          >
                            <UserMinus className="h-4 w-4 mr-1 text-red-600" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="materials" className="space-y-6">
            <ClassMaterials classId={classData.id} canManage />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Class Settings</CardTitle>
                <CardDescription>
                  Manage your class settings and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="className">Class Name</Label>
                  <Input
                    id="className"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Enter class name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    placeholder="Enter class description"
                    rows={3}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={saveSettings}
                    disabled={
                      savingSettings ||
                      !editName.trim() ||
                      (editName.trim() === classData.name &&
                        editDescription.trim() ===
                          (classData.description ?? ''))
                    }
                  >
                    {savingSettings ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetSettings}
                    disabled={savingSettings}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </RoleGate>
  );
}
