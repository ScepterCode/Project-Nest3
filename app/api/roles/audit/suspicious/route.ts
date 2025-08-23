import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RoleAuditService } from '@/lib/services/role-audit-service';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const institutionId = searchParams.get('institutionId') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
    const severity = searchParams.getAll('severity');
    const flagged = searchParams.get('flagged') ? searchParams.get('flagged') === 'true' : undefined;

    const roleAuditService = new RoleAuditService();

    const activities = await roleAuditService.getSuspiciousActivities({
      institutionId,
      departmentId,
      startDate,
      endDate,
      severity: severity.length > 0 ? severity : undefined,
      flagged
    });

    return NextResponse.json({ activities });

  } catch (error) {
    console.error('Error fetching suspicious activities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch suspicious activities' },
      { status: 500 }
    );
  }
}