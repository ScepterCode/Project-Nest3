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

interface UserProfile {
  id: string;
  email: string;
  role: string;
  first_name?: string;
  last_name?: string;
  onboarding_completed?: boolean;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  onboardingStatus: OnboardingStatus | null;
  refreshOnboardingStatus: () => Promise<void>;
  getUserDisplayName: () => string;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  onboardingStatus: null,
  refreshOnboardingStatus: async () => {},
  getUserDisplayName: () => '',
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);

  // SECURITY FIX: Proper logout function
  const logout = async () => {
    console.log('Auth Context: Performing secure logout');
    const supabase = createClient();
    
    // Clear all local state immediately
    setUser(null);
    setUserProfile(null);
    setOnboardingStatus(null);
    setLoading(false);
    
    // Clear browser storage
    if (typeof window !== 'undefined') {
      localStorage.clear();
      sessionStorage.clear();
    }
    
    // Sign out from Supabase
    await supabase.auth.signOut();
    
    // Force page reload to clear all cached state
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login';
    }
  };

  const refreshOnboardingStatus = async () => {
    if (!user) {
      setOnboardingStatus(null);
      setUserProfile(null);
      return;
    }

    try {
      const supabase = createClient();
      
      // SECURITY CHECK: Verify current auth session matches user
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !currentUser || currentUser.id !== user.id) {
        console.log('Auth Context: SECURITY ALERT - Session mismatch detected, clearing data');
        setUser(null);
        setUserProfile(null);
        setOnboardingStatus(null);
        return;
      }
      
      const { data: profile, error } = await supabase
        .from('users')
        .select('id, email, role, first_name, last_name, onboarding_completed')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.log('Database table not found or error checking onboarding status, assuming onboarding needed');
        setUserProfile({
          id: user.id,
          email: user.email || '',
          role: user.user_metadata?.role || 'student',
          first_name: user.user_metadata?.first_name,
          last_name: user.user_metadata?.last_name,
          onboarding_completed: false
        });
        setOnboardingStatus({
          isComplete: false,
          currentStep: 0,
          totalSteps: 5,
          needsOnboarding: true,
          redirectPath: '/onboarding'
        });
        return;
      }

      if (profile) {
        setUserProfile(profile);
        
        if (!profile.onboarding_completed) {
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
      } else {
        // Fallback to user metadata
        setUserProfile({
          id: user.id,
          email: user.email || '',
          role: user.user_metadata?.role || 'student',
          first_name: user.user_metadata?.first_name,
          last_name: user.user_metadata?.last_name,
          onboarding_completed: false
        });
        setOnboardingStatus({
          isComplete: false,
          currentStep: 0,
          totalSteps: 5,
          needsOnboarding: true,
          redirectPath: '/onboarding'
        });
      }
    } catch (error) {
      console.log('Error refreshing onboarding status, using default values');
      setUserProfile({
        id: user.id,
        email: user.email || '',
        role: user.user_metadata?.role || 'student',
        first_name: user.user_metadata?.first_name,
        last_name: user.user_metadata?.last_name,
        onboarding_completed: false
      });
      setOnboardingStatus({
        isComplete: false,
        currentStep: 0,
        totalSteps: 5,
        needsOnboarding: true,
        redirectPath: '/onboarding'
      });
    }
  };

  const getUserDisplayName = () => {
    if (userProfile?.last_name) {
      return userProfile.last_name;
    }
    if (userProfile?.first_name) {
      return userProfile.first_name;
    }
    if (user?.user_metadata?.last_name) {
      return user.user_metadata.last_name;
    }
    if (user?.user_metadata?.first_name) {
      return user.user_metadata.first_name;
    }
    return user?.email?.split('@')[0] || 'User';
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
        
        // CRITICAL SECURITY FIX: Clear all cached data on auth state change
        if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || !session?.user) {
          console.log('Auth Context: Clearing all cached user data');
          setUser(null);
          setUserProfile(null);
          setOnboardingStatus(null);
          setLoading(false);
          
          // Clear any cached data in localStorage/sessionStorage
          if (typeof window !== 'undefined') {
            localStorage.removeItem('user-role-cache');
            localStorage.removeItem('user-profile-cache');
            sessionStorage.clear();
          }
          
          if (!session?.user) {
            return;
          }
        }
        
        // SECURITY CHECK: Verify user hasn't changed
        if (user && session?.user && user.id !== session.user.id) {
          console.log('Auth Context: SECURITY ALERT - User ID changed, forcing full refresh');
          setUser(null);
          setUserProfile(null);
          setOnboardingStatus(null);
          
          // Force page reload to clear all cached state
          if (typeof window !== 'undefined') {
            window.location.reload();
          }
          return;
        }
        
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
          setUserProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      userProfile,
      loading, 
      onboardingStatus, 
      refreshOnboardingStatus,
      getUserDisplayName,
      logout
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
