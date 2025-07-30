"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { OnboardingGuard, OnboardingStatus } from "@/lib/utils/onboarding-guard";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  onboardingStatus: OnboardingStatus | null;
  refreshOnboardingStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  onboardingStatus: null,
  refreshOnboardingStatus: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const supabase = createClient();

  const refreshOnboardingStatus = async () => {
    if (!user) {
      setOnboardingStatus(null);
      return;
    }

    try {
      const status = await OnboardingGuard.checkOnboardingStatus(user);
      setOnboardingStatus(status);
    } catch (error) {
      console.error('Failed to refresh onboarding status:', error);
      // Set default status on error
      setOnboardingStatus({
        isComplete: false,
        currentStep: 0,
        totalSteps: 5,
        needsOnboarding: true,
        redirectPath: '/onboarding'
      });
    }
  };

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  // Refresh onboarding status when user changes
  useEffect(() => {
    if (user) {
      refreshOnboardingStatus();
    } else {
      setOnboardingStatus(null);
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      onboardingStatus, 
      refreshOnboardingStatus 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
}
