import { NextRequest, NextResponse } from 'next/server';
import { SubscriptionManager } from '@/lib/services/subscription-manager';
import { createClient } from '@/lib/supabase/server';

const subscriptionManager = new SubscriptionManager();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const institutionId = params.id;
    
    // Verify user has access to this institution
    const { data: userInstitution } = await supabase
      .from('user_institutions')
      .select('role')
      .eq('user_id', user.id)
      .eq('institution_id', institutionId)
      .single();

    if (!userInstitution || !['admin', 'institution_admin'].includes(userInstitution.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const subscription = await subscriptionManager.getInstitutionSubscription(institutionId);
    let plan = null;
    
    if (subscription) {
      plan = await subscriptionManager.getPlan(subscription.planId);
    }

    return NextResponse.json({
      subscription,
      plan
    });
  } catch (error) {
    console.error('Failed to fetch subscription:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const institutionId = params.id;
    
    // Verify user has admin access to this institution
    const { data: userInstitution } = await supabase
      .from('user_institutions')
      .select('role')
      .eq('user_id', user.id)
      .eq('institution_id', institutionId)
      .single();

    if (!userInstitution || !['admin', 'institution_admin'].includes(userInstitution.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { planId, trialDays } = await request.json();

    if (!planId) {
      return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
    }

    // Check if institution already has a subscription
    const existingSubscription = await subscriptionManager.getInstitutionSubscription(institutionId);
    if (existingSubscription) {
      return NextResponse.json({ error: 'Institution already has a subscription' }, { status: 400 });
    }

    const subscription = await subscriptionManager.createSubscription(
      institutionId,
      planId,
      trialDays
    );

    const plan = await subscriptionManager.getPlan(subscription.planId);

    return NextResponse.json({
      subscription,
      plan
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to create subscription:', error);
    return NextResponse.json(
      { error: 'Failed to create subscription' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const institutionId = params.id;
    
    // Verify user has admin access to this institution
    const { data: userInstitution } = await supabase
      .from('user_institutions')
      .select('role')
      .eq('user_id', user.id)
      .eq('institution_id', institutionId)
      .single();

    if (!userInstitution || !['admin', 'institution_admin'].includes(userInstitution.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updates = await request.json();
    
    const subscription = await subscriptionManager.getInstitutionSubscription(institutionId);
    if (!subscription) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    }

    const updatedSubscription = await subscriptionManager.updateSubscription(
      subscription.id,
      updates
    );

    const plan = await subscriptionManager.getPlan(updatedSubscription.planId);

    return NextResponse.json({
      subscription: updatedSubscription,
      plan
    });
  } catch (error) {
    console.error('Failed to update subscription:', error);
    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 }
    );
  }
}