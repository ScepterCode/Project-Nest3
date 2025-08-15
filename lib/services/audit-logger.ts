import { createClient } from '@/lib/supabase/server';

interface AuditLogEntry {
  action: string;
  userId: string;
  institutionId: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditLogger {
  private supabase = createClient();

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('audit_logs')
        .insert({
          action: entry.action,
          user_id: entry.userId,
          institution_id: entry.institutionId,
          details: entry.details,
          ip_address: entry.ipAddress,
          user_agent: entry.userAgent,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Failed to log audit entry:', error);
      }
    } catch (error) {
      console.error('Audit logger error:', error);
    }
  }

  async getAuditTrail(
    institutionId: string,
    action?: string,
    userId?: string,
    limit = 100
  ): Promise<any[]> {
    let query = this.supabase
      .from('audit_logs')
      .select(`
        *,
        user_profiles!audit_logs_user_id_fkey(first_name, last_name, email)
      `)
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (action) {
      query = query.eq('action', action);
    }

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to get audit trail:', error);
      return [];
    }

    return data || [];
  }
}