'use client';

import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { SIGNUP_EMAIL_KEY } from '@/lib/auth/email-links';
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
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<'teacher' | 'student' | 'institution'>(
    'student'
  );
  const [signupCode, setSignupCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    if (password !== repeatPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      // Teacher and admin accounts need a code; the database decides the
      // role from it, so check it first and say so if it's wrong.
      let signup_code: string | undefined;
      if (role !== 'student') {
        const { data: codeRole, error: codeError } = await supabase.rpc(
          'check_signup_code',
          { p_code: signupCode }
        );
        if (codeError) throw codeError;
        const expected = role === 'teacher' ? 'teacher' : 'institution_admin';
        if (codeRole !== expected) {
          setError(
            role === 'teacher'
              ? "That teacher code isn't valid. Ask your school's admin for the teacher code."
              : "That admin invite isn't valid or has already been used. Ask the programme organiser for a new one."
          );
          return;
        }
        signup_code = signupCode;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/onboarding`,
          data: {
            first_name: firstName,
            last_name: lastName,
            role,
            ...(signup_code && { signup_code }),
          },
        },
      });
      if (error) throw error;
      try {
        sessionStorage.setItem(SIGNUP_EMAIL_KEY, email);
      } catch {
        // Private mode: the success page asks for the email instead.
      }

      // Redirect to success page for email confirmation
      if (data.user && !data.user.email_confirmed_at) {
        router.push('/auth/sign-up-success');
      } else if (data.user) {
        // User is immediately confirmed, go to onboarding
        router.push('/onboarding');
      } else {
        router.push('/auth/sign-up-success');
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign up</CardTitle>
          <CardDescription>Create a new account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignUp}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="first-name">First Name</Label>
                <Input
                  id="first-name"
                  type="text"
                  placeholder="John"
                  required
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="last-name">Last Name</Label>
                <Input
                  id="last-name"
                  type="text"
                  placeholder="Doe"
                  required
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={role}
                  onValueChange={value =>
                    setRole(value as 'teacher' | 'student' | 'institution')
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="teacher">Teacher</SelectItem>
                    <SelectItem value="institution">School admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {role !== 'student' && (
                <div className="grid gap-2">
                  <Label htmlFor="signup-code">
                    {role === 'teacher' ? 'Teacher code' : 'Admin invite code'}
                  </Label>
                  <Input
                    id="signup-code"
                    type="text"
                    autoComplete="off"
                    placeholder="e.g. ABCD2345"
                    required
                    className="font-mono uppercase"
                    value={signupCode}
                    onChange={e => setSignupCode(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {role === 'teacher'
                      ? "Your school's admin gives you this. Students don't need a code."
                      : 'The programme organiser gives you this one-time code.'}
                  </p>
                </div>
              )}
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="repeat-password">Repeat Password</Label>
                </div>
                <Input
                  id="repeat-password"
                  type="password"
                  required
                  value={repeatPassword}
                  onChange={e => setRepeatPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Creating an account...' : 'Sign up'}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Already have an account?{' '}
              <Link href="/auth/login" className="underline underline-offset-4">
                Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
