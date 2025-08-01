"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { GraduationCap, BookOpen, Users, Settings, ArrowRight, ArrowLeft } from 'lucide-react';

interface TeacherOnboardingProps {
  onComplete: (data: TeacherOnboardingData) => void;
  onBack: () => void;
}

interface TeacherOnboardingData {
  firstName: string;
  lastName: string;
  title: string;
  department: string;
  subjects: string[];
  experience: string;
  teachingPhilosophy: string;
  classManagementStyle: string;
  preferredTools: string[];
  institutionId?: string;
  departmentId?: string;
}

const TEACHER_TITLES = [
  'Professor',
  'Associate Professor',
  'Assistant Professor',
  'Lecturer',
  'Instructor',
  'Teaching Assistant',
  'Adjunct Professor',
  'Other'
];

const EXPERIENCE_LEVELS = [
  'New to teaching (0-1 years)',
  'Early career (2-5 years)',
  'Experienced (6-10 years)',
  'Veteran (11-20 years)',
  'Expert (20+ years)'
];

const TEACHING_SUBJECTS = [
  'Mathematics',
  'Science',
  'English/Language Arts',
  'History/Social Studies',
  'Computer Science',
  'Business',
  'Art & Design',
  'Music',
  'Physical Education',
  'Foreign Languages',
  'Psychology',
  'Engineering',
  'Medicine/Health Sciences',
  'Other'
];

const CLASS_MANAGEMENT_STYLES = [
  'Collaborative - Students work together frequently',
  'Discussion-based - Emphasis on class discussions',
  'Lecture-based - Traditional lecture format',
  'Project-based - Focus on hands-on projects',
  'Flipped classroom - Students learn at home, practice in class',
  'Mixed approach - Combination of methods'
];

const TEACHING_TOOLS = [
  'Online quizzes and assessments',
  'Video lectures and recordings',
  'Interactive presentations',
  'Peer review assignments',
  'Discussion forums',
  'Grade tracking and analytics',
  'Assignment rubrics',
  'Class announcements',
  'Student progress monitoring',
  'Collaborative documents'
];

export function TeacherOnboarding({ onComplete, onBack }: TeacherOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<TeacherOnboardingData>({
    firstName: '',
    lastName: '',
    title: '',
    department: '',
    subjects: [],
    experience: '',
    teachingPhilosophy: '',
    classManagementStyle: '',
    preferredTools: [],
    institutionId: '',
    departmentId: ''
  });

  const totalSteps = 5;

  const updateFormData = (updates: Partial<TeacherOnboardingData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const toggleSubject = (subject: string) => {
    const newSubjects = formData.subjects.includes(subject)
      ? formData.subjects.filter(s => s !== subject)
      : [...formData.subjects, subject];
    updateFormData({ subjects: newSubjects });
  };

  const toggleTool = (tool: string) => {
    const newTools = formData.preferredTools.includes(tool)
      ? formData.preferredTools.filter(t => t !== tool)
      : [...formData.preferredTools, tool];
    updateFormData({ preferredTools: newTools });
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
                <GraduationCap className="h-5 w-5" />
                Welcome, Educator!
              </CardTitle>
              <CardDescription>
                Let's set up your teaching profile
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
                <Label htmlFor="title">Academic Title</Label>
                <Select value={formData.title} onValueChange={(value) => updateFormData({ title: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your title" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEACHER_TITLES.map((title) => (
                      <SelectItem key={title} value={title}>
                        {title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="department">Department/Field</Label>
                <Input
                  id="department"
                  value={formData.department}
                  onChange={(e) => updateFormData({ department: e.target.value })}
                  placeholder="e.g., Computer Science, Mathematics, English"
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
                Teaching Experience
              </CardTitle>
              <CardDescription>
                Tell us about your teaching background
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Experience Level</Label>
                <Select value={formData.experience} onValueChange={(value) => updateFormData({ experience: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your experience level" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subjects You Teach (Select all that apply)</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {TEACHING_SUBJECTS.map((subject) => (
                    <Badge
                      key={subject}
                      variant={formData.subjects.includes(subject) ? "default" : "outline"}
                      className="cursor-pointer justify-center p-2"
                      onClick={() => toggleSubject(subject)}
                    >
                      {subject}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 2:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Teaching Style
              </CardTitle>
              <CardDescription>
                Help us understand your teaching approach
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="teachingPhilosophy">Teaching Philosophy</Label>
                <Textarea
                  id="teachingPhilosophy"
                  value={formData.teachingPhilosophy}
                  onChange={(e) => updateFormData({ teachingPhilosophy: e.target.value })}
                  placeholder="Describe your teaching philosophy and approach to education..."
                  rows={3}
                />
              </div>
              <div>
                <Label>Classroom Management Style</Label>
                <Select value={formData.classManagementStyle} onValueChange={(value) => updateFormData({ classManagementStyle: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your preferred teaching style" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASS_MANAGEMENT_STYLES.map((style) => (
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
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Platform Preferences
              </CardTitle>
              <CardDescription>
                Which features are most important to you?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Teaching Tools You'd Like to Use</Label>
                <div className="space-y-2 mt-2">
                  {TEACHING_TOOLS.map((tool) => (
                    <div key={tool} className="flex items-center space-x-2">
                      <Checkbox
                        id={tool}
                        checked={formData.preferredTools.includes(tool)}
                        onCheckedChange={() => toggleTool(tool)}
                      />
                      <Label htmlFor={tool} className="text-sm font-normal">
                        {tool}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 4:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Ready to Start Teaching!</CardTitle>
              <CardDescription>
                Your profile is almost complete
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">What's Next?</h4>
                <ul className="text-sm space-y-1">
                  <li>• Create your first class</li>
                  <li>• Set up assignments and rubrics</li>
                  <li>• Invite students to join</li>
                  <li>• Track student progress</li>
                  <li>• Use peer review features</li>
                </ul>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Quick Tips for Success:</h4>
                <ul className="text-sm space-y-1">
                  <li>• Start with clear learning objectives</li>
                  <li>• Use rubrics to set expectations</li>
                  <li>• Encourage peer collaboration</li>
                  <li>• Provide timely feedback</li>
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
        return formData.firstName.trim() && formData.lastName.trim() && formData.title && formData.department.trim();
      case 1:
        return formData.experience && formData.subjects.length > 0;
      case 2:
        return formData.classManagementStyle;
      case 3:
        return true; // Tools are optional
      case 4:
        return true;
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
            <span className="text-sm font-medium">Teacher Setup</span>
            <span className="text-sm text-gray-500">
              Step {currentStep + 1} of {totalSteps}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full transition-all duration-300"
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