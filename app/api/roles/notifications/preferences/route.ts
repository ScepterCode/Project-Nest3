import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RoleNotificationService } from '@/lib/services/role-notification-service';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const roleNotificationService = new RoleNotificationService();
    const preferences = await roleNotificationService.getRoleNotificationPreferences(user.id);

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error('Error fetching role notification preferences:', error);
    return NextResponse.json(
      { error: 'Failed to fetch role notification preferences' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { preferences } = body;

    if (!preferences || preferences.userId !== user.id) {
      return NextResponse.json({ error: 'Invalid preferences data' }, { status: 400 });
    }

    const roleNotificationService = new RoleNotificationService();
    await roleNotificationService.updateRoleNotificationPreferences(preferences);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating role notification preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update role notification preferences' },
      { status: 500 }
    );
  }
}