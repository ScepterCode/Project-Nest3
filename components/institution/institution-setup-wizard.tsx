'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Building2, 
  Mail, 
  Phone, 
  Globe, 
  MapPin, 
  Palette, 
  Settings, 
  Users, 
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Upload
} from 'lucide-react';
import { 
  InstitutionType, 
  InstitutionCreationData, 
  ContactInfo, 
  Address, 
  BrandingConfig,
  ValidationError 
} from '@/lib/types/institution';

interface SetupStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  required: boolean;
}

interface AdminAccountData {
  email: string;
  firstName: string;
  lastName: string;
  title?: string;
  phone?: string;
}

interface InstitutionSetupWizardProps {
  onComplete: (data: InstitutionCreationData, adminData: AdminAccountData) => Promise<void>;
  onCancel?: () => void;
  initialData?: Partial<InstitutionCreationData>;
  className?: string;
}

const SETUP_STEPS: SetupStep[] = [
  {
    id: 'basic',
    title: 'Basic Information',
    description: 'Institution name, type, and domain',
    icon: Building2,
    required: true
  },
  {
    id: 'contact',
    title: 'Contact Details',
    description: 'Contact information and address',
    icon: Mail,
    required: true
  },
  {
    id: 'admin',
    title: 'Administrator Account',
    description: 'Primary administrator details',
    icon: Users,
    required: true
  },
  {
    id: 'branding',
    title: 'Branding & Appearance',
    description: 'Colors, logo, and visual identity',
    icon: Palette,
    required: false
  },
  {
    id: 'settings',
    title: 'Initial Settings',
    description: 'Basic configuration preferences',
    icon: Settings,
    required: false
  },
  {
    id: 'review',
    title: 'Review & Confirm',
    description: 'Review all settings before creation',
    icon: CheckCircle,
    required: true
  }
];

