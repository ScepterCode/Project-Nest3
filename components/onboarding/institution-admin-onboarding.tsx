'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft,
  ArrowRight,
  Building,
  CheckCircle,
  Layers,
  Plus,
  Shield,
  X,
} from 'lucide-react';

// Every answer here is used: the name and job title go on the admin's
// profile and the school's main contact; the school details and departments
// create the school (set_up_my_institution) when onboarding finishes.

export interface InstitutionAdminOnboardingData {
  firstName: string;
  lastName: string;
  jobTitle: string;
  institutionName: string;
  institutionType: string;
  institutionSize: string;
  contactEmail: string;
  contactPhone: string;
  departments: string[];
}

interface InstitutionAdminOnboardingProps {
  onComplete: (data: InstitutionAdminOnboardingData) => void;
  userName?: string;
  /** Pre-fills the school's contact email. */
  userEmail?: string;
  /** True while the parent saves; disables the finish button. */
  saving?: boolean;
  /** Name from sign-up, pre-filled so it isn't typed twice. */
  defaultFirstName?: string;
  defaultLastName?: string;
}

const INSTITUTION_TYPES = [
  'Animation academy or studio school',
  'Art & design school',
  'University',
  'College / polytechnic',
  'Secondary school',
  'Primary school',
  'Training centre',
  'Other',
];

const INSTITUTION_SIZES = [
  'Up to 100 learners',
  '101–500 learners',
  '501–2,000 learners',
  'More than 2,000 learners',
];

// Suggestions only; admins can add their own and change them later.
const SUGGESTED_DEPARTMENTS = [
  '2D Animation',
  '3D Animation',
  'Storyboarding',
  'Character Design',
  'Visual Effects (VFX)',
  'Motion Graphics',
  'Game Art',
  'Illustration',
  'Film & Video',
  'Sound Design',
  'Foundation Year',
];

const STEPS = ['About you', 'Your school', 'Departments', 'Review'];

