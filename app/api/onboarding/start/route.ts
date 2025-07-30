import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get the current user to ensure they're authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.error('Authentication error:', authError);
      return NextResponse.json({ 
        success: false, 
        error: 'Authentication failed' 
      }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ 
        success: false, 
        error: 'User not found' 
      }, { status: 401 });
    }

    // Check if user already has an onboarding session
    const { data: existingSession, error: sessionError } = await supabase
      .from('onboarding_sessions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Handle database errors (but not "no rows found" which is expected)
    if (sessionError && sessionError.code !== 'PGRST116') {
      console.error('Error fetching existing session:', sessionError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to check existing onboarding session' 
      }, { status: 500 });
    }

    // If session exists and is not completed, return it
    if (existingSession && !existingSession.completed_at) {
      return NextResponse.json({
        success: true,
        data: {
          session: {
            id: existingSession.id,
            userId: existingSession.user_id,
            currentStep: existingSession.current_step,
            totalSteps: existingSession.total_steps,
            data: existingSession.data,
            startedAt: existingSession.started_at,
            completedAt: existingSession.completed_at,
            lastActivity: existingSession.last_activity
          },
          message: 'Existing onboarding session found'
        }
      });
    }

    // Create new onboarding session
    const now = new Date().toISOString();
    const sessionData = {
      user_id: user.id,
      current_step: 0,
      total_steps: 5,
      data: {
        userId: user.id,
        currentStep: 0,
        skippedSteps: []
      },
      started_at: now,
      last_activity: now
    };

    const { data: newSession, error: createError } = await supabase
      .from('onboarding_sessions')
      .insert([sessionData])
      .select()
      .single();

    if (createError) {
      console.error('Error creating onboarding session:', createError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to create onboarding session' 
      }, { status: 500 });
    }

    // Update user's onboarding status
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        onboarding_step: 0,
        onboarding_completed: false,
        updated_at: now
      })
      .eq('id', user.id);

    if (userUpdateError) {
      console.error('Error updating user onboarding status:', userUpdateError);
      // Don't fail the entire operation for this
    }

    return NextResponse.json({
      success: true,
      data: {
        session: {
          id: newSession.id,
          userId: newSession.user_id,
          currentStep: newSession.current_step,
          totalSteps: newSession.total_steps,
          data: newSession.data,
          startedAt: newSession.started_at,
          completedAt: newSession.completed_at,
          lastActivity: newSession.last_activity
        },
        message: 'Onboarding session started successfully'
      }
    });

  } catch (error) {
    console.error('Onboarding start API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}