import { NextRequest, NextResponse } from 'next/server';
import { SubscriptionManager } from '@/lib/services/subscription-manager';
import { createClient } from '@/lib/supabase/server';

const subscriptionManager = new SubscriptionManager();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
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

    if (!userInstitution) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period');

    let usage;
    if (period) {
      const metrics = await subscriptionManager.getUsageMetrics(institutionId, period);
      usage = metrics[0] || null;
    } else {
      usage = await subscriptionManager.getCurrentUsage(institutionId);
    }

    return NextResponse.json(usage);
  } catch (error) {
    console.error('Failed to fetch usage metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage metrics' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
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

    const { period, metrics } = await request.json();

    if (!period || !metrics) {
      return NextResponse.json({ error: 'Period and metrics are required' }, { status: 400 });
    }

    await subscriptionManager.recordUsageMetrics({
      institutionId,
      period,
      metrics
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Failed to record usage metrics:', error);
    return NextResponse.json(
      { error: 'Failed to record usage metrics' },
      { status: 500 }
    );
  }
}