export function InstitutionAdminOnboarding({
  onComplete,
  userName = 'there',
  userEmail = '',
  saving = false,
  defaultFirstName = '',
  defaultLastName = '',
}: InstitutionAdminOnboardingProps) {
  const [step, setStep] = useState(0);
  const [customDepartment, setCustomDepartment] = useState('');
  const [data, setData] = useState<InstitutionAdminOnboardingData>({
    firstName: defaultFirstName,
    lastName: defaultLastName,
    jobTitle: '',
    institutionName: '',
    institutionType: '',
    institutionSize: '',
    contactEmail: userEmail,
    contactPhone: '',
    departments: [],
  });

  const update = (changes: Partial<InstitutionAdminOnboardingData>) =>
    setData(prev => ({ ...prev, ...changes }));

  const toggleDepartment = (name: string) =>
    update({
      departments: data.departments.includes(name)
        ? data.departments.filter(d => d !== name)
        : [...data.departments, name],
    });

  const addCustomDepartment = () => {
    const name = customDepartment.trim().slice(0, 100);
    if (
      name &&
      !data.departments.some(d => d.toLowerCase() === name.toLowerCase())
    ) {
      update({ departments: [...data.departments, name] });
    }
    setCustomDepartment('');
  };

  const emailOk =
    !data.contactEmail.trim() ||
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.contactEmail.trim());

  const canProceed = () => {
    switch (step) {
      case 0:
        return !!(data.firstName.trim() && data.lastName.trim());
      case 1:
        return data.institutionName.trim().length >= 2 && emailOk;
      default:
        return true;
    }
  };

  const customDepartments = data.departments.filter(
    d => !SUGGESTED_DEPARTMENTS.includes(d)
  );

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Welcome, {userName}!
              </CardTitle>
              <CardDescription>
                You&apos;re setting up your school on ProjectNest. This takes
                about two minutes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={data.firstName}
                    onChange={e => update({ firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={data.lastName}
                    onChange={e => update({ lastName: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="jobTitle">
                  Job title{' '}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="jobTitle"
                  placeholder="e.g. Head of Animation, Programme Coordinator"
                  value={data.jobTitle}
                  onChange={e => update({ jobTitle: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Shown with your name as your school&apos;s main contact.
                </p>
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
                Your school
              </CardTitle>
              <CardDescription>
                This creates your school on ProjectNest. Tutors and learners you
                invite will join it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="institutionName">School name</Label>
                <Input
                  id="institutionName"
                  placeholder="e.g. Lagos Animation Academy"
                  value={data.institutionName}
                  onChange={e => update({ institutionName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type of school</Label>
                  <Select
                    value={data.institutionType}
                    onValueChange={value => update({ institutionType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose one" />
                    </SelectTrigger>
                    <SelectContent>
                      {INSTITUTION_TYPES.map(type => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Number of learners</Label>
                  <Select
                    value={data.institutionSize}
                    onValueChange={value => update({ institutionSize: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Roughly" />
                    </SelectTrigger>
                    <SelectContent>
                      {INSTITUTION_SIZES.map(size => (
                        <SelectItem key={size} value={size}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Contact email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={data.contactEmail}
                    onChange={e => update({ contactEmail: e.target.value })}
                  />
                  {!emailOk && (
                    <p className="text-xs text-red-600">
                      Enter a valid email address.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">
                    Contact phone{' '}
                    <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="contactPhone"
                    type="tel"
                    value={data.contactPhone}
                    onChange={e => update({ contactPhone: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The contact details are kept on your school&apos;s record so the
                programme organiser knows who to reach.
              </p>
            </CardContent>
          </Card>
        );

      case 2:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Departments
              </CardTitle>
              <CardDescription>
                Pick the departments your school has. They&apos;re created for
                you, and you can add or remove them later on the Departments
                page. You can also skip this.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {SUGGESTED_DEPARTMENTS.map(name => (
                  <label
                    key={name}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={data.departments.includes(name)}
                      onCheckedChange={() => toggleDepartment(name)}
                    />
                    {name}
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="customDepartment">Add another</Label>
                <div className="flex gap-2">
                  <Input
                    id="customDepartment"
                    value={customDepartment}
                    maxLength={100}
                    onChange={e => setCustomDepartment(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomDepartment();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addCustomDepartment}
                    disabled={!customDepartment.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {customDepartments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {customDepartments.map(name => (
                      <span
                        key={name}
                        className="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm"
                      >
                        {name}
                        <button
                          type="button"
                          onClick={() => toggleDepartment(name)}
                          aria-label={`Remove ${name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );

      default:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Ready to create your school
              </CardTitle>
              <CardDescription>
                Check the details. You can change departments later.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">School</dt>
                  <dd className="font-medium">
                    {data.institutionName.trim()}
                    {data.institutionType && ` · ${data.institutionType}`}
                    {data.institutionSize && ` · ${data.institutionSize}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Main contact</dt>
                  <dd>
                    {data.firstName} {data.lastName}
                    {data.jobTitle && `, ${data.jobTitle}`}
                    {data.contactEmail && ` · ${data.contactEmail}`}
                    {data.contactPhone && ` · ${data.contactPhone}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Departments</dt>
                  <dd>
                    {data.departments.length
                      ? data.departments.join(', ')
                      : 'None yet'}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-sm text-muted-foreground">
                Next, your dashboard shows a tutor code for your staff and a
                learner code for your learners.
              </p>
            </CardContent>
          </Card>
        );
    }
  };

  const last = step === STEPS.length - 1;

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{STEPS[step]}</span>
            <span className="text-sm text-gray-500">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {renderStep()}

        <div className="flex justify-between mt-6">
          {step > 0 ? (
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={saving}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
          ) : (
            <div />
          )}
          <Button
            onClick={() => (last ? onComplete(data) : setStep(step + 1))}
            disabled={!canProceed() || saving}
          >
            {last
              ? saving
                ? 'Creating your school...'
                : 'Create my school'
              : 'Next'}
            {!last && <ArrowRight className="h-4 w-4 ml-2" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
