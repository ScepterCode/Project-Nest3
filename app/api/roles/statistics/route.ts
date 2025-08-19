import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UserRole } from '@/lib/types/role-management';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user profile to check permissions
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('id, institution_id, primary_role, department_id')
      .eq('id', user.id)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Check if user has permission to view statistics
    const canViewStats = [
      UserRole.SYSTEM_ADMIN,
      UserRole.INSTITUTION_ADMIN,
      UserRole.DEPARTMENT_ADMIN
    ].includes(userProfile.primary_role);

    if (!canViewStats) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view role statistics' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institutionId');
    const departmentId = searchParams.get('departmentId');

    // Build base queries based on user permissions
    let userQuery = supabase.from('users').select('id, primary_role, created_at');
    let requestQuery = supabase.from('role_requests').select('id, requested_role, status, requested_at, reviewed_at');
    let auditQuery = supabase.from('role_audit_log').select('id, action, timestamp');

    // Apply filters based on user role and permissions
    if (userProfile.primary_role === UserRole.SYSTEM_ADMIN) {
      // System admins can see all data
      if (institutionId) {
        userQuery = userQuery.eq('institution_id', institutionId);
        requestQuery = requestQuery.eq('institution_id', institutionId);
        auditQuery = auditQuery.eq('institution_id', institutionId);
      }
    } else if (userProfile.primary_role === UserRole.INSTITUTION_ADMIN) {
      // Institution admins can only see data from their institution
      userQuery = userQuery.eq('institution_id', userProfile.institution_id);
      requestQuery = requestQuery.eq('institution_id', userProfile.institution_id);
      auditQuery = auditQuery.eq('institution_id', userProfile.institution_id);
    } else if (userProfile.primary_role === UserRole.DEPARTMENT_ADMIN) {
      // Department admins can only see data from their department
      userQuery = userQuery
        .eq('institution_id', userProfile.institution_id)
        .eq('department_id', userProfile.department_id);
      requestQuery = requestQuery
        .eq('institution_id', userProfile.institution_id)
        .eq('department_id', userProfile.department_id);
      auditQuery = auditQuery
        .eq('institution_id', userProfile.institution_id)
        .eq('department_id', userProfile.department_id);
    }

    // Apply additional filters
    if (departmentId && userProfile.primary_role !== UserRole.DEPARTMENT_ADMIN) {
      userQuery = userQuery.eq('department_id', departmentId);
      requestQuery = requestQuery.eq('department_id', departmentId);
      auditQuery = auditQuery.eq('department_id', departmentId);
    }

    // Execute queries in parallel
    const [usersResult, requestsResult, auditResult] = await Promise.all([
      userQuery,
      requestQuery,
      auditResult
    ]);

    if (usersResult.error) {
      console.error('Error fetching users:', usersResult.error);
      return NextResponse.json(
        { error: 'Failed to fetch user statistics' },
        { status: 500 }
      );
    }

    if (requestsResult.error) {
      console.error('Error fetching requests:', requestsResult.error);
      return NextResponse.json(
        { error: 'Failed to fetch request statistics' },
        { status: 500 }
      );
    }

    const users = usersResult.data || [];
    const requests = requestsResult.data || [];
    const auditLogs = auditResult.data || [];

    // Calculate statistics
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Role distribution
    const roleDistribution = users.reduce((acc, user) => {
      const role = user.primary_role as UserRole;
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {} as Record<UserRole, number>);

    // Request statistics
    const pendingRequests = requests.filter(r => r.status === 'pending').length;
    const approvedToday = requests.filter(r => 
      r.status === 'approved' && 
      r.reviewed_at && 
      new Date(r.reviewed_at) >= todayStart
    ).length;
    const deniedToday = requests.filter(r => 
      r.status === 'denied' && 
      r.reviewed_at && 
      new Date(r.reviewed_at) >= todayStart
    ).length;

    // Urgent requests (expiring within 2 days)
    const urgentThreshold = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const urgentRequests = requests.filter(r => 
      r.status === 'pending' && 
      new Date(r.expires_at) <= urgentThreshold
    ).length;

    // Requests by role
    const requestsByRole = requests.reduce((acc, request) => {
      const role = request.requested_role as UserRole;
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {} as Record<UserRole, number>);

    // Average processing time (for approved/denied requests)
    const processedRequests = requests.filter(r => 
      (r.status === 'approved' || r.status === 'denied') && 
      r.reviewed_at
    );
    
    let averageProcessingTime = 0;
    if (processedRequests.length > 0) {
      const totalProcessingTime = processedRequests.reduce((sum, request) => {
        const requestedAt = new Date(request.requested_at);
        const reviewedAt = new Date(request.reviewed_at!);
        return sum + (reviewedAt.getTime() - requestedAt.getTime());
      }, 0);
      averageProcessingTime = Math.round(totalProcessingTime / processedRequests.length / (1000 * 60 * 60)); // Convert to hours
    }

    // Recent activity trends (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentRequests = requests.filter(r => new Date(r.requested_at) >= thirtyDaysAgo);
    const recentAuditLogs = auditLogs.filter(log => new Date(log.timestamp) >= thirtyDaysAgo);

    // Daily request trends
    const dailyTrends = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      
      const dayRequests = recentRequests.filter(r => {
        const requestDate = new Date(r.requested_at);
        return requestDate >= dayStart && requestDate < dayEnd;
      });

      dailyTrends.push({
        date: dayStart.toISOString().split('T')[0],
        requests: dayRequests.length,
        approved: dayRequests.filter(r => r.status === 'approved').length,
        denied: dayRequests.filter(r => r.status === 'denied').length,
        pending: dayRequests.filter(r => r.status === 'pending').length
      });
    }

    const statistics = {
      totalUsers: users.length,
      totalRequests: requests.length,
      pendingRequests,
      approvedToday,
      deniedToday,
      urgentRequests,
      roleDistribution,
      requestsByRole,
      averageProcessingTime,
      trends: {
        daily: dailyTrends,
        recentActivity: recentAuditLogs.length
      },
      summary: {
        approvalRate: requests.length > 0 
          ? Math.round((requests.filter(r => r.status === 'approved').length / requests.length) * 100)
          : 0,
        averageDaysToProcess: Math.round(averageProcessingTime / 24),
        mostRequestedRole: Object.entries(requestsByRole).reduce((a, b) => 
          requestsByRole[a[0] as UserRole] > requestsByRole[b[0] as UserRole] ? a : b, 
          [UserRole.STUDENT, 0]
        )[0],
        peakRequestHour: calculatePeakRequestHour(requests)
      }
    };

    return NextResponse.json({
      success: true,
      data: statistics
    });

  } catch (error) {
    console.error('Get role statistics error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function calculatePeakRequestHour(requests: any[]): number {
  const hourCounts = new Array(24).fill(0);
  
  requests.forEach(request => {
    const hour = new Date(request.requested_at).getHours();
    hourCounts[hour]++;
  });

  return hourCounts.indexOf(Math.max(...hourCounts));
}