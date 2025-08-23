import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { onboardingAnalyticsService } from '@/lib/services/onboarding-analytics';
import { OnboardingAnalyticsFilters } from '@/lib/types/onboarding-analytics';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user has admin permissions
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Only allow admins to access analytics
    const allowedRoles = ['institution_admin', 'department_admin', 'system_admin'];
    if (!allowedRoles.includes(userData.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Parse filters from request body
    const filters: OnboardingAnalyticsFilters = await request.json();

    // If user is department admin, restrict to their institution
    if (userData.role === 'department_admin' || userData.role === 'institution_admin') {
      filters.institutionId = userData.institution_id;
    }

    // Get metrics
    const metrics = await onboardingAnalyticsService.getMetrics(filters);

    return NextResponse.json({
      success: true,
      data: metrics
    });

  } catch (error) {
    console.error('Error fetching onboarding metrics:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}