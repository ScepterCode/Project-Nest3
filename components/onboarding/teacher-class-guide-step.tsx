"use client";

import React, { useState } from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserRole } from '@/lib/types/onboarding';
import { 
  BookOpen, 
  Users, 
  ChevronRight,
  Check,
  AlertCircle,
  Info,
  Copy,
  Share,
  Lightbulb,
  ArrowRight,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClassFormData {
  name: string;
  description: string;
  subject: string;
  code: string;
}

export function TeacherClassGuideStep() {
  const { onboardingData, nextStep } = useOnboarding();
  const [showGuide, setShowGuide] = useState(false);
  const [currentGuideStep, setCurrentGuideStep] = useState(0);
  const [classData, setClassData] = useState<ClassFormData>({
    name: '',
    description: '',
    subject: '',
    code: ''
  });
  const [createdClass, setCreatedClass] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only show this step for teachers
  if (onboardingData.role !== UserRole.TEACHER) {
    return null;
  }

  const guideSteps = [
    {
      title: "Class Basics",
      description: "Let's start with the essential information about your class",
      icon: BookOpen
    },
    {
      title: "Class Details", 
      description: "Add a description to help students understand what they'll learn",
      icon: Info
    },
    {
      title: "Invite Students",
      description: "Share your class code with students so they can join",
      icon: Users
    }
  ];

  const generateClassCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleInputChange = (field: keyof ClassFormData, value: string) => {
    setClassData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Auto-generate class code based on class name
    if (field === 'name' && value && !classData.code) {
      const autoCode = value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .substring(0, 4) + Math.floor(Math.random() * 100).toString().padStart(2, '0');
      setClassData(prev => ({
        ...prev,
        code: autoCode
      }));
    }
  };

  const handleCreateClass = async () => {
    setLoading(true);
    setError(null);

    try {
      // Simulate class creation API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const newClass = {
        id: 'class-' + Date.now(),
        name: classData.name,
        description: classData.description,
        subject: classData.subject,
        code: classData.code || generateClassCode(),
        teacherId: onboardingData.userId,
        institutionId: onboardingData.institutionId,
        departmentId: onboardingData.departmentId,
        studentCount: 0,
        createdAt: new Date()
      };
      
      setCreatedClass(newClass);
      setCurrentGuideStep(2); // Move to invitation step
    } catch (err) {
      setError('Failed to create class. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    await nextStep();
  };

  const handleContinue = async () => {
    await nextStep();
  };

  const copyClassCode = () => {
    if (createdClass?.code) {
      navigator.clipboard.writeText(createdClass.code);
    }
  };

  if (!showGuide) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Ready to create your first class? We'll guide you through the process step by step.
          </p>
        </div>

        {/* Option Cards */}
        <div className="grid gap-4">
          <Card 
            className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-blue-300"
            onClick={() => setShowGuide(true)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-500 rounded-lg text-white">
                  <Lightbulb className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Guided Class Creation</CardTitle>
                  <CardDescription className="text-sm">
                    Step-by-step walkthrough to create your first class
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Perfect for first-time users who want guidance through the process.
                </p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-xs">Interactive Guide</Badge>
                  <Badge variant="secondary" className="text-xs">Tips & Examples</Badge>
                  <Badge variant="secondary" className="text-xs">Student Invitations</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <BookOpen className="h-8 w-8 text-gray-400 mx-auto mb-3" />
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                Skip for Now
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                You can create classes later from your teacher dashboard.
              </p>
              <Button variant="outline" onClick={handleSkip}>
                Continue to Profile Setup
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Benefits Section */}
        <Card className="bg-green-50 dark:bg-green-950 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <Info className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
              <div>
                <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">
                  Why create a class now?
                </h4>
                <div className="text-sm text-green-800 dark:text-green-200 space-y-1">
                  <p>• Get familiar with the platform's core features</p>
                  <p>• Start inviting students immediately</p>
                  <p>• Set up your teaching environment</p>
                  <p>• Access helpful tips and best practices</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Progress Indicator */}
      <div className="flex items-center justify-center space-x-4 mb-8">
        {guideSteps.map((step, index) => (
          <div key={index} className="flex items-center">
            <div
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full text-sm font-medium",
                index < currentGuideStep
                  ? "bg-green-500 text-white"
                  : index === currentGuideStep
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              )}
            >
              {index < currentGuideStep ? <Check className="h-4 w-4" /> : index + 1}
            </div>
            {index < guideSteps.length - 1 && (
              <div
                className={cn(
                  "w-12 h-0.5 mx-2",
                  index < currentGuideStep
                    ? "bg-green-500"
                    : "bg-gray-200 dark:bg-gray-700"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Current Step Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            {React.createElement(guideSteps[currentGuideStep].icon, {
              className: "h-6 w-6 text-blue-600"
            })}
            <div>
              <CardTitle>{guideSteps[currentGuideStep].title}</CardTitle>
              <CardDescription>{guideSteps[currentGuideStep].description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentGuideStep === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="className">Class Name *</Label>
                <Input
                  id="className"
                  type="text"
                  value={classData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="e.g., Introduction to Biology"
                />
                <p className="text-xs text-gray-500">
                  Choose a clear, descriptive name that students will recognize
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  type="text"
                  value={classData.subject}
                  onChange={(e) => handleInputChange('subject', e.target.value)}
                  placeholder="e.g., Biology, Mathematics, History"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="classCode">Class Code</Label>
                <Input
                  id="classCode"
                  type="text"
                  value={classData.code}
                  onChange={(e) => handleInputChange('code', e.target.value.toUpperCase())}
                  placeholder="Auto-generated or custom"
                  className="font-mono"
                />
                <p className="text-xs text-gray-500">
                  Students will use this code to join your class
                </p>
              </div>
            </>
          )}

          {currentGuideStep === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="description">Class Description</Label>
                <textarea
                  id="description"
                  value={classData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Describe what students will learn in this class..."
                  className="w-full p-3 border border-gray-300 rounded-md resize-none h-24"
                />
                <p className="text-xs text-gray-500">
                  Help students understand what to expect from your class
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                  💡 Description Tips
                </h4>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <li>• Mention key topics you'll cover</li>
                  <li>• Include any prerequisites</li>
                  <li>• Set expectations for participation</li>
                  <li>• Add your teaching style or approach</li>
                </ul>
              </div>
            </>
          )}

          {currentGuideStep === 2 && createdClass && (
            <>
              <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                <div className="flex items-center space-x-2 mb-3">
                  <Check className="h-5 w-5 text-green-600" />
                  <h4 className="font-medium text-green-900 dark:text-green-100">
                    Class Created Successfully!
                  </h4>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    <strong>{createdClass.name}</strong> is ready for students.
                  </p>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-green-800 dark:text-green-200">Class Code:</span>
                    <Badge variant="outline" className="font-mono text-lg px-3 py-1">
                      {createdClass.code}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={copyClassCode}
                      className="h-8"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium">How to invite students:</h4>
                <div className="grid gap-3">
                  <div className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <Share className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Share the Class Code</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Give students the code <strong>{createdClass.code}</strong> to join your class
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <Users className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Announce in Class</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Write the code on the board or include it in your syllabus
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                  What's next?
                </h4>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <li>• Create your first assignment</li>
                  <li>• Set up grading rubrics</li>
                  <li>• Organize course materials</li>
                  <li>• Monitor student enrollment</li>
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button
          variant="outline"
          onClick={() => {
            if (currentGuideStep === 0) {
              setShowGuide(false);
            } else {
              setCurrentGuideStep(prev => prev - 1);
            }
          }}
        >
          Back
        </Button>
        
        <div className="flex space-x-2">
          {currentGuideStep < 2 && (
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="text-gray-600"
            >
              Skip Guide
            </Button>
          )}
          
          {currentGuideStep === 0 && (
            <Button
              onClick={() => setCurrentGuideStep(1)}
              disabled={!classData.name.trim()}
              className="flex items-center space-x-2"
            >
              <span>Next</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          
          {currentGuideStep === 1 && (
            <Button
              onClick={handleCreateClass}
              disabled={loading}
              className="flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>Create Class</span>
                </>
              )}
            </Button>
          )}
          
          {currentGuideStep === 2 && (
            <Button
              onClick={handleContinue}
              className="flex items-center space-x-2"
            >
              <span>Continue</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}