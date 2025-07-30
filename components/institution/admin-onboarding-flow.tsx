'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Building2, 
  Users, 
  Settings, 
  CheckCircle,
  AlertCircle,
  ArrowRight,
  UserPlus,
  Mail,
  BookOpen,
  Palette,
  Shield,
  Lightbulb
} from 'lucide-react';
import { Institution, Department, ValidationError } from '@/lib/types/institution';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  estimatedTime: string;
  optional?: boolean;
}

interface AdminOnboardingFlowProps {
  institution: Institution;
  onComplete: () => void;
  onSkip?: () => void;
  className?: string;
}

interface OnboardingProgress {
  currentStep: number;
  completedSteps: string[];
  skippedSteps: string[];
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome & Overview',
    description: 'Learn about your admin capabilities',
    icon: Building2,
    estimatedTime: '2 min'
  },
  {
    id: 'profile',
    title: 'Complete Your Profile',
    description: 'Add your personal information',
    icon: Users,
    estimatedTime: '3 min'
  },
  {
    id: 'departments',
    title: 'Create Departments',
    description: 'Set up your first departments',
    icon: BookOpen,
    estimatedTime: '5 min'
  },
  {
    id: 'users',
    title: 'Invite Users',
    description: 'Send invitations to staff and students',
    icon: UserPlus,
    estimatedTime: '5 min',
    optional: true
  },
  {
    id: 'branding',
    title: 'Customize Branding',
    description: 'Personalize your institution\'s appearance',
    icon: Palette,
    estimatedTime: '3 min',
    optional: true
  },
  {
    id: 'settings',
    title: 'Configure Settings',
    description: 'Set up policies and preferences',
    icon: Settings,
    estimatedTime: '4 min',
    optional: true
  },
  {
    id: 'security',
    title: 'Security Setup',
    description: 'Configure security and access controls',
    icon: Shield,
    estimatedTime: '3 min',
    optional: true
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    description: 'Review and finish setup',
    icon: CheckCircle,
    estimatedTime: '1 min'
  }
];

