"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
interface OnboardingStatus {
  isComplete: boolean;
  currentStep: number;
  totalSteps: number;
  needsOnboarding: boolean;
  redirectPath?: string;
}

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

  const refreshOnboardingStatus = async () => {
    if (!user) {
      setOnboardingStatus(null);
      return;
    }

    try {
      const supabase = createClient();
      const { data: userProfile, error } = await supabase
        .from('users')
        .select('onboarding_completed, role')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.log('Database table not found or error checking onboarding status, assuming onboarding needed');
        setOnboardingStatus({
          isComplete: false,
          currentStep: 0,
          totalSteps: 5,
          needsOnboarding: true,
          redirectPath: '/onboarding'
        });
        return;
      }

      if (!userProfile || !userProfile.onboarding_completed) {
        setOnboardingStatus({
          isComplete: false,
          currentStep: 0,
          totalSteps: 5,
          needsOnboarding: true,
          redirectPath: '/onboarding'
        });
      } else {
        setOnboardingStatus({
          isComplete: true,
          currentStep: 5,
          totalSteps: 5,
          needsOnboarding: false
        });
      }
    } catch (error) {
      console.log('Error refreshing onboarding status, using default values');
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
    const supabase = createClient();
    
    const getUser = async () => {
      try {
        console.log('Auth Context: Getting user...');
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
          // Handle auth session missing gracefully
          if (error.message.includes('Auth session missing')) {
            console.log('Auth Context: No active session found');
          } else {
            console.error('Auth Context: Auth error:', error);
          }
        }
        console.log('Auth Context: User retrieved:', user?.email, user?.id);
        setUser(user);
        setLoading(false);
        
        // Refresh onboarding status when user is loaded
        if (user) {
          await refreshOnboardingStatus();
        }
      } catch (error) {
        console.log('Auth Context: No active session or failed to get user');
        setUser(null);
        setLoading(false);
      }
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth Context: Auth state changed:', event, !!session?.user, session?.user?.email);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Refresh onboarding status when auth state changes
        if (session?.user) {
          try {
            await refreshOnboardingStatus();
          } catch (error) {
            console.log('Auth Context: Error refreshing onboarding status:', error);
          }
        } else {
          setOnboardingStatus(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

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
