import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const institutionId = params.id;

    if (!institutionId) {
      return NextResponse.json(
        { error: 'Institution ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('sync_schedules')
      .select(`
        *,
        institution_integrations!inner(institution_id)
      `)
      .eq('institution_integrations.institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Transform the data to match the SyncSchedule interface
    const syncSchedules = data.map(schedule => ({
      id: schedule.id,
      integrationId: schedule.integration_id,
      enabled: schedule.enabled,
      cronExpression: schedule.cron_expression,
      syncType: schedule.sync_type,
      lastRun: schedule.last_run ? new Date(schedule.last_run) : undefined,
      nextRun: schedule.next_run ? new Date(schedule.next_run) : undefined,
    }));

    return NextResponse.json(syncSchedules);
  } catch (error) {
    console.error('Failed to get sync schedules:', error);
    return NextResponse.json(
      { error: 'Failed to get sync schedules' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const institutionId = params.id;
    const scheduleData = await request.json();

    if (!institutionId) {
      return NextResponse.json(
        { error: 'Institution ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('sync_schedules')
      .insert({
        integration_id: scheduleData.integrationId,
        enabled: scheduleData.enabled,
        cron_expression: scheduleData.cronExpression,
        sync_type: scheduleData.syncType,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    const syncSchedule = {
      id: data.id,
      integrationId: data.integration_id,
      enabled: data.enabled,
      cronExpression: data.cron_expression,
      syncType: data.sync_type,
      lastRun: data.last_run ? new Date(data.last_run) : undefined,
      nextRun: data.next_run ? new Date(data.next_run) : undefined,
    };

    return NextResponse.json(syncSchedule);
  } catch (error) {
    console.error('Failed to create sync schedule:', error);
    return NextResponse.json(
      { error: 'Failed to create sync schedule' },
      { status: 500 }
    );
  }
}