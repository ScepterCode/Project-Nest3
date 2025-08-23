'use client';

import React, { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Building2,
  Mail,
  MapPin,
  Palette,
  Settings,
  Users,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Upload,
} from 'lucide-react';
import {
  InstitutionType,
  InstitutionCreationData,
  ContactInfo,
  Address,
  BrandingConfig,
  ValidationError,
} from '@/lib/types/institution';

interface AdminAccountData {
  email: string;
  firstName: string;
  lastName: string;
  title?: string;
  phone?: string;
}

interface InstitutionSetupWizardProps {
  onComplete: (
    data: InstitutionCreationData,
    adminData: AdminAccountData
  ) => Promise<void>;
  onCancel?: () => void;
  initialData?: Partial<InstitutionCreationData>;
  className?: string;
}

const SETUP_STEPS = [
  {
    id: 'basic',
    title: 'Basic Information',
    description: 'Institution name, type, and domain',
    icon: Building2,
    required: true,
  },
  {
    id: 'contact',
    title: 'Contact Details',
    description: 'Contact information and address',
    icon: Mail,
    required: true,
  },
  {
    id: 'admin',
    title: 'Administrator Account',
    description: 'Primary administrator details',
    icon: Users,
    required: true,
  },
  {
    id: 'branding',
    title: 'Branding & Appearance',
    description: 'Colors, logo, and visual identity',
    icon: Palette,
    required: false,
  },
  {
    id: 'settings',
    title: 'Initial Settings',
    description: 'Basic configuration preferences',
    icon: Settings,
    required: false,
  },
  {
    id: 'review',
    title: 'Review & Confirm',
    description: 'Review all settings before creation',
    icon: CheckCircle,
    required: true,
  },
];

// --- WIZARD COMPONENT ---
export function InstitutionSetupWizard({
  onComplete,
  onCancel,
  initialData,
  className,
}: InstitutionSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  // Form data state
  const [institutionData, setInstitutionData] = useState<
    Partial<InstitutionCreationData>
  >({
    name: '',
    domain: '',
    subdomain: '',
    type: 'university',
    contactInfo: {
      email: '',
      phone: '',
      website: '',
    },
    address: {
      street: '',
      city: '',
      state: '',
      postalCode: '',
      country: '',
    },
    branding: {
      primaryColor: '#1f2937',
      secondaryColor: '#374151',
      accentColor: '#3b82f6',
    },
    settings: {
      allowSelfRegistration: false,
      requireEmailVerification: true,
      defaultUserRole: 'student',
    },
    ...initialData,
  });

  const [adminData, setAdminData] = useState<AdminAccountData>({
    email: '',
    firstName: '',
    lastName: '',
    title: '',
    phone: '',
  });

  const currentStepData = SETUP_STEPS[currentStep];
  const progress = ((currentStep + 1) / SETUP_STEPS.length) * 100;

  const updateInstitutionData = useCallback(
    (updates: Partial<InstitutionCreationData>) => {
      setInstitutionData(prev => ({ ...prev, ...updates }));
      setErrors([]);
    },
    []
  );

  const updateAdminData = useCallback((updates: Partial<AdminAccountData>) => {
    setAdminData(prev => ({ ...prev, ...updates }));
    setErrors([]);
  }, []);

  const validateCurrentStep = useCallback((): boolean => {
    const stepErrors: ValidationError[] = [];

    switch (currentStepData.id) {
      case 'basic':
        if (!institutionData.name?.trim()) {
          stepErrors.push({
            field: 'name',
            message: 'Institution name is required',
            code: 'REQUIRED',
          });
        }
        if (!institutionData.domain?.trim()) {
          stepErrors.push({
            field: 'domain',
            message: 'Domain is required',
            code: 'REQUIRED',
          });
        }
        if (!institutionData.type) {
          stepErrors.push({
            field: 'type',
            message: 'Institution type is required',
            code: 'REQUIRED',
          });
        }
        break;

      case 'contact':
        if (!institutionData.contactInfo?.email?.trim()) {
          stepErrors.push({
            field: 'contactInfo.email',
            message: 'Contact email is required',
            code: 'REQUIRED',
          });
        }
        break;

      case 'admin':
        if (!adminData.email?.trim()) {
          stepErrors.push({
            field: 'admin.email',
            message: 'Administrator email is required',
            code: 'REQUIRED',
          });
        }
        if (!adminData.firstName?.trim()) {
          stepErrors.push({
            field: 'admin.firstName',
            message: 'First name is required',
            code: 'REQUIRED',
          });
        }
        if (!adminData.lastName?.trim()) {
          stepErrors.push({
            field: 'admin.lastName',
            message: 'Last name is required',
            code: 'REQUIRED',
          });
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
      setErrors([
        {
          field: 'general',
          message: 'Setup failed. Please try again.',
          code: 'SUBMIT_ERROR',
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }, [validateCurrentStep, onComplete, institutionData, adminData]);

  // ...
  // (your Step rendering logic continues here)
}
