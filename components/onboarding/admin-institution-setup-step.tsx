"use client";

import React, { useState } from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { InstitutionType } from '@/lib/types/onboarding';
import { 
  Building, 
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Globe,
  Mail,
  Users,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface InstitutionFormData {
  name: string;
  domain: string;
  type: InstitutionType;
  contactEmail: string;
  description: string;
}

interface DepartmentFormData {
  name: string;
  code: string;
  description: string;
}

export function AdminInstitutionSetupStep() {
  const { nextStep } = useOnboarding();
  const [currentSubStep, setCurrentSubStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [institutionData, setInstitutionData] = useState<InstitutionFormData>({
    name: '',
    domain: '',
    type: InstitutionType.UNIVERSITY,
    contactEmail: '',
    description: ''
  });

  const [departments, setDepartments] = useState<DepartmentFormData[]>([
    { name: '', code: '', description: '' }
  ]);

  const subSteps = [
    'Institution Details',
    'Department Setup',
    'Review & Create'
  ];

  const handleInstitutionChange = (field: keyof InstitutionFormData, value: string) => {
    setInstitutionData(prev => ({
      ...prev,
      [field]: value
    }));
    setError(null);
  };

  const handleDepartmentChange = (index: number, field: keyof DepartmentFormData, value: string) => {
    setDepartments(prev => prev.map((dept, i) => 
      i === index ? { ...dept, [field]: value } : dept
    ));
  };

  const addDepartment = () => {
    setDepartments(prev => [...prev, { name: '', code: '', description: '' }]);
  };

  const removeDepartment = (index: number) => {
    if (departments.length > 1) {
      setDepartments(prev => prev.filter((_, i) => i !== index));
    }
  };

  const validateInstitutionForm = (): boolean => {
    if (!institutionData.name.trim()) {
      setError('Institution name is required');
      return false;
    }
    if (!institutionData.contactEmail.trim()) {
      setError('Contact email is required');
      return false;
    }
    if (institutionData.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(institutionData.contactEmail)) {
      setError('Please enter a valid email address');
      return false;
    }
    if (institutionData.domain && !/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}$/.test(institutionData.domain)) {
      setError('Please enter a valid domain (e.g., university.edu)');
      return false;
    }
    return true;
  };

  const validateDepartments = (): boolean => {
    const validDepartments = departments.filter(dept => dept.name.trim());
    if (validDepartments.length === 0) {
      setError('At least one department is required');
      return false;
    }
    
    // Check for duplicate department names
    const departmentNames = validDepartments.map(dept => dept.name.trim().toLowerCase());
    const uniqueNames = new Set(departmentNames);
    if (departmentNames.length !== uniqueNames.size) {
      setError('Department names must be unique');
      return false;
    }

    return true;
  };

  const handleNextSubStep = () => {
    setError(null);
    
    if (currentSubStep === 0) {
      if (!validateInstitutionForm()) return;
    } else if (currentSubStep === 1) {
      if (!validateDepartments()) return;
    }
    
    setCurrentSubStep(prev => Math.min(prev + 1, subSteps.length - 1));
  };

  const handlePreviousSubStep = () => {
    setCurrentSubStep(prev => Math.max(prev - 1, 0));
    setError(null);
  };

  const handleSubmit = async () => {
    if (!validateInstitutionForm() || !validateDepartments()) return;

    setSubmitting(true);
    setError(null);

    try {
      // Create institution
      const institutionResponse = await fetch('/api/institutions/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...institutionData,
          departments: departments.filter(dept => dept.name.trim())
        }),
      });

      const institutionResult = await institutionResponse.json();

      if (!institutionResult.success) {
        throw new Error(institutionResult.error || 'Failed to create institution');
      }

      setSuccess('Institution created successfully!');
      
      // Wait a moment to show success message
      setTimeout(async () => {
        await nextStep();
      }, 1500);

    } catch (error) {
      console.error('Institution creation error:', error);
      setError(error instanceof Error ? error.message : 'Failed to create institution');
    } finally {
      setSubmitting(false);
    }
  };

  const renderInstitutionDetailsStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
          <Building className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Institution Information
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Provide basic information about your institution
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="institution-name">Institution Name *</Label>
          <Input
            id="institution-name"
            type="text"
            placeholder="University of Example"
            value={institutionData.name}
            onChange={(e) => handleInstitutionChange('name', e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="institution-domain">Domain</Label>
          <div className="relative mt-1">
            <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              id="institution-domain"
              type="text"
              placeholder="university.edu"
              value={institutionData.domain}
              onChange={(e) => handleInstitutionChange('domain', e.target.value)}
              className="pl-10"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Optional: Your institution's primary domain
          </p>
        </div>

        <div>
          <Label htmlFor="institution-type">Institution Type</Label>
          <Select
            value={institutionData.type}
            onValueChange={(value) => handleInstitutionChange('type', value as InstitutionType)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={InstitutionType.UNIVERSITY}>University</SelectItem>
              <SelectItem value={InstitutionType.COLLEGE}>College</SelectItem>
              <SelectItem value={InstitutionType.SCHOOL}>School</SelectItem>
              <SelectItem value={InstitutionType.TRAINING_CENTER}>Training Center</SelectItem>
              <SelectItem value={InstitutionType.OTHER}>Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="contact-email">Contact Email *</Label>
          <div className="relative mt-1">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              id="contact-email"
              type="email"
              placeholder="admin@university.edu"
              value={institutionData.contactEmail}
              onChange={(e) => handleInstitutionChange('contactEmail', e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            placeholder="Brief description of your institution..."
            value={institutionData.description}
            onChange={(e) => handleInstitutionChange('description', e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            rows={3}
          />
        </div>
      </div>
    </div>
  );

  const renderDepartmentSetupStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-4">
          <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Department Setup
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Create the initial departments for your institution
        </p>
      </div>

      <div className="space-y-4">
        {departments.map((department, index) => (
          <Card key={index} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Department {index + 1}
                </CardTitle>
                {departments.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeDepartment(index)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Remove
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor={`dept-name-${index}`}>Department Name *</Label>
                <Input
                  id={`dept-name-${index}`}
                  type="text"
                  placeholder="Computer Science"
                  value={department.name}
                  onChange={(e) => handleDepartmentChange(index, 'name', e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor={`dept-code-${index}`}>Department Code</Label>
                <Input
                  id={`dept-code-${index}`}
                  type="text"
                  placeholder="CS"
                  value={department.code}
                  onChange={(e) => handleDepartmentChange(index, 'code', e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor={`dept-desc-${index}`}>Description</Label>
                <Input
                  id={`dept-desc-${index}`}
                  type="text"
                  placeholder="Brief description..."
                  value={department.description}
                  onChange={(e) => handleDepartmentChange(index, 'description', e.target.value)}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>
        ))}

        <Button
          variant="outline"
          onClick={addDepartment}
          className="w-full flex items-center space-x-2"
        >
          <Users className="h-4 w-4" />
          <span>Add Another Department</span>
        </Button>
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="mx-auto w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-4">
          <Settings className="h-6 w-6 text-purple-600 dark:text-purple-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Review & Create
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Review your institution details before creating
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center space-x-2">
              <Building className="h-4 w-4" />
              <span>Institution Details</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Name:</span>
              <span className="text-sm font-medium">{institutionData.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Type:</span>
              <span className="text-sm font-medium capitalize">{institutionData.type.replace('_', ' ')}</span>
            </div>
            {institutionData.domain && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Domain:</span>
                <span className="text-sm font-medium">{institutionData.domain}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Contact:</span>
              <span className="text-sm font-medium">{institutionData.contactEmail}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>Departments ({departments.filter(d => d.name.trim()).length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {departments.filter(dept => dept.name.trim()).map((department, index) => (
                <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                  <div>
                    <span className="text-sm font-medium">{department.name}</span>
                    {department.code && (
                      <span className="text-xs text-gray-500 ml-2">({department.code})</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <p className="text-green-600 text-sm">{success}</p>
        </div>
      )}
    </div>
  );

  const renderCurrentSubStep = () => {
    switch (currentSubStep) {
      case 0:
        return renderInstitutionDetailsStep();
      case 1:
        return renderDepartmentSetupStep();
      case 2:
        return renderReviewStep();
      default:
        return renderInstitutionDetailsStep();
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-step indicator */}
      <div className="flex items-center justify-center space-x-2 mb-8">
        {subSteps.map((step, index) => (
          <div key={index} className="flex items-center">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                index <= currentSubStep
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
              )}
            >
              {index + 1}
            </div>
            {index < subSteps.length - 1 && (
              <div
                className={cn(
                  "w-12 h-0.5 mx-2",
                  index < currentSubStep
                    ? "bg-blue-600"
                    : "bg-gray-200 dark:bg-gray-700"
                )}
              />
            )}
          </div>
        ))}
      </div>

      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {subSteps[currentSubStep]}
        </h2>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {renderCurrentSubStep()}

      {/* Navigation buttons */}
      <div className="flex justify-between pt-6">
        <Button
          variant="outline"
          onClick={handlePreviousSubStep}
          disabled={currentSubStep === 0 || submitting}
        >
          Previous
        </Button>

        {currentSubStep < subSteps.length - 1 ? (
          <Button
            onClick={handleNextSubStep}
            disabled={submitting}
            className="flex items-center space-x-2"
          >
            <span>Next</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center space-x-2"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Creating...</span>
              </>
            ) : (
              <>
                <span>Create Institution</span>
                <CheckCircle className="h-4 w-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}