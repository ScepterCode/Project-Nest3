/**
 * Health Check Endpoint
 * Used for monitoring and load balancer health checks
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check database connection
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('institutions')
      .select('id')
      .limit(1);

    if (error) {
      throw error;
    }

    // Check if we have basic data
    const hasData = data && data.length > 0;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      data: hasData ? 'available' : 'empty',
      version: process.env.npm_package_version || '1.0.0'
    });

  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}