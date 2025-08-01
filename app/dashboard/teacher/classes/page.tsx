"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, BookOpen, Calendar } from "lucide-react";
import { DatabaseStatusBanner } from "@/components/database-status-banner";
import { AuthStatusChecker } from "@/components/auth-status-checker";

interface Class {
  id: string;
  name: string;
  description: string;
  code: string;
  status: string;
  enrollment_count: number;
  created_at: string;
}

export default function TeacherClassesPage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClasses = async () => {
      if (!user) return;

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('classes')
          .select(`
            id,
            name,
            description,
            code,
            status,
            enrollment_count,
            created_at
          `)
          .eq('teacher_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching classes:', error);
          setClasses([]);
        } else {
          setClasses(data || []);
        }
      } catch (error) {
        console.error('Database connection error:', error);
        setClasses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchClasses();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <AuthStatusChecker requireAuth={true} allowedRoles={['teacher']}>
      <div className="space-y-6">
        <DatabaseStatusBanner />
        <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">My Classes</h1>
          <p className="text-gray-600">Manage your classes and students</p>
        </div>
        <Link href="/dashboard/teacher/classes/create">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Class
          </Button>
        </Link>
      </div>

      {classes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No classes yet</h3>
            <p className="text-gray-600 text-center mb-4">
              Create your first class to start teaching and managing students.
            </p>
            <Link href="/dashboard/teacher/classes/create">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Class
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((classItem) => (
            <Card key={classItem.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{classItem.name}</CardTitle>
                    <CardDescription>{classItem.code}</CardDescription>
                  </div>
                  <Badge variant={classItem.status === 'active' ? 'default' : 'secondary'}>
                    {classItem.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {classItem.description || 'No description available'}
                </p>
                
                <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                  <div className="flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    {classItem.enrollment_count || 0} students
                  </div>
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    {new Date(classItem.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Link href={`/dashboard/teacher/classes/${classItem.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      View Details
                    </Button>
                  </Link>
                  <Link href={`/dashboard/teacher/classes/${classItem.id}/manage`}>
                    <Button size="sm">
                      Manage
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </AuthStatusChecker>
  );
}