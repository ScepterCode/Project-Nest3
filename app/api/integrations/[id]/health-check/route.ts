import { NextRequest, NextResponse } from 'next/server';
import { IntegrationHealthMonitor } from '@/lib/services/integration-health-monitor';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const integrationId = params.id;

    if (!integrationId) {
      return NextResponse.json(
        { error: 'Integration ID is required' },
        { status: 400 }
      );
    }

    const healthMonitor = new IntegrationHealthMonitor();
    const result = await healthMonitor.performHealthCheck(integrationId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      { error: 'Health check failed' },
      { status: 500 }
    );
  }
}