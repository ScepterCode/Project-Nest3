"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RoleGate } from '@/components/ui/permission-gate';
import { LogIn, AlertCircle } from 'lucide-react';

interface AuthStatusCheckerProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  allowedRoles?: string[];
}

export function AuthStatusChecker({ 
  children, 
  requireAuth = true, 
  allowedRoles = [] 
}: AuthStatusCheckerProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [showAuthError, setShowAuthError] = useState(false);

  useEffect(() => {
    if (!loading && requireAuth && !user) {
      setShowAuthError(true);
    } else {
      setShowAuthError(false);
    }
  }, [user, loading, requireAuth]);

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Show auth required message
  if (showAuthError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-4">
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <strong>Authentication Required</strong>
              <p className="mt-2">You need to be logged in to access this page.</p>
            </AlertDescription>
          </Alert>
          
          <div className="mt-6 flex gap-3">
            <Button 
              onClick={() => router.push('/auth/login')}
              className="flex-1"
            >
              <LogIn className="h-4 w-4 mr-2" />
              Login
            </Button>
            <Button 
              variant="outline"
              onClick={() => router.push('/auth/sign-up')}
              className="flex-1"
            >
              Sign Up
            </Button>
          </div>
          
          <div className="mt-4 text-center">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => router.push('/')}
            >
              ← Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Check role permissions if specified
  if (user && allowedRoles.length > 0) {
    // Use RoleGate component for proper database-based role checking
    return (
      <RoleGate userId={user.id} allowedRoles={allowedRoles}>
        {children}
      </RoleGate>
    );
  }

  // User is authenticated and authorized, show content
  return <>{children}</>;
}