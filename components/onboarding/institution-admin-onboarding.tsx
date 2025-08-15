"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Building, Users, Settings, Shield, ArrowRight, ArrowLeft } from 'lucide-react';

interface InstitutionAdminOnboardingProps {
  onComplete: (data: InstitutionAdminOnboardingData) => void;
  userName?: string;
}

interface InstitutionAdminOnboardingData {
  firstName: string;
  lastName: string;
  jobTitle: string;
  institutionName: string;
  institutionType: string;
  institutionSize: string;
  departments: string[];
  responsibilities: string[];
  managementExperience: string;
  priorities: string[];
  contactEmail: string;
  contactPhone?: string;
  institutionId?: string;
}

const INSTITUTION_TYPES = [
  'University',
  'College',
  'Community College',
  'High School',
  'Middle School',
  'Elementary School',
  'Training Center',
  'Corporate Training',
  'Other'
];

const INSTITUTION_SIZES = [
  'Small (1-100 users)',
  'Medium (101-500 users)',
  'Large (501-2000 users)',
  'Very Large (2000+ users)'
];

const COMMON_DEPARTMENTS = [
  'Computer Science',
  'Mathematics',
  'English/Literature',
  'Science',
  'History/Social Studies',
  'Business',
  'Engineering',
  'Arts & Design',
  'Music',
  'Physical Education',
  'Foreign Languages',
  'Psychology',
  'Medicine/Health Sciences'
];

const ADMIN_RESPONSIBILITIES = [
  'User account management',
  'Course and curriculum oversight',
  'Faculty management',
  'Student enrollment',
  'Academic policy enforcement',
  'System configuration',
  'Data and analytics review',
  'Budget and resource allocation',
  'Compliance and reporting',
  'Technology integration'
];

const MANAGEMENT_EXPERIENCE = [
  'New to educational administration',
  '1-3 years of experience',
  '4-7 years of experience',
  '8-15 years of experience',
  '15+ years of experience'
];

const ADMIN_PRIORITIES = [
  'Streamline administrative processes',
  'Improve student outcomes',
  'Enhance faculty productivity',
  'Better data and reporting',
  'Cost reduction and efficiency',
  'Technology modernization',
  'Compliance and accreditation',
  'Student engagement',
  'Faculty development',
  'Institutional growth'
];

