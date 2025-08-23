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

    if (!userInstitution || !['admin', 'institution_admin', 'billing_admin'].includes(userInstitution.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const invoices = await subscriptionManager.getInvoices(institutionId);

    return NextResponse.json(invoices);
  } catch (error) {
    console.error('Failed to fetch invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
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

    // Get the institution's subscription
    const subscription = await subscriptionManager.getInstitutionSubscription(institutionId);
    if (!subscription) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
    }

    const invoice = await subscriptionManager.generateInvoice(subscription.id);

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error('Failed to generate invoice:', error);
    return NextResponse.json(
      { error: 'Failed to generate invoice' },
      { status: 500 }
    );
  }
}