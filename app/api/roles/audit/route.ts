import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RoleAuditService } from '@/lib/services/role-audit-service';
import { AuditAction, UserRole } from '@/lib/types/role-management';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId') || undefined;
    const performedBy = searchParams.get('performedBy') || undefined;
    const action = searchParams.get('action') as AuditAction || undefined;
    const role = searchParams.get('role') as UserRole || undefined;
    const institutionId = searchParams.get('institutionId') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
    const searchTerm = searchParams.get('searchTerm') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const roleAuditService = new RoleAuditService();

    // Build query filters
    const query = {
      userId,
      performedBy,
      action,
      role,
      institutionId,
      departmentId,
      startDate,
      endDate,
      limit,
      offset
    };

    const result = await roleAuditService.queryRoleAuditLogs(query);

    // If search term is provided, filter results
    let filteredEntries = result.entries;
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filteredEntries = result.entries.filter(entry => 
        entry.userName?.toLowerCase().includes(searchLower) ||
        entry.userEmail?.toLowerCase().includes(searchLower) ||
        entry.performedByName?.toLowerCase().includes(searchLower) ||
        entry.performedByEmail?.toLowerCase().includes(searchLower) ||
        entry.reason?.toLowerCase().includes(searchLower) ||
        entry.action.toLowerCase().includes(searchLower)
      );
    }

    return NextResponse.json({
      entries: filteredEntries,
      totalCount: result.totalCount,
      hasMore: result.hasMore
    });

  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      description,
      periodStart,
      periodEnd,
      institutionId,
      departmentId
    } = body;

    if (!title || !periodStart || !periodEnd) {
      return NextResponse.json(
        { error: 'Missing required fields: title, periodStart, periodEnd' },
        { status: 400 }
      );
    }

    const roleAuditService = new RoleAuditService();

    const report = await roleAuditService.generateRoleAuditReport(
      title,
      user.id,
      new Date(periodStart),
      new Date(periodEnd),
      institutionId,
      departmentId
    );

    return NextResponse.json({ report });

  } catch (error) {
    console.error('Error generating audit report:', error);
    return NextResponse.json(
      { error: 'Failed to generate audit report' },
      { status: 500 }
    );
  }
}