export function InstitutionSetupWizard({ 
  onComplete, 
  onCancel, 
  initialData,
  className 
}: InstitutionSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  
  // Form data state
  const [institutionData, setInstitutionData] = useState<Partial<InstitutionCreationData>>({
    name: '',
    domain: '',
    subdomain: '',
    type: 'university',
    contactInfo: {
      email: '',
      phone: '',
      website: ''
    },
    address: {
      street: '',
      city: '',
      state: '',
      postalCode: '',
      country: ''
    },
    branding: {
      primaryColor: '#1f2937',
      secondaryColor: '#374151',
      accentColor: '#3b82f6'
    },
    settings: {
      allowSelfRegistration: false,
      requireEmailVerification: true,
      defaultUserRole: 'student'
    },
    ...initialData
  });

  const [adminData, setAdminData] = useState<AdminAccountData>({
    email: '',
    firstName: '',
    lastName: '',
    title: '',
    phone: ''
  });

  const currentStepData = SETUP_STEPS[currentStep];
  const progress = ((currentStep + 1) / SETUP_STEPS.length) * 100;

  const updateInstitutionData = useCallback((updates: Partial<InstitutionCreationData>) => {
    setInstitutionData(prev => ({
      ...prev,
      ...updates
    }));
    setErrors([]);
  }, []);

  const updateAdminData = useCallback((updates: Partial<AdminAccountData>) => {
    setAdminData(prev => ({
      ...prev,
      ...updates
    }));
    setErrors([]);
  }, []);

  const validateCurrentStep = useCallback((): boolean => {
    const stepErrors: ValidationError[] = [];

    switch (currentStepData.id) {
      case 'basic':
        if (!institutionData.name?.trim()) {
          stepErrors.push({ field: 'name', message: 'Institution name is required', code: 'REQUIRED' });
        }
        if (!institutionData.domain?.trim()) {
          stepErrors.push({ field: 'domain', message: 'Domain is required', code: 'REQUIRED' });
        }
        if (!institutionData.type) {
          stepErrors.push({ field: 'type', message: 'Institution type is required', code: 'REQUIRED' });
        }
        break;

      case 'contact':
        if (!institutionData.contactInfo?.email?.trim()) {
          stepErrors.push({ field: 'contactInfo.email', message: 'Contact email is required', code: 'REQUIRED' });
        }
        break;

      case 'admin':
        if (!adminData.email?.trim()) {
          stepErrors.push({ field: 'admin.email', message: 'Administrator email is required', code: 'REQUIRED' });
        }
        if (!adminData.firstName?.trim()) {
          stepErrors.push({ field: 'admin.firstName', message: 'First name is required', code: 'REQUIRED' });
        }
        if (!adminData.lastName?.trim()) {
          stepErrors.push({ field: 'admin.lastName', message: 'Last name is required', code: 'REQUIRED' });
        }
        break;
    }

    setErrors(stepErrors);
    return stepErrors.length === 0;
  }, [currentStepData.id, institutionData, adminData]);

  const handleNext = useCallback(() => {
    if (validateCurrentStep()) {
      setCurrentStep(prev => Math.min(prev + 1, SETUP_STEPS.length - 1));
    }
  }, [validateCurrentStep]);

  const handlePrevious = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
    setErrors([]);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!validateCurrentStep()) return;

    setIsSubmitting(true);
    try {
      await onComplete(institutionData as InstitutionCreationData, adminData);
    } catch (error) {
      console.error('Setup failed:', error);
      setErrors([{ field: 'general', message: 'Setup failed. Please try again.', code: 'SUBMIT_ERROR' }]);
    } finally {
      setIsSubmitting(false);
    }
  }, [validateCurrentStep, onComplete, institutionData, adminData]);

  const renderStepContent = () => {
    switch (currentStepData.id) {
      case 'basic':
        return <BasicInformationStep 
          data={institutionData} 
          onChange={updateInstitutionData}
          errors={errors}
        />;
      
      case 'contact':
        return <ContactDetailsStep 
          data={institutionData} 
          onChange={updateInstitutionData}
          errors={errors}
        />;
      
      case 'admin':
        return <AdminAccountStep 
          data={adminData} 
          onChange={updateAdminData}
          errors={errors}
        />;
      
      case 'branding':
        return <BrandingStep 
          data={institutionData} 
          onChange={updateInstitutionData}
          errors={errors}
        />;
      
      case 'settings':
        return <SettingsStep 
          data={institutionData} 
          onChange={updateInstitutionData}
          errors={errors}
        />;
      
      case 'review':
        return <ReviewStep 
          institutionData={institutionData as InstitutionCreationData}
          adminData={adminData}
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
          Institution Setup
        </h1>
        <p className="text-gray-600">
          Set up your institution with our step-by-step wizard
        </p>
      </div>

      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-gray-700">
            Step {currentStep + 1} of {SETUP_STEPS.length}
          </span>
          <span className="text-sm text-gray-500">
            {Math.round(progress)}% complete
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Step Navigation */}
      <div className="mb-8">
        <div className="flex items-center space-x-4 overflow-x-auto pb-2">
          {SETUP_STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            const isAccessible = index <= currentStep;

            return (
              <div
                key={step.id}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  isActive 
                    ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                    : isCompleted
                    ? 'bg-green-100 text-green-700'
                    : isAccessible
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                }`}
                onClick={() => isAccessible && setCurrentStep(index)}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium whitespace-nowrap">
                  {step.title}
                </span>
                {step.required && (
                  <Badge variant="secondary" className="text-xs">
                    Required
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
          <div className="flex items-center space-x-3">
            <currentStepData.icon className="w-6 h-6 text-blue-600" />
            <div>
              <CardTitle>{currentStepData.title}</CardTitle>
              <CardDescription>{currentStepData.description}</CardDescription>
            </div>
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
          {currentStep > 0 && (
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={isSubmitting}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {onCancel && (
            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          )}
          
          {currentStep < SETUP_STEPS.length - 1 ? (
            <Button
              onClick={handleNext}
              disabled={isSubmitting}
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? 'Creating Institution...' : 'Create Institution'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Step Components
interface StepProps {
  data: any;
  onChange: (updates: any) => void;
  errors: ValidationError[];
}

function BasicInformationStep({ data, onChange, errors }: StepProps) {
  const getError = (field: string) => errors.find(e => e.field === field);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="name">Institution Name *</Label>
          <Input
            id="name"
            value={data.name || ''}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g., University of Example"
            className={getError('name') ? 'border-red-500' : ''}
          />
          {getError('name') && (
            <p className="text-sm text-red-600">{getError('name')?.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">Institution Type *</Label>
          <Select
            value={data.type || ''}
            onValueChange={(value: InstitutionType) => onChange({ type: value })}
          >
            <SelectTrigger className={getError('type') ? 'border-red-500' : ''}>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="university">University</SelectItem>
              <SelectItem value="college">College</SelectItem>
              <SelectItem value="school">School</SelectItem>
              <SelectItem value="training_center">Training Center</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          {getError('type') && (
            <p className="text-sm text-red-600">{getError('type')?.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="domain">Primary Domain *</Label>
          <Input
            id="domain"
            value={data.domain || ''}
            onChange={(e) => onChange({ domain: e.target.value })}
            placeholder="e.g., example.edu"
            className={getError('domain') ? 'border-red-500' : ''}
          />
          <p className="text-sm text-gray-500">
            This will be used for email domains and system identification
          </p>
          {getError('domain') && (
            <p className="text-sm text-red-600">{getError('domain')?.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="subdomain">Subdomain (Optional)</Label>
          <Input
            id="subdomain"
            value={data.subdomain || ''}
            onChange={(e) => onChange({ subdomain: e.target.value })}
            placeholder="e.g., portal"
          />
          <p className="text-sm text-gray-500">
            For custom portal URLs like portal.example.edu
          </p>
        </div>
      </div>
    </div>
  );
}f
unction ContactDetailsStep({ data, onChange, errors }: StepProps) {
  const getError = (field: string) => errors.find(e => e.field === field);

  const updateContactInfo = (updates: Partial<ContactInfo>) => {
    onChange({
      contactInfo: {
        ...data.contactInfo,
        ...updates
      }
    });
  };

  const updateAddress = (updates: Partial<Address>) => {
    onChange({
      address: {
        ...data.address,
        ...updates
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Contact Information */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Mail className="w-5 h-5 mr-2" />
          Contact Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="contact-email">Primary Email *</Label>
            <Input
              id="contact-email"
              type="email"
              value={data.contactInfo?.email || ''}
              onChange={(e) => updateContactInfo({ email: e.target.value })}
              placeholder="admin@example.edu"
              className={getError('contactInfo.email') ? 'border-red-500' : ''}
            />
            {getError('contactInfo.email') && (
              <p className="text-sm text-red-600">{getError('contactInfo.email')?.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-phone">Phone Number</Label>
            <Input
              id="contact-phone"
              type="tel"
              value={data.contactInfo?.phone || ''}
              onChange={(e) => updateContactInfo({ phone: e.target.value })}
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              value={data.contactInfo?.website || ''}
              onChange={(e) => updateContactInfo({ website: e.target.value })}
              placeholder="https://www.example.edu"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Address */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <MapPin className="w-5 h-5 mr-2" />
          Address
        </h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="street">Street Address</Label>
            <Input
              id="street"
              value={data.address?.street || ''}
              onChange={(e) => updateAddress({ street: e.target.value })}
              placeholder="123 University Ave"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={data.address?.city || ''}
                onChange={(e) => updateAddress({ city: e.target.value })}
                placeholder="Example City"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State/Province</Label>
              <Input
                id="state"
                value={data.address?.state || ''}
                onChange={(e) => updateAddress({ state: e.target.value })}
                placeholder="CA"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input
                id="postalCode"
                value={data.address?.postalCode || ''}
                onChange={(e) => updateAddress({ postalCode: e.target.value })}
                placeholder="12345"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={data.address?.country || ''}
              onChange={(e) => updateAddress({ country: e.target.value })}
              placeholder="United States"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminAccountStep({ data, onChange, errors }: StepProps) {
  const getError = (field: string) => errors.find(e => e.field.startsWith('admin.') && e.field.includes(field));

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Users className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900">Administrator Account</h4>
            <p className="text-sm text-blue-700 mt-1">
              This person will have full administrative access to manage the institution, 
              create departments, and invite users.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="admin-firstName">First Name *</Label>
          <Input
            id="admin-firstName"
            value={data.firstName || ''}
            onChange={(e) => onChange({ firstName: e.target.value })}
            placeholder="John"
            className={getError('firstName') ? 'border-red-500' : ''}
          />
          {getError('firstName') && (
            <p className="text-sm text-red-600">{getError('firstName')?.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-lastName">Last Name *</Label>
          <Input
            id="admin-lastName"
            value={data.lastName || ''}
            onChange={(e) => onChange({ lastName: e.target.value })}
            placeholder="Doe"
            className={getError('lastName') ? 'border-red-500' : ''}
          />
          {getError('lastName') && (
            <p className="text-sm text-red-600">{getError('lastName')?.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="admin-email">Email Address *</Label>
        <Input
          id="admin-email"
          type="email"
          value={data.email || ''}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder="john.doe@example.edu"
          className={getError('email') ? 'border-red-500' : ''}
        />
        <p className="text-sm text-gray-500">
          An invitation will be sent to this email address
        </p>
        {getError('email') && (
          <p className="text-sm text-red-600">{getError('email')?.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="admin-title">Title/Position</Label>
          <Input
            id="admin-title"
            value={data.title || ''}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="e.g., IT Director, Dean"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-phone">Phone Number</Label>
          <Input
            id="admin-phone"
            type="tel"
            value={data.phone || ''}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="+1 (555) 123-4567"
          />
        </div>
      </div>
    </div>
  );
}

function BrandingStep({ data, onChange, errors }: StepProps) {
  const updateBranding = (updates: Partial<BrandingConfig>) => {
    onChange({
      branding: {
        ...data.branding,
        ...updates
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Palette className="w-5 h-5 text-gray-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-900">Visual Identity</h4>
            <p className="text-sm text-gray-600 mt-1">
              Customize the appearance of your institution's portal. You can change these settings later.
            </p>
          </div>
        </div>
      </div>

      {/* Color Scheme */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Color Scheme</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="primaryColor">Primary Color</Label>
            <div className="flex items-center space-x-3">
              <Input
                id="primaryColor"
                type="color"
                value={data.branding?.primaryColor || '#1f2937'}
                onChange={(e) => updateBranding({ primaryColor: e.target.value })}
                className="w-16 h-10 p-1 border rounded"
              />
              <Input
                value={data.branding?.primaryColor || '#1f2937'}
                onChange={(e) => updateBranding({ primaryColor: e.target.value })}
                placeholder="#1f2937"
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="secondaryColor">Secondary Color</Label>
            <div className="flex items-center space-x-3">
              <Input
                id="secondaryColor"
                type="color"
                value={data.branding?.secondaryColor || '#374151'}
                onChange={(e) => updateBranding({ secondaryColor: e.target.value })}
                className="w-16 h-10 p-1 border rounded"
              />
              <Input
                value={data.branding?.secondaryColor || '#374151'}
                onChange={(e) => updateBranding({ secondaryColor: e.target.value })}
                placeholder="#374151"
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accentColor">Accent Color</Label>
            <div className="flex items-center space-x-3">
              <Input
                id="accentColor"
                type="color"
                value={data.branding?.accentColor || '#3b82f6'}
                onChange={(e) => updateBranding({ accentColor: e.target.value })}
                className="w-16 h-10 p-1 border rounded"
              />
              <Input
                value={data.branding?.accentColor || '#3b82f6'}
                onChange={(e) => updateBranding({ accentColor: e.target.value })}
                placeholder="#3b82f6"
                className="flex-1"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Logo Upload */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Logo</h3>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600 mb-2">
            Upload your institution's logo
          </p>
          <p className="text-xs text-gray-500">
            Recommended: PNG or SVG, max 2MB
          </p>
          <Button variant="outline" className="mt-3" disabled>
            Choose File
          </Button>
          <p className="text-xs text-gray-400 mt-2">
            Logo upload will be available after institution creation
          </p>
        </div>
      </div>

      {/* Welcome Message */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Welcome Message</h3>
        <div className="space-y-2">
          <Label htmlFor="welcomeMessage">Custom Welcome Message</Label>
          <Textarea
            id="welcomeMessage"
            value={data.branding?.welcomeMessage || ''}
            onChange={(e) => updateBranding({ welcomeMessage: e.target.value })}
            placeholder="Welcome to our learning platform..."
            rows={3}
          />
          <p className="text-sm text-gray-500">
            This message will be displayed on the login page
          </p>
        </div>
      </div>
    </div>
  );
}

function SettingsStep({ data, onChange, errors }: StepProps) {
  const updateSettings = (updates: any) => {
    onChange({
      settings: {
        ...data.settings,
        ...updates
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Settings className="w-5 h-5 text-gray-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-900">Initial Configuration</h4>
            <p className="text-sm text-gray-600 mt-1">
              These settings can be modified later from the admin dashboard.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="allowSelfRegistration">Allow Self Registration</Label>
            <p className="text-sm text-gray-500">
              Let users register themselves without an invitation
            </p>
          </div>
          <input
            id="allowSelfRegistration"
            type="checkbox"
            checked={data.settings?.allowSelfRegistration || false}
            onChange={(e) => updateSettings({ allowSelfRegistration: e.target.checked })}
            className="rounded border-gray-300"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="requireEmailVerification">Require Email Verification</Label>
            <p className="text-sm text-gray-500">
              Users must verify their email before accessing the system
            </p>
          </div>
          <input
            id="requireEmailVerification"
            type="checkbox"
            checked={data.settings?.requireEmailVerification !== false}
            onChange={(e) => updateSettings({ requireEmailVerification: e.target.checked })}
            className="rounded border-gray-300"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultUserRole">Default User Role</Label>
          <Select
            value={data.settings?.defaultUserRole || 'student'}
            onValueChange={(value) => updateSettings({ defaultUserRole: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="teacher">Teacher</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-gray-500">
            Role assigned to new users by default
          </p>
        </div>
      </div>
    </div>
  );
}

function ReviewStep({ institutionData, adminData }: { 
  institutionData: InstitutionCreationData; 
  adminData: AdminAccountData; 
}) {
  return (
    <div className="space-y-6">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-green-900">Ready to Create</h4>
            <p className="text-sm text-green-700 mt-1">
              Please review all information before creating your institution.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Institution Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Building2 className="w-5 h-5 mr-2" />
              Institution Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Name</Label>
              <p className="text-sm text-gray-600">{institutionData.name}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Type</Label>
              <p className="text-sm text-gray-600 capitalize">
                {institutionData.type.replace('_', ' ')}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">Domain</Label>
              <p className="text-sm text-gray-600">{institutionData.domain}</p>
            </div>
            {institutionData.subdomain && (
              <div>
                <Label className="text-sm font-medium">Subdomain</Label>
                <p className="text-sm text-gray-600">{institutionData.subdomain}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Administrator */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="w-5 h-5 mr-2" />
              Administrator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Name</Label>
              <p className="text-sm text-gray-600">
                {adminData.firstName} {adminData.lastName}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">Email</Label>
              <p className="text-sm text-gray-600">{adminData.email}</p>
            </div>
            {adminData.title && (
              <div>
                <Label className="text-sm font-medium">Title</Label>
                <p className="text-sm text-gray-600">{adminData.title}</p>
              </div>
            )}
            {adminData.phone && (
              <div>
                <Label className="text-sm font-medium">Phone</Label>
                <p className="text-sm text-gray-600">{adminData.phone}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Mail className="w-5 h-5 mr-2" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Email</Label>
              <p className="text-sm text-gray-600">{institutionData.contactInfo.email}</p>
            </div>
            {institutionData.contactInfo.phone && (
              <div>
                <Label className="text-sm font-medium">Phone</Label>
                <p className="text-sm text-gray-600">{institutionData.contactInfo.phone}</p>
              </div>
            )}
            {institutionData.contactInfo.website && (
              <div>
                <Label className="text-sm font-medium">Website</Label>
                <p className="text-sm text-gray-600">{institutionData.contactInfo.website}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Branding */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Palette className="w-5 h-5 mr-2" />
              Branding
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center space-x-3">
              <div
                className="w-6 h-6 rounded border"
                style={{ backgroundColor: institutionData.branding?.primaryColor }}
              />
              <div>
                <Label className="text-sm font-medium">Primary Color</Label>
                <p className="text-sm text-gray-600">{institutionData.branding?.primaryColor}</p>
              </div>
            </div>
            {institutionData.branding?.welcomeMessage && (
              <div>
                <Label className="text-sm font-medium">Welcome Message</Label>
                <p className="text-sm text-gray-600">{institutionData.branding.welcomeMessage}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          After creation, an invitation email will be sent to the administrator. 
          The institution will be in pending status until the administrator accepts the invitation.
        </AlertDescription>
      </Alert>
    </div>
  );
}