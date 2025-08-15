"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileCheck, Star, Users, Calendar } from "lucide-react";
import { DatabaseStatusBanner } from "@/components/database-status-banner";

interface Rubric {
  id: string;
  name: string;
  description: string;
  criteria_count: number;
  max_points: number;
  usage_count: number;
  status: string;
  created_at: string;
}

export default function TeacherRubricsPage() {
  const { user } = useAuth();
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const fetchRubrics = async () => {
      if (!user) return;

      try {
        // Fetch from API
        const response = await fetch('/api/rubrics');
        const result = await response.json();
        const apiRubrics = response.ok ? (result.rubrics || []) : [];

        // Fetch from localStorage
        const localRubrics = JSON.parse(localStorage.getItem('teacher_rubrics') || '[]')
          .filter((rubric: any) => rubric.teacher_id === user.id)
          .map((rubric: any) => ({
            id: rubric.id,
            name: rubric.name,
            description: rubric.description || '',
            criteria_count: rubric.criteria?.length || 0,
            max_points: rubric.criteria?.reduce((sum: number, c: any) => 
              sum + Math.max(...(c.levels?.map((l: any) => l.points) || [0])), 0) || 0,
            usage_count: 0,
            status: rubric.status || 'active',
            created_at: new Date().toISOString()
          }));

        // Combine and deduplicate
        const allRubrics = [...apiRubrics, ...localRubrics];
        const uniqueRubrics = allRubrics.filter((rubric, index, self) => 
          index === self.findIndex(r => r.id === rubric.id)
        );

        setRubrics(uniqueRubrics);
      } catch (error) {
        console.error('Error fetching rubrics:', error);
        setRubrics([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRubrics();
  }, [user]);

  const handleDeleteRubric = async (rubricId: string, rubricName: string) => {
    if (!confirm(`Are you sure you want to delete "${rubricName}"? This action cannot be undone.`)) {
      return;
    }

    setDeleting(rubricId);
    try {
      // Try to delete from API first
      let apiDeleted = false;
      try {
        const response = await fetch(`/api/rubrics?id=${rubricId}`, {
          method: 'DELETE',
        });
        apiDeleted = response.ok;
      } catch (error) {
        console.log('API delete failed, trying localStorage');
      }

      // Delete from localStorage
      const localRubrics = JSON.parse(localStorage.getItem('teacher_rubrics') || '[]');
      const updatedRubrics = localRubrics.filter((rubric: any) => rubric.id !== rubricId);
      localStorage.setItem('teacher_rubrics', JSON.stringify(updatedRubrics));

      // Remove from local state
      setRubrics(prev => prev.filter(r => r.id !== rubricId));
      alert('Rubric deleted successfully!');
    } catch (error) {
      console.error('Error deleting rubric:', error);
      alert('Failed to delete rubric. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'draft': return 'secondary';
      case 'archived': return 'outline';
      default: return 'secondary';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DatabaseStatusBanner />
      


      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Rubrics</h1>
          <p className="text-gray-600">Create and manage grading rubrics for your assignments</p>
        </div>
        <Link href="/dashboard/teacher/rubrics/create">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Rubric
          </Button>
        </Link>
      </div>

      {rubrics.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileCheck className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No rubrics yet</h3>
            <p className="text-gray-600 text-center mb-4">
              Create your first rubric to standardize grading across assignments.
            </p>
            <Link href="/dashboard/teacher/rubrics/create">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Rubric
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rubrics.map((rubric) => (
            <Card key={rubric.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{rubric.name}</CardTitle>
                    <CardDescription>
                      {rubric.criteria_count || 0} criteria
                    </CardDescription>
                  </div>
                  <Badge variant={getStatusColor(rubric.status)}>
                    {rubric.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {rubric.description || 'No description available'}
                </p>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center text-gray-500">
                      <Star className="h-4 w-4 mr-1" />
                      Max: {rubric.max_points || 0} points
                    </div>
                    <div className="flex items-center text-gray-500">
                      <Users className="h-4 w-4 mr-1" />
                      Used {rubric.usage_count || 0} times
                    </div>
                  </div>
                  
                  <div className="flex items-center text-sm text-gray-500">
                    <Calendar className="h-4 w-4 mr-1" />
                    Created {new Date(rubric.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Link href={`/dashboard/teacher/rubrics/${rubric.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      View Details
                    </Button>
                  </Link>
                  <Link href={`/dashboard/teacher/rubrics/${rubric.id}/edit`}>
                    <Button size="sm">
                      Edit
                    </Button>
                  </Link>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => handleDeleteRubric(rubric.id, rubric.name)}
                    disabled={deleting === rubric.id}
                  >
                    {deleting === rubric.id ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Tips</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• Create reusable rubrics to maintain consistent grading standards</li>
              <li>• Include clear criteria descriptions to help students understand expectations</li>
              <li>• Use point scales that align with your grading system</li>
              <li>• Share rubrics with students before assignments are due</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}