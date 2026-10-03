'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
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
  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatus | null>(null);

  // SECURITY FIX: Proper logout function
  const logout = async () => {
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

  // The signed-in user's id, readable from inside the auth listener (which is
  // registered once and would otherwise only ever see the first render's state).
  const currentUserId = useRef<string | null>(null);

  // Only uses state setters, so it never changes and the auth listener below
  // can be registered once.
  const loadProfile = useCallback(async (user: User | null) => {
    if (!user) {
      setOnboardingStatus(null);
      setUserProfile(null);
      return;
    }

    try {
      const supabase = createClient();

      // SECURITY CHECK: Verify current auth session matches user
      const {
        data: { user: currentUser },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !currentUser || currentUser.id !== user.id) {
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
        console.error('Auth Context: Could not load profile:', error.message);
        setUserProfile({
          id: user.id,
          email: user.email || '',
          role: user.user_metadata?.role || 'student',
          first_name: user.user_metadata?.first_name,
          last_name: user.user_metadata?.last_name,
          onboarding_completed: false,
        });
        // Unknown, not "incomplete": the middleware already routes by the
        // real profile, and guessing here could bounce users to onboarding.
        setOnboardingStatus(null);
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
            redirectPath: '/onboarding',
          });
        } else {
          setOnboardingStatus({
            isComplete: true,
            currentStep: 5,
            totalSteps: 5,
            needsOnboarding: false,
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
          onboarding_completed: false,
        });
        setOnboardingStatus({
          isComplete: false,
          currentStep: 0,
          totalSteps: 5,
          needsOnboarding: true,
          redirectPath: '/onboarding',
        });
      }
    } catch (error) {
      console.error('Auth Context: Could not load profile:', error);
      setUserProfile({
        id: user.id,
        email: user.email || '',
        role: user.user_metadata?.role || 'student',
        first_name: user.user_metadata?.first_name,
        last_name: user.user_metadata?.last_name,
        onboarding_completed: false,
      });
      setOnboardingStatus(null);
    }
  }, []);

  const refreshOnboardingStatus = useCallback(
    () => loadProfile(user),
    [loadProfile, user]
  );

  const getUserDisplayName = () => {
    if (userProfile?.first_name) {
      return userProfile.first_name;
    }
    if (user?.user_metadata?.first_name) {
      return user.user_metadata.first_name;
    }
    if (userProfile?.last_name) {
      return userProfile.last_name;
    }
    return user?.email?.split('@')[0] || 'User';
  };

  useEffect(() => {
    const supabase = createClient();

    const getUser = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error && !error.message.includes('Auth session missing')) {
          console.error('Auth Context: Auth error:', error);
        }
        currentUserId.current = user?.id ?? null;
        setUser(user);
        setLoading(false);
        if (user) {
          await loadProfile(user);
        }
      } catch {
        setUser(null);
        setLoading(false);
      }
    };

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const sessionUser = session?.user ?? null;

      if (event === 'SIGNED_OUT' || !sessionUser) {
        currentUserId.current = null;
        setUser(null);
        setUserProfile(null);
        setOnboardingStatus(null);
        setLoading(false);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('user-role-cache');
          localStorage.removeItem('user-profile-cache');
          sessionStorage.clear();
        }
        return;
      }

      // A different account signed in in another tab: start from a clean page
      // so nothing from the previous user stays on screen.
      if (currentUserId.current && currentUserId.current !== sessionUser.id) {
        window.location.reload();
        return;
      }

      // Token refreshes happen hourly and don't change who is signed in;
      // keep the same user object so pages don't refetch everything.
      if (
        event === 'TOKEN_REFRESHED' &&
        currentUserId.current === sessionUser.id
      ) {
        return;
      }

      currentUserId.current = sessionUser.id;
      setUser(sessionUser);
      setLoading(false);
      // Supabase runs this listener while holding its auth lock, and every
      // Supabase call (getUser, any query) waits for that lock. Awaiting one
      // here deadlocks the client and every page spins forever, so load the
      // profile after the listener has returned.
      setTimeout(() => {
        loadProfile(sessionUser).catch(error =>
          console.error(
            'Auth Context: Error refreshing onboarding status:',
            error
          )
        );
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        onboardingStatus,
        refreshOnboardingStatus,
        getUserDisplayName,
        logout,
      }}
    >
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
