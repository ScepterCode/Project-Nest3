"use client";

import React, { useState } from 'react';
import { EnrollmentManager } from '@/lib/services/enrollment-manager';
import { ClassDiscoveryService } from '@/lib/services/class-discovery';
import { ClassWithEnrollment, EligibilityResult } from '@/lib/types/enrollment';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Users, 
  BookOpen,
  Send,
  Loader2
} from 'lucide-react';

interface EnrollmentRequestFormProps {
  classData: ClassWithEnrollment;
  studentId: string;
  onSuccess?: (result: any) => void;
  onCancel?: () => void;
}

export function EnrollmentRequestForm({ 
  classData, 
  studentId, 
  onSuccess, 
  onCancel 
}: EnrollmentRequestFormProps) {
  const [justification, setJustification] = useState('');
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enrollmentManager = new EnrollmentManager();
  const classDiscoveryService = new ClassDiscoveryService();

  // Check eligibility on component mount
  React.useEffect(() => {
    checkEligibility();
  }, []);

  const checkEligibility = async () => {
    setLoading(true);
    try {
      const result = await classDiscoveryService.checkEnrollmentEligibility(studentId, classData.id);
      setEligibility(result);
    } catch (err) {
      setError('Failed to check enrollment eligibility');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!eligibility?.eligible && eligibility?.reasons.some(r => r.severity === 'error' && !r.overridable)) {
      setError('Cannot submit request due to eligibility requirements');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await enrollmentManager.requestEnrollment(
        studentId, 
        classData.id, 
        justification.trim() || undefined
      );

      if (result.success) {
        onSuccess?.(result);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit enrollment request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Checking eligibility...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Class Information */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <BookOpen className="h-5 w-5" />
                <span>{classData.name}</span>
              </CardTitle>
              <CardDescription className="mt-1">
                {classData.code} • {classData.credits} Credits
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
              Restricted Enrollment
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-gray-400" />
              <span>{classData.teacherName}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <span>{classData.schedule || 'TBA'}</span>
            </div>
          </div>
          
          <div className="text-sm text-gray-600">
            {classData.currentEnrollment}/{classData.capacity} enrolled
            {classData.waitlistCount > 0 && ` • ${classData.waitlistCount} waitlisted`}
          </div>
          
          {classData.description && (
            <p className="text-sm text-gray-700">{classData.description}</p>
          )}
        </CardContent>
      </Card>

      {/* Eligibility Check Results */}
      {eligibility && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {eligibility.eligible ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
              <span>Enrollment Eligibility</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {eligibility.reasons.length === 0 ? (
              <div className="text-green-600 text-sm">
                ✓ You meet all requirements for this class
              </div>
            ) : (
              <div className="space-y-2">
                {eligibility.reasons.map((reason, index) => (
                  <Alert 
                    key={index} 
                    variant={reason.severity === 'error' ? 'destructive' : 'default'}
                  >
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="flex items-center justify-between">
                        <span>{reason.message}</span>
                        {reason.overridable && (
                          <Badge variant="outline" className="text-xs">
                            Override Possible
                          </Badge>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            )}

            {eligibility.recommendedActions.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Recommended Actions:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  {eligibility.recommendedActions.map((action, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <span className="text-blue-500 mt-1">•</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Enrollment Request Form */}
      <Card>
        <CardHeader>
          <CardTitle>Enrollment Request</CardTitle>
          <CardDescription>
            This class requires instructor approval. Please provide a justification for your enrollment request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="justification" className="text-sm font-medium mb-2 block">
                Justification for Enrollment
              </label>
              <Textarea
                id="justification"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Please explain why you need to enroll in this class (e.g., required for your major, prerequisite for other courses, etc.)"
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                A clear justification helps the instructor make an informed decision about your request.
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancel
              </Button>
              
              <Button
                type="submit"
                disabled={
                  submitting || 
                  (eligibility && !eligibility.eligible && 
                   eligibility.reasons.some(r => r.severity === 'error' && !r.overridable))
                }
                className="flex items-center space-x-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Submit Request</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Prerequisites and Restrictions */}
      {(classData.class_prerequisites?.length > 0 || classData.enrollment_restrictions?.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Requirements & Restrictions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {classData.class_prerequisites?.length > 0 && (
              <div>
                <h4 className="font-medium text-sm mb-2">Prerequisites:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  {classData.class_prerequisites.map((prereq, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <span className="text-blue-500 mt-1">•</span>
                      <span>{prereq.description || `${prereq.type}: ${prereq.requirement}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {classData.enrollment_restrictions?.length > 0 && (
              <div>
                <h4 className="font-medium text-sm mb-2">Restrictions:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  {classData.enrollment_restrictions.map((restriction, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <span className="text-red-500 mt-1">•</span>
                      <span>{restriction.description || `${restriction.type}: ${restriction.condition}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}