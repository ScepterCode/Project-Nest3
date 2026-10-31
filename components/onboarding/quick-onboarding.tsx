'use client';

import { useState } from 'react';
import { BookOpen, GraduationCap } from 'lucide-react';
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

export interface QuickOnboardingData {
  firstName: string;
  lastName: string;
}

const NEXT_STEP = {
  student: {
    icon: GraduationCap,
    text: 'Next, enter the class code your tutor gave you. Your tutor accepts the request and the class appears on your dashboard.',
    button: 'Continue to join a class',
  },
  teacher: {
    icon: BookOpen,
    text: 'Next, create your first class. Each class gets a short code to give your learners; you accept each one who asks to join.',
    button: 'Continue to my classes',
  },
};

/**
 * One screen for students and teachers: check the name from sign-up and
 * go. Nothing is asked that isn't used.
 */
export function QuickOnboarding({
  role,
  defaultFirstName,
  defaultLastName,
  saving,
  onComplete,
}: {
  role: 'student' | 'teacher';
  defaultFirstName: string;
  defaultLastName: string;
  saving: boolean;
  onComplete: (data: QuickOnboardingData) => void;
}) {
  const [firstName, setFirstName] = useState(defaultFirstName);
  const [lastName, setLastName] = useState(defaultLastName);
  const next = NEXT_STEP[role];
  const Icon = next.icon;
  const ready = firstName.trim().length > 0 && lastName.trim().length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome to ProjectNest</CardTitle>
          <CardDescription>
            Check your name as you want{' '}
            {role === 'student' ? 'your tutors' : 'your learners'} to see it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault();
              if (ready) {
                onComplete({
                  firstName: firstName.trim(),
                  lastName: lastName.trim(),
                });
              }
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="onboarding-first">First name</Label>
                <Input
                  id="onboarding-first"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="onboarding-last">Last name</Label>
                <Input
                  id="onboarding-last"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  autoComplete="family-name"
                  required
                />
              </div>
            </div>
            <p className="flex gap-2 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              {next.text}
            </p>
            <Button
              type="submit"
              className="w-full"
              disabled={!ready || saving}
            >
              {saving ? 'Saving…' : next.button}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
