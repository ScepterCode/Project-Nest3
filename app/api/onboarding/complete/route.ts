import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get the current user to ensure they're authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error('Authentication error:', authError);
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication failed',
        },
        { status: 401 }
      );
    }

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'User not found',
        },
        { status: 401 }
      );
    }

    // Get the onboarding session to retrieve final data
    const { data: session, error: sessionError } = await supabase
      .from('onboarding_sessions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (sessionError) {
      console.error('Error fetching onboarding session:', sessionError);
      return NextResponse.json(
        {
          success: false,
          error: 'Onboarding session not found',
        },
        { status: 404 }
      );
    }

    // Check if onboarding is already completed
    if (session.completed_at) {
      return NextResponse.json(
        {
          success: false,
          error: 'Onboarding already completed',
        },
        { status: 400 }
      );
    }

    const onboardingData = session.data || {};

    // Role, institution and department come from the users row (set at signup
    // or by an administrator), never from onboarding data the client wrote.
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role, institution_id, department_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching user profile:', profileError);
      return NextResponse.json(
        {
          success: false,
          error: 'User profile not found',
        },
        { status: 404 }
      );
    }

    // Start a transaction to update multiple tables
    const now = new Date().toISOString();

    // Update onboarding session as completed
    const { error: sessionUpdateError } = await supabase
      .from('onboarding_sessions')
      .update({
        completed_at: now,
        last_activity: now,
      })
      .eq('user_id', user.id);

    if (sessionUpdateError) {
      console.error('Error updating onboarding session:', sessionUpdateError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to complete onboarding session',
        },
        { status: 500 }
      );
    }

    // Update user profile with onboarding completion and final data
    const userUpdates = {
      onboarding_completed: true,
      onboarding_data: onboardingData,
      updated_at: now,
    };

    const { error: userUpdateError } = await supabase
      .from('users')
      .update(userUpdates)
      .eq('id', user.id);

    if (userUpdateError) {
      console.error('Error updating user profile:', userUpdateError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to update user profile',
        },
        { status: 500 }
      );
    }

    // Mirror the real values into auth metadata (display only; users can edit
    // their own metadata, so authorization always reads the users table)
    const { error: authUpdateError } = await supabase.auth.updateUser({
      data: {
        role: profile.role,
        institution_id: profile.institution_id,
        department_id: profile.department_id,
        onboarding_completed: true,
      },
    });

    if (authUpdateError) {
      console.error('Error updating auth metadata:', authUpdateError);
      // Don't fail the entire operation for this, but log it
    }

    return NextResponse.json({
      success: true,
      data: {
        message: 'Onboarding completed successfully',
        user: {
          id: user.id,
          role: profile.role,
          institutionId: profile.institution_id,
          departmentId: profile.department_id,
          onboardingCompleted: true,
        },
      },
    });
  } catch (error) {
    console.error('Onboarding completion API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
