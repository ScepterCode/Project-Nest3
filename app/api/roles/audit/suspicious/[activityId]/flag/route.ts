import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RoleAuditService } from '@/lib/services/role-audit-service';

interface RouteParams {
  params: {
    activityId: string;
  };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { activityId } = params;
    const body = await request.json();
    const { notes } = body;

    if (!activityId) {
      return NextResponse.json(
        { error: 'Activity ID is required' },
        { status: 400 }
      );
    }

    const roleAuditService = new RoleAuditService();

    await roleAuditService.flagSuspiciousActivity(
      activityId,
      user.id,
      notes
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error flagging suspicious activity:', error);
    return NextResponse.json(
      { error: 'Failed to flag suspicious activity' },
      { status: 500 }
    );
  }
}