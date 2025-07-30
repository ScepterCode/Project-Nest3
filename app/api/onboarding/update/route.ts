import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface OnboardingUpdateRequest {
  currentStep?: number;
  data?: Record<string, any>;
  skippedSteps?: string[];
}

// Validation functions
function validateCurrentStep(step: number): boolean {
  return Number.isInteger(step) && step >= 0 && step <= 10;
}

function validateOnboardingData(data: Record<string, any>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (data.role && !['student', 'teacher', 'admin', 'institution_admin', 'department_admin'].includes(data.role)) {
    errors.push('Invalid role specified');
  }
  
  if (data.institutionId && typeof data.institutionId !== 'string') {
    errors.push('Institution ID must be a string');
  }
  
  if (data.departmentId && typeof data.departmentId !== 'string') {
    errors.push('Department ID must be a string');
  }
  
  if (data.classCode && (typeof data.classCode !== 'string' || data.classCode.length < 6)) {
    errors.push('Class code must be at least 6 characters');
  }
  
  return { isValid: errors.length === 0, errors };
}

export async function PUT(request: NextRequest) {
  try {
    const body: OnboardingUpdateRequest = await request.json();
    
    // Validate request body
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid request body' 
      }, { status: 400 });
    }

    // Validate currentStep if provided
    if (body.currentStep !== undefined && !validateCurrentStep(body.currentStep)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Current step must be an integer between 0 and 10' 
      }, { status: 400 });
    }

    // Validate onboarding data if provided
    if (body.data) {
      const validation = validateOnboardingData(body.data);
      if (!validation.isValid) {
        return NextResponse.json({ 
          success: false, 
          error: 'Invalid onboarding data',
          details: validation.errors
        }, { status: 400 });
      }
    }

    const supabase = await createClient();
    
    // Get the current user to ensure they're authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // Get existing onboarding session
    const { data: existingSession, error: sessionError } = await supabase
      .from('onboarding_sessions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (sessionError && sessionError.code !== 'PGRST116') {
      console.error('Error fetching onboarding session:', sessionError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch onboarding session' 
      }, { status: 500 });
    }

    const now = new Date().toISOString();

    // Prepare update data
    const updateData: Record<string, any> = {
      last_activity: now
    };

    if (body.currentStep !== undefined) {
      updateData.current_step = body.currentStep;
    }

    if (body.data !== undefined) {
      // Merge with existing data
      const existingData = existingSession?.data || {};
      updateData.data = { ...existingData, ...body.data };
    }

    let updatedSession;

    if (existingSession) {
      // Update existing session
      const { data, error } = await supabase
        .from('onboarding_sessions')
        .update(updateData)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating onboarding session:', error);
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to update onboarding session' 
        }, { status: 500 });
      }

      updatedSession = data;
    } else {
      // Create new session if none exists
      const newSessionData = {
        user_id: user.id,
        current_step: body.currentStep || 0,
        total_steps: 5,
        data: body.data || { userId: user.id, currentStep: body.currentStep || 0, skippedSteps: [] },
        started_at: now,
        last_activity: now
      };

      const { data, error } = await supabase
        .from('onboarding_sessions')
        .insert([newSessionData])
        .select()
        .single();

      if (error) {
        console.error('Error creating onboarding session:', error);
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to create onboarding session' 
        }, { status: 500 });
      }

      updatedSession = data;
    }

    // Also update user's onboarding_step for quick access
    if (body.currentStep !== undefined) {
      const { error: userUpdateError } = await supabase
        .from('users')
        .update({
          onboarding_step: body.currentStep,
          updated_at: now
        })
        .eq('id', user.id);

      if (userUpdateError) {
        console.error('Error updating user onboarding step:', userUpdateError);
        // Don't fail the entire operation for this
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        session: {
          id: updatedSession.id,
          userId: updatedSession.user_id,
          currentStep: updatedSession.current_step,
          totalSteps: updatedSession.total_steps,
          data: updatedSession.data,
          startedAt: updatedSession.started_at,
          completedAt: updatedSession.completed_at,
          lastActivity: updatedSession.last_activity
        },
        message: 'Onboarding progress updated successfully'
      }
    });

  } catch (error) {
    console.error('Onboarding update API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}