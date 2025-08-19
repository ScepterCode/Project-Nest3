import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RoleAuditService } from '@/lib/services/role-audit-service';
import { AuditAction, UserRole } from '@/lib/types/role-management';
import { format } from 'date-fns';

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

    const roleAuditService = new RoleAuditService();

    // Get all matching entries (no pagination for export)
    const query = {
      userId,
      performedBy,
      action,
      role,
      institutionId,
      departmentId,
      startDate,
      endDate,
      limit: 10000 // Large limit for export
    };

    const result = await roleAuditService.queryRoleAuditLogs(query);

    // Filter by search term if provided
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

    // Generate CSV content
    const csvHeaders = [
      'Timestamp',
      'User ID',
      'User Name',
      'User Email',
      'Action',
      'Old Role',
      'New Role',
      'Performed By ID',
      'Performed By Name',
      'Performed By Email',
      'Reason',
      'Institution ID',
      'Institution Name',
      'Department ID',
      'Department Name',
      'Metadata'
    ];

    const csvRows = filteredEntries.map(entry => [
      format(entry.timestamp, 'yyyy-MM-dd HH:mm:ss'),
      entry.userId,
      entry.userName || '',
      entry.userEmail || '',
      entry.action,
      entry.oldRole || '',
      entry.newRole || '',
      entry.changedBy,
      entry.performedByName || '',
      entry.performedByEmail || '',
      entry.reason || '',
      entry.institutionId || '',
      entry.institutionName || '',
      entry.departmentId || '',
      entry.departmentName || '',
      JSON.stringify(entry.metadata)
    ]);

    // Escape CSV values
    const escapeCsvValue = (value: string) => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(escapeCsvValue).join(','))
    ].join('\n');

    // Return CSV file
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="role-audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv"`
      }
    });

  } catch (error) {
    console.error('Error exporting audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to export audit logs' },
      { status: 500 }
    );
  }
}