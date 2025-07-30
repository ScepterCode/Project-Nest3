import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DataImportExportService } from '@/lib/services/data-import-export';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const integrationId = params.id;
    const { type } = await request.json();

    if (!integrationId) {
      return NextResponse.json(
        { error: 'Integration ID is required' },
        { status: 400 }
      );
    }

    if (!type || !['full', 'incremental'].includes(type)) {
      return NextResponse.json(
        { error: 'Valid sync type is required (full or incremental)' },
        { status: 400 }
      );
    }

    const supabase = createClient();
    
    // Get integration details
    const { data: integration, error: integrationError } = await supabase
      .from('institution_integrations')
      .select('*')
      .eq('id', integrationId)
      .single();

    if (integrationError || !integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    if (!integration.enabled) {
      return NextResponse.json(
        { error: 'Integration is not enabled' },
        { status: 400 }
      );
    }

    // Create sync job record
    const { data: syncJob, error: jobError } = await supabase
      .from('sync_jobs')
      .insert({
        integration_id: integrationId,
        type,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) {
      throw jobError;
    }

    // Start the sync process asynchronously
    startSyncProcess(integrationId, syncJob.id, type);

    return NextResponse.json({
      jobId: syncJob.id,
      status: 'started',
      message: 'Sync job started successfully'
    });
  } catch (error) {
    console.error('Failed to start sync:', error);
    return NextResponse.json(
      { error: 'Failed to start sync' },
      { status: 500 }
    );
  }
}

async function startSyncProcess(integrationId: string, jobId: string, syncType: string) {
  const supabase = createClient();
  const dataService = new DataImportExportService();

  try {
    // Update job status to running
    await supabase
      .from('sync_jobs')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    // Get integration details
    const { data: integration } = await supabase
      .from('institution_integrations')
      .select('*')
      .eq('id', integrationId)
      .single();

    if (!integration) {
      throw new Error('Integration not found');
    }

    let result;
    
    // Perform sync based on integration type
    switch (integration.type) {
      case 'sis':
        result = await dataService.syncFromSIS(integrationId);
        break;
      case 'lms':
        // Implement LMS sync
        result = { success: false, recordsProcessed: 0, recordsImported: 0, recordsSkipped: 0, recordsFailed: 0, errors: [], warnings: [], duration: 0 };
        break;
      default:
        throw new Error(`Unsupported integration type: ${integration.type}`);
    }

    // Update job with results
    await supabase
      .from('sync_jobs')
      .update({
        status: result.success ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        result,
      })
      .eq('id', jobId);

  } catch (error) {
    console.error('Sync process failed:', error);
    
    // Update job status to failed
    await supabase
      .from('sync_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        result: {
          success: false,
          recordsProcessed: 0,
          recordsImported: 0,
          recordsSkipped: 0,
          recordsFailed: 0,
          errors: [{
            message: error instanceof Error ? error.message : 'Unknown error',
            code: 'SYNC_ERROR'
          }],
          warnings: [],
          duration: 0
        },
      })
      .eq('id', jobId);
  }
}