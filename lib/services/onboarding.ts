// Onboarding service utilities for database operations

import { createClient } from '@/lib/supabase/client';
import {
  OnboardingData,
  OnboardingSession,
  Institution,
  Department,
  InstitutionSearchResult,
  DepartmentSearchResult,
  OnboardingError,
  OnboardingErrorCode,
  UserRole
} from '@/lib/types/onboarding';

export class OnboardingService {
  private supabase = createClient();

  // Onboarding session management
  async createOnboardingSession(userId: string): Promise<OnboardingSession> {
    try {
      const { data, error } = await this.supabase
        .from('onboarding_sessions')
        .insert([{
          user_id: userId,
          current_step: 0,
          total_steps: 5,
          data: {
            userId,
            currentStep: 0,
            skippedSteps: []
          }
        }])
        .select()
        .single();

      if (error) throw error;

      return this.mapOnboardingSession(data);
    } catch (error: unknown) {
      throw new OnboardingError(
        'Failed to create onboarding session',
        OnboardingErrorCode.VALIDATION_FAILED,
        0,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async getOnboardingSession(userId: string): Promise<OnboardingSession | null> {
    try {
      const { data, error } = await this.supabase
        .from('onboarding_sessions')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      return this.mapOnboardingSession(data);
    } catch (error: unknown) {
      throw new OnboardingError(
        'Failed to get onboarding session',
        OnboardingErrorCode.SESSION_EXPIRED,
        0,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async updateOnboardingSession(
    userId: string,
    updates: Partial<OnboardingSession>
  ): Promise<OnboardingSession> {
    try {
      const { data, error } = await this.supabase
        .from('onboarding_sessions')
        .update({
          current_step: updates.currentStep,
          data: updates.data,
          last_activity: new Date().toISOString(),
          completed_at: updates.completedAt?.toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;

      return this.mapOnboardingSession(data);
    } catch (error: unknown) {
      throw new OnboardingError(
        'Failed to update onboarding session',
        OnboardingErrorCode.VALIDATION_FAILED,
        updates.currentStep,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async completeOnboarding(userId: string): Promise<void> {
    try {
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to complete onboarding');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Onboarding completion failed');
      }

    } catch (error: unknown) {
      throw new OnboardingError(
        'Failed to complete onboarding',
        OnboardingErrorCode.VALIDATION_FAILED,
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  // Institution management
  async searchInstitutions(query: string): Promise<InstitutionSearchResult[]> {
    try {
      const response = await fetch(`/api/institutions/search?q=${encodeURIComponent(query)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to search institutions');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Search failed');
      }

      return result.data || [];
    } catch (error: unknown) {
      throw new OnboardingError(
        'Failed to search institutions',
        OnboardingErrorCode.VALIDATION_FAILED,
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async requestNewInstitution(institutionData: {
    name: string;
    domain?: string;
    type?: string;
    contactEmail?: string;
    description?: string;
  }): Promise<{ id: string; message: string }> {
    try {
      const response = await fetch('/api/institutions/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(institutionData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to request institution');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Request failed');
      }

      return result.data;
    } catch (error: unknown) {
      throw new OnboardingError(
        'Failed to request new institution',
        OnboardingErrorCode.VALIDATION_FAILED,
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async getInstitution(id: string): Promise<Institution | null> {
    try {
      const { data, error } = await this.supabase
        .from('institutions')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      return this.mapInstitution(data);
    } catch (error: unknown) {
      throw new OnboardingError(
        'Failed to get institution',
        OnboardingErrorCode.INSTITUTION_NOT_FOUND,
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async getDepartmentsByInstitution(institutionId: string): Promise<DepartmentSearchResult[]> {
    try {
      const response = await fetch(`/api/institutions/${institutionId}/departments`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch departments');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch departments');
      }

      return result.data?.departments || [];
    } catch (error: unknown) {
      throw new OnboardingError(
        'Failed to get departments',
        OnboardingErrorCode.DEPARTMENT_NOT_FOUND,
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async getDepartment(id: string): Promise<Department | null> {
    try {
      const { data, error } = await this.supabase
        .from('departments')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      return this.mapDepartment(data);
    } catch (error: unknown) {
      throw new OnboardingError(
        'Failed to get department',
        OnboardingErrorCode.DEPARTMENT_NOT_FOUND,
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  // User profile updates
  async updateUserProfile(
    userId: string,
    updates: {
      role?: UserRole;
      institutionId?: string;
      departmentId?: string;
      onboardingData?: OnboardingData;
    }
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('users')
        .update({
          role: updates.role,
          institution_id: updates.institutionId,
          department_id: updates.departmentId,
          onboarding_data: updates.onboardingData
        })
        .eq('id', userId);

      if (error) throw error;
    } catch (error: unknown) {
      throw new OnboardingError(
        'Failed to update user profile',
        OnboardingErrorCode.VALIDATION_FAILED,
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  // Validation helpers
  async validateInstitutionAccess(userId: string, institutionId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('institutions')
        .select('id')
        .eq('id', institutionId)
        .eq('status', 'active')
        .single();

      return !error && !!data;
    } catch {
      return false;
    }
  }

  async validateDepartmentAccess(
    userId: string,
    departmentId: string,
    institutionId?: string
  ): Promise<boolean> {
    try {
      let query = this.supabase
        .from('departments')
        .select('id')
        .eq('id', departmentId)
        .eq('status', 'active');

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query.single();

      return !error && !!data;
    } catch {
      return false;
    }
  }

  // Private mapping methods
  private mapOnboardingSession(data: Record<string, unknown>): OnboardingSession {
    return {
      id: data.id as string,
      userId: data.user_id as string,
      currentStep: data.current_step as number,
      totalSteps: data.total_steps as number,
      data: data.data as OnboardingData,
      startedAt: new Date(data.started_at as string),
      completedAt: data.completed_at ? new Date(data.completed_at as string) : undefined,
      lastActivity: new Date(data.last_activity as string)
    };
  }

  private mapInstitution(data: Record<string, unknown>): Institution {
    return {
      id: data.id as string,
      name: data.name as string,
      domain: data.domain as string | undefined,
      subdomain: data.subdomain as string | undefined,
      type: data.type as any, // InstitutionType enum
      status: data.status as any, // InstitutionStatus enum
      contactEmail: data.contact_email as string | undefined,
      contactPhone: data.contact_phone as string | undefined,
      address: (data.address as any) || {},
      settings: (data.settings as any) || {
        allowSelfRegistration: false,
        requireEmailVerification: true,
        defaultUserRole: UserRole.STUDENT,
        allowCrossInstitutionCollaboration: false
      },
      branding: (data.branding as any) || {
        primaryColor: '#3b82f6',
        secondaryColor: '#64748b'
      },
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
      createdBy: data.created_by as string | undefined
    };
  }

  private mapDepartment(data: Record<string, unknown>): Department {
    return {
      id: data.id as string,
      institutionId: data.institution_id as string,
      name: data.name as string,
      description: data.description as string | undefined,
      code: data.code as string | undefined,
      adminId: data.admin_id as string | undefined,
      parentDepartmentId: data.parent_department_id as string | undefined,
      settings: (data.settings as Record<string, unknown>) || {},
      status: data.status as any, // DepartmentStatus enum
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string)
    };
  }
}

// Export singleton instance
export const onboardingService = new OnboardingService();