"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Users, Target, ArrowRight, ArrowLeft } from 'lucide-react';

interface StudentOnboardingProps {
  onComplete: (data: StudentOnboardingData) => void;
  onBack: () => void;
}

interface StudentOnboardingData {
  firstName: string;
  lastName: string;
  studentId?: string;
  yearLevel: string;
  major?: string;
  interests: string[];
  goals: string;
  preferredLearningStyle: string;
  institutionId?: string;
  departmentId?: string;
}

const YEAR_LEVELS = [
  'Freshman/1st Year',
  'Sophomore/2nd Year',
  'Junior/3rd Year',
  'Senior/4th Year',
  'Graduate Student',
  'Other'
];

const LEARNING_STYLES = [
  'Visual (diagrams, charts, images)',
  'Auditory (lectures, discussions)',
  'Reading/Writing (notes, texts)',
  'Kinesthetic (hands-on, practical)',
  'Mixed approach'
];

const COMMON_INTERESTS = [
  'Science & Technology',
  'Mathematics',
  'Literature & Writing',
  'History & Social Studies',
  'Arts & Design',
  'Business & Economics',
  'Health & Medicine',
  'Engineering',
  'Languages',
  'Sports & Fitness',
  'Music',
  'Psychology'
];

export function StudentOnboarding({ onComplete, onBack }: StudentOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<StudentOnboardingData>({
    firstName: '',
    lastName: '',
    studentId: '',
    yearLevel: '',
    major: '',
    interests: [],
    goals: '',
    preferredLearningStyle: '',
    institutionId: '',
    departmentId: ''
  });

  const totalSteps = 4;

  const updateFormData = (updates: Partial<StudentOnboardingData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const toggleInterest = (interest: string) => {
    const newInterests = formData.interests.includes(interest)
      ? formData.interests.filter(i => i !== interest)
      : [...formData.interests, interest];
    updateFormData({ interests: newInterests });
  };

  const nextStep = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    onComplete(formData);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Welcome, Student!
              </CardTitle>
              <CardDescription>
                Let's get your profile set up so you can start learning
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => updateFormData({ firstName: e.target.value })}
                    placeholder="Enter your first name"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => updateFormData({ lastName: e.target.value })}
                    placeholder="Enter your last name"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="studentId">Student ID (Optional)</Label>
                <Input
                  id="studentId"
                  value={formData.studentId}
                  onChange={(e) => updateFormData({ studentId: e.target.value })}
                  placeholder="Enter your student ID if you have one"
                />
              </div>
            </CardContent>
          </Card>
        );

      case 1:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Academic Information
              </CardTitle>
              <CardDescription>
                Tell us about your academic background
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="yearLevel">Year Level</Label>
                <Select value={formData.yearLevel} onValueChange={(value) => updateFormData({ yearLevel: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your year level" />
                  </SelectTrigger>
                  <SelectContent>
                    {YEAR_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="major">Major/Field of Study (Optional)</Label>
                <Input
                  id="major"
                  value={formData.major}
                  onChange={(e) => updateFormData({ major: e.target.value })}
                  placeholder="e.g., Computer Science, Biology, English"
                />
              </div>
            </CardContent>
          </Card>
        );

      case 2:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Learning Preferences
              </CardTitle>
              <CardDescription>
                Help us personalize your learning experience
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Subjects of Interest (Select all that apply)</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {COMMON_INTERESTS.map((interest) => (
                    <Badge
                      key={interest}
                      variant={formData.interests.includes(interest) ? "default" : "outline"}
                      className="cursor-pointer justify-center p-2"
                      onClick={() => toggleInterest(interest)}
                    >
                      {interest}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="learningStyle">Preferred Learning Style</Label>
                <Select value={formData.preferredLearningStyle} onValueChange={(value) => updateFormData({ preferredLearningStyle: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="How do you learn best?" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEARNING_STYLES.map((style) => (
                      <SelectItem key={style} value={style}>
                        {style}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        );

      case 3:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Learning Goals</CardTitle>
              <CardDescription>
                What do you hope to achieve with this platform?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="goals">Your Learning Goals</Label>
                <Textarea
                  id="goals"
                  value={formData.goals}
                  onChange={(e) => updateFormData({ goals: e.target.value })}
                  placeholder="e.g., Improve my grades, learn new skills, prepare for exams, collaborate with classmates..."
                  rows={4}
                />
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">What's Next?</h4>
                <ul className="text-sm space-y-1">
                  <li>• Browse and join classes</li>
                  <li>• Complete assignments and quizzes</li>
                  <li>• Participate in peer reviews</li>
                  <li>• Track your progress</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return formData.firstName.trim() && formData.lastName.trim();
      case 1:
        return formData.yearLevel;
      case 2:
        return formData.preferredLearningStyle;
      case 3:
        return true; // Goals are optional
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Student Setup</span>
            <span className="text-sm text-gray-500">
              Step {currentStep + 1} of {totalSteps}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {renderStep()}

        {/* Navigation buttons */}
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={currentStep === 0 ? onBack : prevStep}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {currentStep === 0 ? 'Back to Role Selection' : 'Previous'}
          </Button>

          <Button
            onClick={currentStep === totalSteps - 1 ? handleComplete : nextStep}
            disabled={!canProceed()}
          >
            {currentStep === totalSteps - 1 ? 'Complete Setup' : 'Next'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}