export function InstitutionAdminOnboarding({ onComplete, userName = 'there' }: InstitutionAdminOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<InstitutionAdminOnboardingData>({
    firstName: '',
    lastName: '',
    jobTitle: '',
    institutionName: '',
    institutionType: '',
    institutionSize: '',
    departments: [],
    responsibilities: [],
    managementExperience: '',
    priorities: [],
    contactEmail: '',
    contactPhone: '',
    institutionId: ''
  });

  const totalSteps = 5;

  const updateFormData = (updates: Partial<InstitutionAdminOnboardingData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const toggleDepartment = (department: string) => {
    const newDepartments = formData.departments.includes(department)
      ? formData.departments.filter(d => d !== department)
      : [...formData.departments, department];
    updateFormData({ departments: newDepartments });
  };

  const toggleResponsibility = (responsibility: string) => {
    const newResponsibilities = formData.responsibilities.includes(responsibility)
      ? formData.responsibilities.filter(r => r !== responsibility)
      : [...formData.responsibilities, responsibility];
    updateFormData({ responsibilities: newResponsibilities });
  };

  const togglePriority = (priority: string) => {
    const newPriorities = formData.priorities.includes(priority)
      ? formData.priorities.filter(p => p !== priority)
      : [...formData.priorities, priority];
    updateFormData({ priorities: newPriorities });
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
                <Shield className="h-5 w-5" />
                Welcome, {userName}!
              </CardTitle>
              <CardDescription>
                Let's set up your administrative profile
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
                <Label htmlFor="jobTitle">Job Title</Label>
                <Input
                  id="jobTitle"
                  value={formData.jobTitle}
                  onChange={(e) => updateFormData({ jobTitle: e.target.value })}
                  placeholder="e.g., Dean, Principal, Director, Administrator"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) => updateFormData({ contactEmail: e.target.value })}
                    placeholder="your.email@institution.edu"
                  />
                </div>
                <div>
                  <Label htmlFor="contactPhone">Phone (Optional)</Label>
                  <Input
                    id="contactPhone"
                    value={formData.contactPhone}
                    onChange={(e) => updateFormData({ contactPhone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 1:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Institution Information
              </CardTitle>
              <CardDescription>
                Tell us about your institution
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="institutionName">Institution Name</Label>
                <Input
                  id="institutionName"
                  value={formData.institutionName}
                  onChange={(e) => updateFormData({ institutionName: e.target.value })}
                  placeholder="Enter your institution's name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Institution Type</Label>
                  <Select value={formData.institutionType} onValueChange={(value) => updateFormData({ institutionType: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {INSTITUTION_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Institution Size</Label>
                  <Select value={formData.institutionSize} onValueChange={(value) => updateFormData({ institutionSize: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      {INSTITUTION_SIZES.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                Departments & Structure
              </CardTitle>
              <CardDescription>
                Which departments will you be managing?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Departments (Select all that apply)</Label>
                <div className="grid grid-cols-2 gap-2 mt-2 max-h-60 overflow-y-auto">
                  {COMMON_DEPARTMENTS.map((department) => (
                    <div key={department} className="flex items-center space-x-2">
                      <Checkbox
                        id={department}
                        checked={formData.departments.includes(department)}
                        onCheckedChange={() => toggleDepartment(department)}
                      />
                      <Label htmlFor={department} className="text-sm font-normal">
                        {department}
                      </Label>
                    </div>
                  ))}
                </div>
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
                Administrative Role
              </CardTitle>
              <CardDescription>
                What are your key responsibilities?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Management Experience</Label>
                <Select value={formData.managementExperience} onValueChange={(value) => updateFormData({ managementExperience: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your experience level" />
                  </SelectTrigger>
                  <SelectContent>
                    {MANAGEMENT_EXPERIENCE.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Key Responsibilities (Select all that apply)</Label>
                <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
                  {ADMIN_RESPONSIBILITIES.map((responsibility) => (
                    <div key={responsibility} className="flex items-center space-x-2">
                      <Checkbox
                        id={responsibility}
                        checked={formData.responsibilities.includes(responsibility)}
                        onCheckedChange={() => toggleResponsibility(responsibility)}
                      />
                      <Label htmlFor={responsibility} className="text-sm font-normal">
                        {responsibility}
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
              <CardTitle>Administrative Priorities</CardTitle>
              <CardDescription>
                What are your main goals for this platform?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Top Priorities (Select your main goals)</Label>
                <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
                  {ADMIN_PRIORITIES.map((priority) => (
                    <div key={priority} className="flex items-center space-x-2">
                      <Checkbox
                        id={priority}
                        checked={formData.priorities.includes(priority)}
                        onCheckedChange={() => togglePriority(priority)}
                      />
                      <Label htmlFor={priority} className="text-sm font-normal">
                        {priority}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">What's Next?</h4>
                <ul className="text-sm space-y-1">
                  <li>• Set up your institution profile</li>
                  <li>• Create and manage departments</li>
                  <li>• Invite faculty and staff</li>
                  <li>• Configure system settings</li>
                  <li>• Monitor institutional analytics</li>
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
        return formData.firstName.trim() && formData.lastName.trim() && formData.jobTitle.trim() && formData.contactEmail.trim();
      case 1:
        return formData.institutionName.trim() && formData.institutionType && formData.institutionSize;
      case 2:
        return formData.departments.length > 0;
      case 3:
        return formData.managementExperience && formData.responsibilities.length > 0;
      case 4:
        return true; // Priorities are optional
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
            <span className="text-sm font-medium">Administrator Setup</span>
            <span className="text-sm text-gray-500">
              Step {currentStep + 1} of {totalSteps}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {renderStep()}

        {/* Navigation buttons */}
        <div className="flex justify-between mt-6">
          {currentStep > 0 && (
            <Button
              variant="outline"
              onClick={prevStep}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
          )}
          {currentStep === 0 && <div></div>}

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