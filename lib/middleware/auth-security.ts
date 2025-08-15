import { createClient } from '@/lib/supabase/client';

/**
 * Security middleware to prevent session mixing and role confusion
 */
export class AuthSecurityMiddleware {
  private static instance: AuthSecurityMiddleware;
  private lastUserId: string | null = null;
  private lastUserRole: string | null = null;

  static getInstance(): AuthSecurityMiddleware {
    if (!AuthSecurityMiddleware.instance) {
      AuthSecurityMiddleware.instance = new AuthSecurityMiddleware();
    }
    return AuthSecurityMiddleware.instance;
  }

  /**
   * Validate current session and detect role/user changes
   */
  async validateSession(): Promise<{
    isValid: boolean;
    requiresReauth: boolean;
    error?: string;
  }> {
    try {
      const supabase = createClient();
      
      // Get current auth user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        this.clearCache();
        return {
          isValid: false,
          requiresReauth: true,
          error: 'No valid session found'
        };
      }

      // Get user profile from database
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, role, email')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        this.clearCache();
        return {
          isValid: false,
          requiresReauth: true,
          error: 'User profile not found in database'
        };
      }

      // Check for user ID change (critical security issue)
      if (this.lastUserId && this.lastUserId !== user.id) {
        console.error('SECURITY ALERT: User ID changed without proper logout');
        this.clearCache();
        this.forceReauth();
        return {
          isValid: false,
          requiresReauth: true,
          error: 'User session compromised - user ID changed'
        };
      }

      // Check for role change (potential security issue)
      if (this.lastUserRole && this.lastUserRole !== profile.role) {
        console.warn('SECURITY WARNING: User role changed, clearing cache');
        this.clearCache();
        return {
          isValid: true,
          requiresReauth: false,
          error: 'User role changed - cache cleared'
        };
      }

      // Update tracking
      this.lastUserId = user.id;
      this.lastUserRole = profile.role;

      return {
        isValid: true,
        requiresReauth: false
      };

    } catch (error) {
      console.error('Auth security validation error:', error);
      this.clearCache();
      return {
        isValid: false,
        requiresReauth: true,
        error: 'Session validation failed'
      };
    }
  }

  /**
   * Clear all cached security data
   */
  clearCache(): void {
    this.lastUserId = null;
    this.lastUserRole = null;
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user-role-cache');
      localStorage.removeItem('user-profile-cache');
      localStorage.removeItem('auth-security-cache');
      sessionStorage.clear();
    }
  }

  /**
   * Force re-authentication by redirecting to login
   */
  forceReauth(): void {
    this.clearCache();
    
    if (typeof window !== 'undefined') {
      // Clear all storage
      localStorage.clear();
      sessionStorage.clear();
      
      // Force redirect to login
      window.location.href = '/auth/login?reason=security';
    }
  }

  /**
   * Check if current route matches user role
   */
  validateRouteAccess(currentPath: string, userRole: string): boolean {
    const roleRoutes = {
      student: ['/dashboard/student', '/dashboard/notifications', '/dashboard/profile'],
      teacher: ['/dashboard/teacher', '/dashboard/notifications', '/dashboard/profile'],
      institution_admin: ['/dashboard/institution', '/dashboard/notifications', '/dashboard/profile']
    };

    const allowedRoutes = roleRoutes[userRole as keyof typeof roleRoutes] || [];
    
    // Check if current path starts with any allowed route
    return allowedRoutes.some(route => currentPath.startsWith(route)) || 
           currentPath === '/dashboard'; // Allow main dashboard
  }

  /**
   * Get secure user context with validation
   */
  async getSecureUserContext(): Promise<{
    user: any;
    profile: any;
    isValid: boolean;
    error?: string;
  }> {
    const validation = await this.validateSession();
    
    if (!validation.isValid) {
      return {
        user: null,
        profile: null,
        isValid: false,
        error: validation.error
      };
    }

    try {
      const supabase = createClient();
      
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .single();

      return {
        user,
        profile,
        isValid: true
      };
    } catch (error) {
      return {
        user: null,
        profile: null,
        isValid: false,
        error: 'Failed to get user context'
      };
    }
  }
}

export const authSecurity = AuthSecurityMiddleware.getInstance();