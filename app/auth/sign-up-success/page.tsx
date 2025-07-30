"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Page() {
  const { user, loading, onboardingStatus } = useAuth();
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    // If user is authenticated and email is confirmed, redirect to onboarding
    if (!loading && user && user.email_confirmed_at && !isRedirecting) {
      setIsRedirecting(true);
      
      // Check if user needs onboarding
      if (onboardingStatus?.needsOnboarding) {
        router.push(onboardingStatus.redirectPath || '/onboarding');
      } else {
        // User has already completed onboarding, redirect to dashboard
        const userRole = user.user_metadata?.role || 'student';
        router.push(`/dashboard/${userRole}`);
      }
    }
  }, [user, loading, onboardingStatus, router, isRedirecting]);

  const handleCheckEmail = () => {
    // Refresh the page to check if email has been confirmed
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isRedirecting) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Redirecting to onboarding...
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                Thank you for signing up!
              </CardTitle>
              <CardDescription>Check your email to confirm</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You&apos;ve successfully signed up. Please check your email to
                confirm your account. Once confirmed, you&apos;ll be automatically
                redirected to complete your profile setup.
              </p>
              <div className="space-y-2">
                <Button 
                  onClick={handleCheckEmail}
                  className="w-full"
                  variant="outline"
                >
                  I&apos;ve confirmed my email
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  After confirming your email, click the button above or refresh this page
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
