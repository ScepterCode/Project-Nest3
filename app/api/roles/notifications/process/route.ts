import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RoleNotificationService } from '@/lib/services/role-notification-service';

export async function POST(request: NextRequest) {
  try {
    // Verify this is a scheduled job or admin request
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      // If no cron secret, check for admin user
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Check if user is system admin
      const { data: roleAssignment } = await supabase
        .from('user_role_assignments')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'system_admin')
        .eq('status', 'active')
        .single();

      if (!roleAssignment) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    }

    const roleNotificationService = new RoleNotificationService();
    await roleNotificationService.processScheduledRoleNotifications();

    return NextResponse.json({ 
      success: true, 
      message: 'Scheduled role notifications processed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing scheduled role notifications:', error);
    return NextResponse.json(
      { error: 'Failed to process scheduled role notifications' },
      { status: 500 }
    );
  }
}