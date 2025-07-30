'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  SectionEnrollmentData, 
  EnrollmentBalancingRecommendation, 
  PrerequisiteCoordination,
  CapacityManagementSuggestion,
  DepartmentEnrollmentCoordinator 
} from '@/lib/services/department-enrollment-coordinator';

interface DepartmentAdminInterfaceProps {
  departmentId: string;
  departmentName: string;
}

export function DepartmentAdminInterface({ departmentId, departmentName }: DepartmentAdminInterfaceProps) {
  const [sections, setSections] = useState<SectionEnrollmentData[]>([]);
  const [recommendations, setRecommendations] = useState<EnrollmentBalancingRecommendation[]>([]);
  const [prerequisites, setPrerequisites] = useState<PrerequisiteCoordination[]>([]);
  const [capacitySuggestions, setCapacitySuggestions] = useState<CapacityManagementSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<string>('');

  const coordinator = new DepartmentEnrollmentCoordinator();

  useEffect(() => {
    loadDepartmentData();
  }, [departmentId]);

  const loadDepartmentData = async () => {
    try {
      setLoading(true);
      const [sectionsData, recommendationsData, prerequisitesData, suggestionsData] = await Promise.all([
        coordinator.getDepartmentSections(departmentId),
        coordinator.getEnrollmentBalancingRecommendations(departmentId),
        coordinator.getPrerequisiteCoordination(departmentId),
        coordinator.getCapacityManagementSuggestions(departmentId)
      ]);

      setSections(sectionsData);
      setRecommendations(recommendationsData);
      setPrerequisites(prerequisitesData);
      setCapacitySuggestions(suggestionsData);
    } catch (error) {
      console.error('Failed to load department data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'default';
    }
  };

  const getUtilizationColor = (rate: number) => {
    if (rate >= 95) return 'text-red-600';
    if (rate >= 80) return 'text-yellow-600';
    if (rate >= 60) return 'text-green-600';
    return 'text-blue-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">Loading department data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{departmentName} Enrollment Management</h1>
          <p className="text-gray-600">Coordinate enrollment across multiple sections and courses</p>
        </div>
        <Button onClick={loadDepartmentData} variant="outline">
          Refresh Data
        </Button>
      </div>

      <Tabs defaultValue="sections" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sections">Section Overview</TabsTrigger>
          <TabsTrigger value="balancing">Enrollment Balancing</TabsTrigger>
          <TabsTrigger value="prerequisites">Prerequisites</TabsTrigger>
          <TabsTrigger value="capacity">Capacity Management</TabsTrigger>
        </TabsList>

        <TabsContent value="sections" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Section Enrollment Overview</CardTitle>
              <CardDescription>
                Current enrollment status across all department sections
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {sections.map((section) => (
                  <div key={section.sectionId} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="font-semibold">{section.sectionName}</h3>
                        <p className="text-sm text-gray-600">
                          {section.instructor} • {section.schedule}
                          {section.room && ` • ${section.room}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${getUtilizationColor(section.enrollmentRate)}`}>
                          {section.enrollmentRate.toFixed(1)}%
                        </div>
                        <div className="text-sm text-gray-600">
                          {section.currentEnrollment}/{section.capacity}
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Progress value={section.enrollmentRate} className="h-2" />
                      <div className="flex justify-between text-sm">
                        <span>Enrolled: {section.currentEnrollment}</span>
                        <span>Waitlist: {section.waitlistCount}</span>
                        <span>Available: {section.capacity - section.currentEnrollment}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balancing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Enrollment Balancing Recommendations</CardTitle>
              <CardDescription>
                Suggestions to optimize enrollment distribution across sections
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recommendations.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    No balancing recommendations at this time
                  </p>
                ) : (
                  recommendations.map((rec, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={getPriorityColor(rec.priority)}>
                              {rec.priority.toUpperCase()}
                            </Badge>
                            <span className="font-medium capitalize">
                              {rec.type.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-gray-700 mb-2">{rec.description}</p>
                          <p className="text-sm text-gray-600">{rec.expectedImpact}</p>
                        </div>
                        <Button size="sm" variant="outline">
                          Implement
                        </Button>
                      </div>
                      <div className="text-xs text-gray-500">
                        Affects {rec.affectedSections.length} section(s)
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prerequisites" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Prerequisite Coordination</CardTitle>
              <CardDescription>
                Manage prerequisites across department course sequences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {prerequisites.map((course) => (
                  <div key={course.courseId} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold">{course.courseName}</h3>
                        <p className="text-sm text-gray-600">
                          Current enrollment: {course.enrollmentImpact}
                        </p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 mb-3">
                      <div>
                        <h4 className="font-medium text-sm mb-2">Prerequisites</h4>
                        {course.prerequisites.length === 0 ? (
                          <p className="text-sm text-gray-500">No prerequisites</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {course.prerequisites.map((prereq, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {prereq}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <h4 className="font-medium text-sm mb-2">Dependent Courses</h4>
                        {course.dependentCourses.length === 0 ? (
                          <p className="text-sm text-gray-500">No dependent courses</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {course.dependentCourses.map((dep, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {dep}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {course.recommendations.length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Recommendations</h4>
                        <ul className="text-sm text-gray-700 space-y-1">
                          {course.recommendations.map((rec, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-blue-500 mt-1">•</span>
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capacity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Capacity Management Suggestions</CardTitle>
              <CardDescription>
                Recommendations for optimizing course capacity and resource allocation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {capacitySuggestions.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    No capacity management suggestions at this time
                  </p>
                ) : (
                  capacitySuggestions.map((suggestion, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="capitalize">
                              {suggestion.type.replace('_', ' ')}
                            </Badge>
                            <span className="font-medium">{suggestion.courseName}</span>
                          </div>
                          <p className="text-gray-700 mb-2">{suggestion.suggestion}</p>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">Current Demand:</span>
                              <span className="ml-2 font-medium">{suggestion.currentDemand}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Projected Demand:</span>
                              <span className="ml-2 font-medium">{suggestion.projectedDemand}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-600 mb-1">Feasibility</div>
                          <div className="text-lg font-bold text-green-600">
                            {suggestion.feasibilityScore}%
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline">
                          Review Details
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}