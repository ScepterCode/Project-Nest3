import { NextRequest, NextResponse } from 'next/server';
import { IntegrationHealthMonitor } from '@/lib/services/integration-health-monitor';

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

    const healthMonitor = new IntegrationHealthMonitor();
    const healthData = await healthMonitor.listIntegrationHealth(institutionId);

    return NextResponse.json(healthData);
  } catch (error) {
    console.error('Failed to get integration health:', error);
    return NextResponse.json(
      { error: 'Failed to get integration health' },
      { status: 500 }
    );
  }
}