import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get the current user to ensure they're authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // Get user profile with onboarding status
    const { data: userProfile, error: userError } = await supabase
      .from('users')
      .select('onboarding_completed, onboarding_step, onboarding_data, role, institution_id, department_id')
      .eq('id', user.id)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      console.error('Error fetching user profile:', userError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch user profile' 
      }, { status: 500 });
    }

    // Get onboarding session if it exists
    const { data: session, error: sessionError } = await supabase
      .from('onboarding_sessions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Don't treat missing session as an error
    if (sessionError && sessionError.code !== 'PGRST116') {
      console.error('Error fetching onboarding session:', sessionError);
    }

    // Determine onboarding status
    const isComplete = userProfile?.onboarding_completed || false;
    const currentStep = session?.current_step || userProfile?.onboarding_step || 0;
    const totalSteps = session?.total_steps || 5;
    const onboardingData = session?.data || userProfile?.onboarding_data || {};

    // Get institution and department names if they exist
    let institutionName = null;
    let departmentName = null;

    if (userProfile?.institution_id) {
      const { data: institution } = await supabase
        .from('institutions')
        .select('name')
        .eq('id', userProfile.institution_id)
        .single();
      institutionName = institution?.name;
    }

    if (userProfile?.department_id) {
      const { data: department } = await supabase
        .from('departments')
        .select('name')
        .eq('id', userProfile.department_id)
        .single();
      departmentName = department?.name;
    }

    return NextResponse.json({
      success: true,
      data: {
        isComplete,
        currentStep,
        totalSteps,
        needsOnboarding: !isComplete,
        onboardingData: {
          ...onboardingData,
          userId: user.id,
          currentStep
        },
        user: {
          id: user.id,
          email: user.email,
          role: userProfile?.role || onboardingData.role,
          institutionId: userProfile?.institution_id || onboardingData.institutionId,
          departmentId: userProfile?.department_id || onboardingData.departmentId,
          institutionName,
          departmentName,
          onboardingCompleted: isComplete
        },
        session: session ? {
          id: session.id,
          startedAt: session.started_at,
          completedAt: session.completed_at,
          lastActivity: session.last_activity
        } : null
      }
    });

  } catch (error) {
    console.error('Onboarding status API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}