import { NextRequest, NextResponse } from 'next/server';
import { realtimeEnrollmentService } from '@/lib/services/realtime-enrollment';

// This endpoint provides information about the real-time service
export async function GET(request: NextRequest) {
  try {
    const connectedClients = realtimeEnrollmentService.getConnectedClientsCount();
    const roomInfo = realtimeEnrollmentService.getRoomInfo();

    return NextResponse.json({
      status: 'active',
      connectedClients,
      rooms: roomInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting real-time service status:', error);
    return NextResponse.json(
      { error: 'Failed to get real-time service status' },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function POST(request: NextRequest) {
  try {
    const { action, classId } = await request.json();

    switch (action) {
      case 'refresh':
        if (classId) {
          await realtimeEnrollmentService.refreshClassData(classId);
          return NextResponse.json({ success: true, message: 'Class data refreshed' });
        }
        break;
      
      case 'stats':
        if (classId) {
          const stats = await realtimeEnrollmentService.getRealtimeStats(classId);
          return NextResponse.json({ success: true, stats });
        }
        break;
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json(
      { error: 'Missing required parameters' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error handling real-time service request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}