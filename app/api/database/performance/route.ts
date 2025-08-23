import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Simple database health check
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (error) {
      return NextResponse.json(
        { 
          status: 'error',
          error: 'Database connection failed',
          message: error.message
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      message: 'Database is accessible'
    });
    
  } catch (error) {
    console.error('Database performance API error:', error);
    
    return NextResponse.json(
      { 
        status: 'error',
        error: 'Failed to check database performance',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json({
      message: 'Database performance monitoring is simplified',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database performance API POST error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to process database performance request',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}