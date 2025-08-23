import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const institutionId = params.id;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');

    if (!institutionId) {
      return NextResponse.json(
        { error: 'Institution ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    let query = supabase
      .from('sync_jobs')
      .select(`
        *,
        institution_integrations!inner(institution_id)
      `)
      .eq('institution_integrations.institution_id', institutionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Transform the data to match the SyncJob interface
    const syncJobs = data.map(job => ({
      id: job.id,
      integrationId: job.integration_id,
      type: job.type,
      status: job.status,
      startedAt: job.started_at ? new Date(job.started_at) : undefined,
      completedAt: job.completed_at ? new Date(job.completed_at) : undefined,
      result: job.result,
      progress: job.progress,
    }));

    return NextResponse.json(syncJobs);
  } catch (error) {
    console.error('Failed to get sync jobs:', error);
    return NextResponse.json(
      { error: 'Failed to get sync jobs' },
      { status: 500 }
    );
  }
}