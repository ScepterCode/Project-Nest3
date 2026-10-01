/**
 * Health Check Endpoint
 * Used for monitoring and load balancer health checks. Public (see
 * lib/supabase/middleware.ts), so it reveals nothing beyond up/down.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    // Signed-out requests can't read any table (RLS), so ping Supabase's own
    // health endpoint instead of querying data.
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`,
      {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      throw new Error(`Supabase responded ${response.status}`);
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp,
      database: 'connected',
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      { status: 'unhealthy', timestamp },
      { status: 503 }
    );
  }
}
