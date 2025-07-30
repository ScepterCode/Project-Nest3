import { NextRequest, NextResponse } from 'next/server';
import { SubscriptionManager } from '@/lib/services/subscription-manager';
import { createClient } from '@/lib/supabase/server';

const subscriptionManager = new SubscriptionManager();

export async function GET(request: NextRequest) {
  try {
    const plans = await subscriptionManager.getAvailablePlans();
    return NextResponse.json(plans);
  } catch (error) {
    console.error('Failed to fetch subscription plans:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription plans' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is system admin
    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || userProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const planData = await request.json();
    
    const plan = await subscriptionManager.createPlan(planData);
    
    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    console.error('Failed to create subscription plan:', error);
    return NextResponse.json(
      { error: 'Failed to create subscription plan' },
      { status: 500 }
    );
  }
}