export function AdminOnboardingFlow({ 
  institution, 
  onComplete, 
  onSkip,
  className 
}: AdminOnboardingFlowProps) {
  const [progress, setProgress] = useState<OnboardingProgress>({
    currentStep: 0,
    completedSteps: [],
    skippedSteps: []
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  
  // Form data for various steps
  const [profileData, setProfileData] = useState({
    bio: '',
    title: '',
    department: '',
    phone: '',
    officeLocation: ''
  });

  const [departmentData, setDepartmentData] = useState({
    departments: [{ name: '', description: '', code: '' }]
  });

  const [invitationData, setInvitationData] = useState({
    emails: [''],
    message: ''
  });

  const currentStep = ONBOARDING_STEPS[progress.currentStep];
  const progressPercentage = ((progress.currentStep + 1) / ONBOARDING_STEPS.length) * 100;
  const totalEstimatedTime = ONBOARDING_STEPS.reduce((total, step) => {
    const minutes = parseInt(step.estimatedTime);
    return total + minutes;
  }, 0);

  const handleNext = useCallback(async () => {
    setIsSubmitting(true);
    setErrors([]);

    try {
      // Validate current step
      const validation = await validateCurrentStep();
      if (!validation.isValid) {
        setErrors(validation.errors);
        return;
      }

      // Save current step data
      await saveCurrentStepData();

      // Mark step as completed
      setProgress(prev => ({
        ...prev,
        currentStep: Math.min(prev.currentStep + 1, ONBOARDING_STEPS.length - 1),
        completedSteps: [...prev.completedSteps, currentStep.id]
      }));

    } catch (error) {
      console.error('Error proceeding to next step:', error);
      setErrors([{ field: 'general', message: 'Failed to save progress', code: 'SAVE_ERROR' }]);
    } finally {
      setIsSubmitting(false);
    }
  }, [currentStep, profileData, departmentData, invitationData]);

  const handleSkip = useCallback(() => {
    setProgress(prev => ({
      ...prev,
      currentStep: Math.min(prev.currentStep + 1, ONBOARDING_STEPS.length - 1),
      skippedSteps: [...prev.skippedSteps, currentStep.id]
    }));
  }, [currentStep]);

  const handleComplete = useCallback(async () => {
    setIsSubmitting(true);
    try {
      // Mark onboarding as complete
      await markOnboardingComplete();
      onComplete();
    } catch (error) {
      console.error('Error completing onboarding:', error);
      setErrors([{ field: 'general', message: 'Failed to complete onboarding', code: 'COMPLETE_ERROR' }]);
    } finally {
      setIsSubmitting(false);
    }
  }, [onComplete]);

  const validateCurrentStep = async (): Promise<{ isValid: boolean; errors: ValidationError[] }> => {
    const stepErrors: ValidationError[] = [];

    switch (currentStep.id) {
      case 'profile':
        if (!profileData.title?.trim()) {
          stepErrors.push({ field: 'title', message: 'Title is required', code: 'REQUIRED' });
        }
        break;

      case 'departments':
        if (departmentData.departments.some(dept => !dept.name?.trim())) {
          stepErrors.push({ field: 'departments', message: 'Department name is required', code: 'REQUIRED' });
        }
        if (departmentData.departments.some(dept => !dept.code?.trim())) {
          stepErrors.push({ field: 'departments', message: 'Department code is required', code: 'REQUIRED' });
        }
        break;

      case 'users':
        if (invitationData.emails.some(email => email && !isValidEmail(email))) {
          stepErrors.push({ field: 'emails', message: 'Invalid email format', code: 'INVALID_FORMAT' });
        }
        break;
    }

    return {
      isValid: stepErrors.length === 0,
      errors: stepErrors
    };
  };

  const saveCurrentStepData = async () => {
    // In a real implementation, this would save to the backend
    switch (currentStep.id) {
      case 'profile':
        console.log('Saving profile data:', profileData);
        break;
      case 'departments':
        console.log('Saving department data:', departmentData);
        break;
      case 'users':
        console.log('Saving invitation data:', invitationData);
        break;
    }
  };

  const markOnboardingComplete = async () => {
    // In a real implementation, this would mark onboarding as complete in the backend
    console.log('Marking onboarding as complete');
  };

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    return emailRegex.test(email);
  };

  const renderStepContent = () => {
    switch (currentStep.id) {
      case 'welcome':
        return <WelcomeStep institution={institution} />;
      case 'profile':
        return <ProfileStep data={profileData} onChange={setProfileData} errors={errors} />;
      case 'departments':
        return <DepartmentsStep data={departmentData} onChange={setDepartmentData} errors={errors} />;
      case 'users':
        return <UsersStep data={invitationData} onChange={setInvitationData} errors={errors} />;
      case 'branding':
        return <BrandingStep institution={institution} />;
      case 'settings':
        return <SettingsStep institution={institution} />;
      case 'security':
        return <SecurityStep institution={institution} />;
      case 'complete':
        return <CompleteStep 
          institution={institution} 
          progress={progress} 
          totalSteps={ONBOARDING_STEPS.length} 
        />;
      default:
        return null;
    }
  };

  return (
    <div className={`max-w-4xl mx-auto p-6 ${className}`}>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Welcome to {institution.name}!
        </h1>
        <p className="text-gray-600">
          Let's get your institution set up. This should take about {totalEstimatedTime} minutes.
        </p>
      </div>

      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-gray-700">
            Step {progress.currentStep + 1} of {ONBOARDING_STEPS.length}
          </span>
          <span className="text-sm text-gray-500">
            {Math.round(progressPercentage)}% complete
          </span>
        </div>
        <Progress value={progressPercentage} className="h-2" />
      </div>

      {/* Step Navigation */}
      <div className="mb-8">
        <div className="flex items-center space-x-2 overflow-x-auto pb-2">
          {ONBOARDING_STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === progress.currentStep;
            const isCompleted = progress.completedSteps.includes(step.id);
            const isSkipped = progress.skippedSteps.includes(step.id);

            return (
              <div
                key={step.id}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                  isActive 
                    ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                    : isCompleted
                    ? 'bg-green-100 text-green-700'
                    : isSkipped
                    ? 'bg-gray-100 text-gray-500'
                    : 'bg-gray-50 text-gray-400'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium whitespace-nowrap">
                  {step.title}
                </span>
                {step.optional && (
                  <Badge variant="outline" className="text-xs">
                    Optional
                  </Badge>
                )}
                {isCompleted && (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Current Step Content */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <currentStep.icon className="w-6 h-6 text-blue-600" />
              <div>
                <CardTitle>{currentStep.title}</CardTitle>
                <CardDescription>{currentStep.description}</CardDescription>
              </div>
            </div>
            <Badge variant="secondary">
              {currentStep.estimatedTime}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {errors.length > 0 && (
            <Alert className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please fix the following errors:
                <ul className="mt-2 list-disc list-inside">
                  {errors.map((error, index) => (
                    <li key={index} className="text-sm">
                      {error.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          
          {renderStepContent()}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <div>
          {onSkip && currentStep.optional && (
            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={isSubmitting}
            >
              Skip this step
            </Button>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {currentStep.id === 'complete' ? (
            <Button
              onClick={handleComplete}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? 'Finishing...' : 'Complete Setup'}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Continue'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Step Components
interface StepProps {
  data?: any;
  onChange?: (data: any) => void;
  errors?: ValidationError[];
  institution?: Institution;
}

function WelcomeStep({ institution }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start space-x-4">
          <Building2 className="w-8 h-8 text-blue-600 mt-1" />
          <div>
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              Welcome to your new institution portal!
            </h3>
            <p className="text-blue-700 mb-4">
              As the administrator of {institution?.name}, you have full control over:
            </p>
            <ul className="space-y-2 text-blue-700">
              <li className="flex items-center">
                <CheckCircle className="w-4 h-4 mr-2" />
                Creating and managing departments
              </li>
              <li className="flex items-center">
                <CheckCircle className="w-4 h-4 mr-2" />
                Inviting and managing users
              </li>
              <li className="flex items-center">
                <CheckCircle className="w-4 h-4 mr-2" />
                Customizing branding and settings
              </li>
              <li className="flex items-center">
                <CheckCircle className="w-4 h-4 mr-2" />
                Monitoring analytics and reports
              </li>
              <li className="flex items-center">
                <CheckCircle className="w-4 h-4 mr-2" />
                Configuring integrations and security
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <h4 className="font-medium mb-1">User Management</h4>
            <p className="text-sm text-gray-600">
              Invite staff, teachers, and students
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <BookOpen className="w-8 h-8 text-purple-600 mx-auto mb-2" />
            <h4 className="font-medium mb-1">Department Setup</h4>
            <p className="text-sm text-gray-600">
              Organize your institution structure
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <Settings className="w-8 h-8 text-orange-600 mx-auto mb-2" />
            <h4 className="font-medium mb-1">Configuration</h4>
            <p className="text-sm text-gray-600">
              Customize policies and preferences
            </p>
          </CardContent>
        </Card>
      </div>

      <Alert>
        <Lightbulb className="h-4 w-4" />
        <AlertDescription>
          <strong>Tip:</strong> You can always return to these settings later from your admin dashboard. 
          Feel free to skip optional steps if you want to get started quickly.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ProfileStep({ data, onChange, errors }: StepProps) {
  const getError = (field: string) => errors?.find(e => e.field === field);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Complete Your Administrator Profile</h3>
        <p className="text-gray-600 mb-6">
          This information will be visible to other users in your institution.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="title">Title/Position *</Label>
          <Input
            id="title"
            value={data?.title || ''}
            onChange={(e) => onChange?.({ ...data, title: e.target.value })}
            placeholder="e.g., IT Director, Dean of Students"
            className={getError('title') ? 'border-red-500' : ''}
          />
          {getError('title') && (
            <p className="text-sm text-red-600">{getError('title')?.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="department">Department</Label>
          <Input
            id="department"
            value={data?.department || ''}
            onChange={(e) => onChange?.({ ...data, department: e.target.value })}
            placeholder="e.g., Information Technology"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input
            id="phone"
            type="tel"
            value={data?.phone || ''}
            onChange={(e) => onChange?.({ ...data, phone: e.target.value })}
            placeholder="+1 (555) 123-4567"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="officeLocation">Office Location</Label>
          <Input
            id="officeLocation"
            value={data?.officeLocation || ''}
            onChange={(e) => onChange?.({ ...data, officeLocation: e.target.value })}
            placeholder="e.g., Building A, Room 101"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          value={data?.bio || ''}
          onChange={(e) => onChange?.({ ...data, bio: e.target.value })}
          placeholder="Tell others about yourself and your role..."
          rows={4}
        />
        <p className="text-sm text-gray-500">
          This will be displayed on your profile page
        </p>
      </div>
    </div>
  );
}

function DepartmentsStep({ data, onChange, errors }: StepProps) {
  const getError = (field: string) => errors?.find(e => e.field === field);

  const addDepartment = () => {
    onChange?.({
      ...data,
      departments: [...(data?.departments || []), { name: '', description: '', code: '' }]
    });
  };

  const removeDepartment = (index: number) => {
    const departments = [...(data?.departments || [])];
    departments.splice(index, 1);
    onChange?.({ ...data, departments });
  };

  const updateDepartment = (index: number, updates: any) => {
    const departments = [...(data?.departments || [])];
    departments[index] = { ...departments[index], ...updates };
    onChange?.({ ...data, departments });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Create Your First Departments</h3>
        <p className="text-gray-600 mb-6">
          Departments help organize your institution. You can always add more later.
        </p>
      </div>

      {getError('departments') && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{getError('departments')?.message}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {(data?.departments || [{ name: '', description: '', code: '' }]).map((dept: any, index: number) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium">Department {index + 1}</h4>
                {index > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeDepartment(index)}
                  >
                    Remove
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`dept-name-${index}`}>Department Name *</Label>
                  <Input
                    id={`dept-name-${index}`}
                    value={dept.name}
                    onChange={(e) => updateDepartment(index, { name: e.target.value })}
                    placeholder="e.g., Computer Science"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`dept-code-${index}`}>Department Code *</Label>
                  <Input
                    id={`dept-code-${index}`}
                    value={dept.code}
                    onChange={(e) => updateDepartment(index, { code: e.target.value })}
                    placeholder="e.g., CS"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`dept-desc-${index}`}>Description</Label>
                  <Textarea
                    id={`dept-desc-${index}`}
                    value={dept.description}
                    onChange={(e) => updateDepartment(index, { description: e.target.value })}
                    placeholder="Brief description of the department..."
                    rows={2}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button
        variant="outline"
        onClick={addDepartment}
        className="w-full"
      >
        <BookOpen className="w-4 h-4 mr-2" />
        Add Another Department
      </Button>
    </div>
  );
}

function UsersStep({ data, onChange, errors }: StepProps) {
  const getError = (field: string) => errors?.find(e => e.field === field);

  const addEmail = () => {
    onChange?.({
      ...data,
      emails: [...(data?.emails || []), '']
    });
  };

  const removeEmail = (index: number) => {
    const emails = [...(data?.emails || [])];
    emails.splice(index, 1);
    onChange?.({ ...data, emails });
  };

  const updateEmail = (index: number, email: string) => {
    const emails = [...(data?.emails || [])];
    emails[index] = email;
    onChange?.({ ...data, emails });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Invite Your First Users</h3>
        <p className="text-gray-600 mb-6">
          Send invitations to staff, teachers, and students. You can skip this step and invite users later.
        </p>
      </div>

      {getError('emails') && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{getError('emails')?.message}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <Label>Email Addresses</Label>
        {(data?.emails || ['']).map((email: string, index: number) => (
          <div key={index} className="flex items-center space-x-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => updateEmail(index, e.target.value)}
              placeholder="user@example.edu"
              className="flex-1"
            />
            {index > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeEmail(index)}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
        
        <Button
          variant="outline"
          onClick={addEmail}
          size="sm"
        >
          <Mail className="w-4 h-4 mr-2" />
          Add Another Email
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="invitation-message">Custom Message (Optional)</Label>
        <Textarea
          id="invitation-message"
          value={data?.message || ''}
          onChange={(e) => onChange?.({ ...data, message: e.target.value })}
          placeholder="Add a personal message to your invitations..."
          rows={3}
        />
      </div>

      <Alert>
        <Mail className="h-4 w-4" />
        <AlertDescription>
          Invitations will be sent with instructions to create accounts and join your institution.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function BrandingStep({ institution }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Customize Your Institution's Branding</h3>
        <p className="text-gray-600 mb-6">
          Make your portal feel like home with custom colors and branding.
        </p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <Palette className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h4 className="font-medium text-gray-900 mb-2">Branding Customization</h4>
        <p className="text-gray-600 mb-4">
          Advanced branding options will be available in your admin dashboard after setup.
        </p>
        <p className="text-sm text-gray-500">
          Current colors: Primary {institution?.branding?.primaryColor}, 
          Accent {institution?.branding?.accentColor}
        </p>
      </div>

      <Alert>
        <Lightbulb className="h-4 w-4" />
        <AlertDescription>
          You can upload your logo, customize colors, and create email templates from the 
          admin dashboard after completing this setup.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function SettingsStep({ institution }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Review Initial Settings</h3>
        <p className="text-gray-600 mb-6">
          Your institution has been configured with these default settings.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">User Registration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm">Self Registration</span>
                <Badge variant={institution?.settings?.allowSelfRegistration ? 'default' : 'secondary'}>
                  {institution?.settings?.allowSelfRegistration ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Email Verification</span>
                <Badge variant={institution?.settings?.requireEmailVerification ? 'default' : 'secondary'}>
                  {institution?.settings?.requireEmailVerification ? 'Required' : 'Optional'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Default Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm">Default Role</span>
                <Badge variant="outline">
                  {institution?.settings?.defaultUserRole || 'Student'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Subscription</span>
                <Badge variant="outline">
                  {institution?.subscription?.plan || 'Free'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Alert>
        <Settings className="h-4 w-4" />
        <AlertDescription>
          All these settings can be modified from your admin dashboard. You'll have full control 
          over user permissions, policies, and institutional preferences.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function SecurityStep({ institution }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Security & Access Controls</h3>
        <p className="text-gray-600 mb-6">
          Your institution is protected with enterprise-grade security features.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3 mb-3">
              <Shield className="w-6 h-6 text-green-600" />
              <h4 className="font-medium">Data Protection</h4>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• Multi-tenant data isolation</li>
              <li>• Encrypted data storage</li>
              <li>• Regular security audits</li>
              <li>• GDPR & FERPA compliance</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3 mb-3">
              <Users className="w-6 h-6 text-blue-600" />
              <h4 className="font-medium">Access Control</h4>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• Role-based permissions</li>
              <li>• SSO integration ready</li>
              <li>• Session management</li>
              <li>• Audit logging</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          <strong>Security Tip:</strong> Consider setting up SSO integration and two-factor 
          authentication for enhanced security. These options are available in your admin dashboard.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function CompleteStep({ institution, progress, totalSteps }: StepProps & { 
  progress: OnboardingProgress; 
  totalSteps: number; 
}) {
  const completedCount = progress.completedSteps.length;
  const skippedCount = progress.skippedSteps.length;

  return (
    <div className="space-y-6 text-center">
      <div className="bg-green-50 border border-green-200 rounded-lg p-8">
        <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
        <h3 className="text-2xl font-bold text-green-900 mb-2">
          Congratulations!
        </h3>
        <p className="text-green-700 mb-4">
          {institution?.name} is now ready to use.
        </p>
        <div className="flex justify-center space-x-6 text-sm">
          <div>
            <span className="font-medium text-green-800">{completedCount}</span>
            <span className="text-green-600"> steps completed</span>
          </div>
          {skippedCount > 0 && (
            <div>
              <span className="font-medium text-gray-600">{skippedCount}</span>
              <span className="text-gray-500"> steps skipped</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Building2 className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <h4 className="font-medium mb-1">Admin Dashboard</h4>
            <p className="text-sm text-gray-600">
              Access your full admin controls
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <h4 className="font-medium mb-1">User Management</h4>
            <p className="text-sm text-gray-600">
              Invite and manage your users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <Settings className="w-8 h-8 text-purple-600 mx-auto mb-2" />
            <h4 className="font-medium mb-1">Settings</h4>
            <p className="text-sm text-gray-600">
              Customize your institution
            </p>
          </CardContent>
        </Card>
      </div>

      <Alert>
        <Lightbulb className="h-4 w-4" />
        <AlertDescription>
          <strong>What's Next?</strong> You can always return to complete skipped steps or 
          modify settings from your admin dashboard. Welcome to your new institution portal!
        </AlertDescription>
      </Alert>
    </div>
  );
}