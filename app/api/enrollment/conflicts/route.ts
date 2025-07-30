import { NextRequest, NextResponse } from 'next/server';
import { EnrollmentConflictResolver } from '@/lib/services/enrollment-conflict-resolver';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institutionId');
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    if (!institutionId) {
      return NextResponse.json(
        { error: 'Institution ID is required' },
        { status: 400 }
      );
    }

    const conflictResolver = new EnrollmentConflictResolver();

    if (type === 'history') {
      const history = await conflictResolver.getConflictHistory(institutionId);
      return NextResponse.json({ conflicts: history });
    }

    const conflicts = await conflictResolver.detectConflicts(institutionId);
    
    // Filter by status if provided
    const filteredConflicts = status 
      ? conflicts.filter(c => c.status === status)
      : conflicts;

    return NextResponse.json({ 
      conflicts: filteredConflicts,
      summary: {
        total: conflicts.length,
        open: conflicts.filter(c => c.status === 'open').length,
        investigating: conflicts.filter(c => c.status === 'investigating').length,
        resolved: conflicts.filter(c => c.status === 'resolved').length
      }
    });
  } catch (error) {
    console.error('Conflicts API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conflicts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, conflictId, resolutionMethod, executedBy, overrideRequest } = body;

    const conflictResolver = new EnrollmentConflictResolver();

    switch (action) {
      case 'resolve':
        if (!conflictId || !resolutionMethod || !executedBy) {
          return NextResponse.json(
            { error: 'Missing required fields for resolution' },
            { status: 400 }
          );
        }

        const success = await conflictResolver.executeResolution(conflictId, resolutionMethod, executedBy);
        return NextResponse.json({ success });

      case 'create_override':
        if (!overrideRequest) {
          return NextResponse.json(
            { error: 'Override request data is required' },
            { status: 400 }
          );
        }

        const overrideId = await conflictResolver.createOverrideRequest(overrideRequest);
        return NextResponse.json({ overrideId });

      case 'get_resolutions':
        if (!conflictId) {
          return NextResponse.json(
            { error: 'Conflict ID is required' },
            { status: 400 }
          );
        }

        const resolutions = await conflictResolver.generateResolutionOptions(conflictId);
        return NextResponse.json({ resolutions });

      default:
        return NextResponse.json(
          { error: 'Invalid action specified' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Conflicts POST API error:', error);
    return NextResponse.json(
      { error: 'Failed to process conflict request' },
      { status: 500 }
    );
  }
}