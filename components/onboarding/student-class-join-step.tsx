"use client";

import React, { useState } from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useClassJoin } from '@/lib/hooks/useOnboarding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClassInfo, UserRole } from '@/lib/types/onboarding';
import { 
  BookOpen, 
  Users, 
  ChevronRight,
  Check,
  AlertCircle,
  Info,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function StudentClassJoinStep() {
  const { onboardingData, nextStep } = useOnboarding();
  const { joinClass, loading, error } = useClassJoin();
  const [classCode, setClassCode] = useState('');
  const [joinedClass, setJoinedClass] = useState<ClassInfo | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Only show this step for students
  if (onboardingData.role !== UserRole.STUDENT) {
    return null;
  }

  const handleClassCodeChange = (value: string) => {
    setClassCode(value.toUpperCase().trim());
    setValidationError(null);
  };

  const validateClassCode = (code: string): boolean => {
    if (!code.trim()) {
      setValidationError('Please enter a class code');
      return false;
    }
    
    if (code.length < 4 || code.length > 10) {
      setValidationError('Class codes are typically 4-10 characters long');
      return false;
    }
    
    if (!/^[A-Z0-9]+$/.test(code)) {
      setValidationError('Class codes can only contain letters and numbers');
      return false;
    }
    
    return true;
  };

  const handleJoinClass = async () => {
    if (!validateClassCode(classCode)) {
      return;
    }

    try {
      const result = await joinClass(classCode);
      if (result.success && result.class) {
        setJoinedClass(result.class);
        setValidationError(null);
      } else {
        setValidationError(result.error || 'Failed to join class');
      }
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to join class');
    }
  };

  const handleContinue = async () => {
    await nextStep();
  };

  const handleSkip = async () => {
    await nextStep();
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      <div className="text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Join your first class to start accessing assignments and course materials.
        </p>
      </div>

      {!joinedClass ? (
        <>
          {/* Class Code Input */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BookOpen className="h-5 w-5 text-blue-600" />
                <span>Join a Class</span>
              </CardTitle>
              <CardDescription>
                Enter the class code provided by your teacher to join your first class.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="classCode">Class Code</Label>
                <Input
                  id="classCode"
                  type="text"
                  value={classCode}
                  onChange={(e) => handleClassCodeChange(e.target.value)}
                  placeholder="Enter class code (e.g., ABC123)"
                  className="text-center text-lg font-mono tracking-wider min-h-[44px]" // Touch-friendly height
                  maxLength={10}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-describedby={validationError ? "class-code-error" : "class-code-help"}
                />
                <p id="class-code-help" className="text-xs text-gray-500 text-center">
                  Class codes are usually 4-10 characters long
                </p>
                {validationError && (
                  <p 
                    id="class-code-error"
                    className="text-red-600 text-sm flex items-center space-x-1"
                    role="alert"
                    aria-live="polite"
                  >
                    <AlertCircle className="h-3 w-3" aria-hidden="true" />
                    <span>{validationError}</span>
                  </p>
                )}
              </div>
              
              <Button
                onClick={handleJoinClass}
                disabled={!classCode.trim() || loading}
                className="w-full flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Joining...</span>
                  </>
                ) : (
                  <>
                    <span>Join Class</span>
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Help Information */}
          <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                    Don't have a class code?
                  </h4>
                  <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
                    <p>Ask your teacher for the class code. They can:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Share it during class or via email</li>
                      <li>Post it on your school's learning management system</li>
                      <li>Include it in course materials or syllabus</li>
                    </ul>
                    <p className="mt-3">
                      You can also skip this step and join classes later from your dashboard.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        /* Class Preview */
        <Card className="bg-green-50 dark:bg-green-950 border-green-200">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-10 h-10 bg-green-500 rounded-full">
                <Check className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-green-900 dark:text-green-100">
                  Successfully Joined!
                </CardTitle>
                <CardDescription className="text-green-700 dark:text-green-300">
                  Welcome to your new class
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
                    {joinedClass.name}
                  </h3>
                  {joinedClass.description && (
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      {joinedClass.description}
                    </p>
                  )}
                  <div className="flex items-center space-x-4 mt-3">
                    <div className="flex items-center space-x-1 text-sm text-gray-500">
                      <User className="h-4 w-4" />
                      <span>{joinedClass.teacherName}</span>
                    </div>
                    <div className="flex items-center space-x-1 text-sm text-gray-500">
                      <Users className="h-4 w-4" />
                      <span>{joinedClass.studentCount} students</span>
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className="ml-4">
                  {joinedClass.code}
                </Badge>
              </div>
            </div>
            
            <div className="text-sm text-green-800 dark:text-green-200">
              <p className="font-medium mb-2">What's next?</p>
              <ul className="space-y-1">
                <li>• View and complete assignments</li>
                <li>• Participate in class discussions</li>
                <li>• Track your progress and grades</li>
                <li>• Access course materials and resources</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button
          variant="outline"
          onClick={handleSkip}
          className="text-gray-600"
        >
          {joinedClass ? 'Continue Setup' : 'Skip for now'}
        </Button>
        
        {joinedClass && (
          <Button
            onClick={handleContinue}
            className="flex items-center space-x-2"
          >
            <span>Continue</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {!joinedClass && (
        <div className="text-center">
          <p className="text-xs text-gray-500">
            You can join classes later from your student dashboard
          </p>
        </div>
      )}
    </div>
  );
}