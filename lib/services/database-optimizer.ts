/**
 * Database Query Optimizer for enrollment operations
 * Provides optimized queries and indexing strategies
 */

import { createClient } from '@/lib/supabase/server';

export class DatabaseOptimizer {
  private supabase = createClient();

  /**
   * Create optimized indexes for enrollment operations
   */
  async createOptimizedIndexes(): Promise<void> {
    const indexes = [
      // Enrollment table indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollments_student_status ON enrollments(student_id, status)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollments_class_status ON enrollments(class_id, status)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollments_enrolled_at ON enrollments(enrolled_at DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollments_composite ON enrollments(class_id, status, enrolled_at)',

      // Enrollment requests indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollment_requests_student ON enrollment_requests(student_id, status)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollment_requests_class ON enrollment_requests(class_id, status)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollment_requests_requested_at ON enrollment_requests(requested_at DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollment_requests_expires_at ON enrollment_requests(expires_at)',

      // Waitlist entries indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waitlist_entries_class_position ON waitlist_entries(class_id, position)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waitlist_entries_student ON waitlist_entries(student_id)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waitlist_entries_added_at ON waitlist_entries(added_at)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waitlist_entries_priority ON waitlist_entries(class_id, priority DESC, added_at)',

      // Classes table indexes for enrollment
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_classes_enrollment_search ON classes(institution_id, department_id, status)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_classes_capacity ON classes(current_enrollment, capacity)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_classes_enrollment_period ON classes(enrollment_start, enrollment_end)',

      // Audit log indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollment_audit_log_student ON enrollment_audit_log(student_id, timestamp DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollment_audit_log_class ON enrollment_audit_log(class_id, timestamp DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollment_audit_log_action ON enrollment_audit_log(action, timestamp DESC)',

      // Prerequisites and restrictions indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_class_prerequisites_class ON class_prerequisites(class_id)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollment_restrictions_class ON enrollment_restrictions(class_id)',

      // Full-text search indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_classes_search ON classes USING gin(to_tsvector(\'english\', name || \' \' || description || \' \' || code))',
    ];

    for (const indexQuery of indexes) {
      try {
        await this.supabase.rpc('execute_sql', { query: indexQuery });
        console.log(`Created index: ${indexQuery.split(' ')[5]}`);
      } catch (error) {
        console.warn(`Failed to create index: ${error}`);
      }
    }
  }

  /**
   * Optimized query for class search with enrollment data
   */
  async searchClassesOptimized(criteria: {
    institutionId?: string;
    departmentId?: string;
    query?: string;
    enrollmentType?: string;
    hasAvailableSpots?: boolean;
    limit?: number;
    offset?: number;
  }) {
    let query = this.supabase
      .from('classes')
      .select(`
        id,
        name,
        code,
        description,
        schedule,
        location,
        capacity,
        current_enrollment,
        waitlist_capacity,
        enrollment_type,
        status,
        teacher_id,
        department_id,
        institution_id,
        enrollment_start,
        enrollment_end,
        created_at,
        users!classes_teacher_id_fkey (
          first_name,
          last_name
        ),
        departments (
          name
        )
      `);

    // Apply filters in order of selectivity (most selective first)
    if (criteria.institutionId) {
      query = query.eq('institution_id', criteria.institutionId);
    }

    if (criteria.departmentId) {
      query = query.eq('department_id', criteria.departmentId);
    }

    if (criteria.enrollmentType) {
      query = query.eq('enrollment_type', criteria.enrollmentType);
    }

    if (criteria.hasAvailableSpots) {
      query = query.lt('current_enrollment', 'capacity');
    }

    // Full-text search should be applied after other filters
    if (criteria.query) {
      query = query.textSearch('name,description,code', criteria.query);
    }

    // Apply pagination
    const limit = criteria.limit || 20;
    const offset = criteria.offset || 0;
    query = query.range(offset, offset + limit - 1);

    return query;
  }

  /**
   * Optimized query for student's available classes
   */
  async getAvailableClassesOptimized(studentId: string, institutionId: string, departmentId?: string) {
    // First, get student's current enrollments in a single query
    const { data: enrolledClassIds } = await this.supabase
      .from('enrollments')
      .select('class_id')
      .eq('student_id', studentId)
      .in('status', ['enrolled', 'pending', 'waitlisted']);

    const excludeIds = enrolledClassIds?.map(e => e.class_id) || [];

    // Then get available classes with optimized query
    let query = this.supabase
      .from('classes')
      .select(`
        id,
        name,
        code,
        description,
        schedule,
        capacity,
        current_enrollment,
        enrollment_type,
        enrollment_start,
        enrollment_end,
        users!classes_teacher_id_fkey (
          first_name,
          last_name
        )
      `)
      .eq('institution_id', institutionId)
      .eq('status', 'active');

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    if (excludeIds.length > 0) {
      query = query.not('id', 'in', `(${excludeIds.join(',')})`);
    }

    // Filter by enrollment period
    const now = new Date().toISOString();
    query = query.or(`enrollment_start.is.null,enrollment_start.lte.${now}`)
                  .or(`enrollment_end.is.null,enrollment_end.gte.${now}`);

    return query.order('name');
  }

  /**
   * Optimized waitlist position calculation
   */
  async calculateWaitlistPositionOptimized(studentId: string, classId: string): Promise<number> {
    const { data, error } = await this.supabase
      .rpc('calculate_waitlist_position', {
        p_student_id: studentId,
        p_class_id: classId
      });

    if (error) {
      throw error;
    }

    return data || 0;
  }

  /**
   * Batch enrollment eligibility check
   */
  async batchEligibilityCheck(studentId: string, classIds: string[]) {
    // Use a single query to get all necessary data
    const { data: studentData } = await this.supabase
      .from('users')
      .select(`
        id,
        year,
        major,
        department_id,
        institution_id,
        enrollments!inner (
          class_id,
          status,
          grade,
          classes (
            code,
            credits
          )
        )
      `)
      .eq('id', studentId)
      .single();

    const { data: classesData } = await this.supabase
      .from('classes')
      .select(`
        id,
        capacity,
        current_enrollment,
        enrollment_start,
        enrollment_end,
        enrollment_type,
        class_prerequisites (*),
        enrollment_restrictions (*)
      `)
      .in('id', classIds);

    // Process eligibility for all classes in memory
    const results: { [classId: string]: any } = {};
    
    for (const classData of classesData || []) {
      results[classData.id] = this.checkEligibilityInMemory(studentData, classData);
    }

    return results;
  }

  /**
   * Optimized enrollment statistics aggregation
   */
  async getEnrollmentStatisticsOptimized(classIds: string[]) {
    const { data, error } = await this.supabase
      .rpc('get_enrollment_statistics_batch', {
        class_ids: classIds
      });

    if (error) {
      throw error;
    }

    return data;
  }

  /**
   * Create database functions for complex operations
   */
  async createOptimizedFunctions(): Promise<void> {
    const functions = [
      // Waitlist position calculation function
      `
      CREATE OR REPLACE FUNCTION calculate_waitlist_position(p_student_id UUID, p_class_id UUID)
      RETURNS INTEGER AS $$
      DECLARE
        position INTEGER;
      BEGIN
        SELECT COUNT(*) + 1 INTO position
        FROM waitlist_entries
        WHERE class_id = p_class_id
          AND (priority > (SELECT priority FROM waitlist_entries WHERE student_id = p_student_id AND class_id = p_class_id)
               OR (priority = (SELECT priority FROM waitlist_entries WHERE student_id = p_student_id AND class_id = p_class_id)
                   AND added_at < (SELECT added_at FROM waitlist_entries WHERE student_id = p_student_id AND class_id = p_class_id)));
        
        RETURN COALESCE(position, 0);
      END;
      $$ LANGUAGE plpgsql;
      `,

      // Batch enrollment statistics function
      `
      CREATE OR REPLACE FUNCTION get_enrollment_statistics_batch(class_ids UUID[])
      RETURNS TABLE(
        class_id UUID,
        total_enrolled INTEGER,
        total_pending INTEGER,
        total_waitlisted INTEGER,
        available_spots INTEGER,
        waitlist_available INTEGER
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          c.id as class_id,
          COALESCE(e.enrolled_count, 0) as total_enrolled,
          COALESCE(er.pending_count, 0) as total_pending,
          COALESCE(w.waitlisted_count, 0) as total_waitlisted,
          GREATEST(0, c.capacity - COALESCE(e.enrolled_count, 0)) as available_spots,
          GREATEST(0, COALESCE(c.waitlist_capacity, 0) - COALESCE(w.waitlisted_count, 0)) as waitlist_available
        FROM classes c
        LEFT JOIN (
          SELECT class_id, COUNT(*) as enrolled_count
          FROM enrollments
          WHERE status = 'enrolled'
          GROUP BY class_id
        ) e ON c.id = e.class_id
        LEFT JOIN (
          SELECT class_id, COUNT(*) as pending_count
          FROM enrollment_requests
          WHERE status = 'pending'
          GROUP BY class_id
        ) er ON c.id = er.class_id
        LEFT JOIN (
          SELECT class_id, COUNT(*) as waitlisted_count
          FROM waitlist_entries
          GROUP BY class_id
        ) w ON c.id = w.class_id
        WHERE c.id = ANY(class_ids);
      END;
      $$ LANGUAGE plpgsql;
      `,

      // Automatic enrollment count update trigger
      `
      CREATE OR REPLACE FUNCTION update_enrollment_count()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          UPDATE classes 
          SET current_enrollment = current_enrollment + 1
          WHERE id = NEW.class_id;
          RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
          UPDATE classes 
          SET current_enrollment = current_enrollment - 1
          WHERE id = OLD.class_id;
          RETURN OLD;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS enrollment_count_trigger ON enrollments;
      CREATE TRIGGER enrollment_count_trigger
        AFTER INSERT OR DELETE ON enrollments
        FOR EACH ROW EXECUTE FUNCTION update_enrollment_count();
      `
    ];

    for (const func of functions) {
      try {
        await this.supabase.rpc('execute_sql', { query: func });
        console.log('Created database function');
      } catch (error) {
        console.warn(`Failed to create function: ${error}`);
      }
    }
  }

  /**
   * Query performance monitoring
   */
  async analyzeQueryPerformance(query: string): Promise<any> {
    try {
      const { data } = await this.supabase.rpc('explain_query', {
        query: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`
      });
      return data;
    } catch (error) {
      console.error('Query analysis failed:', error);
      return null;
    }
  }

  /**
   * Connection pooling optimization
   */
  getOptimizedClient(operationType: 'read' | 'write' = 'read') {
    // In a production environment, you might use different connection pools
    // for read vs write operations
    return this.supabase;
  }

  private checkEligibilityInMemory(studentData: any, classData: any): any {
    // Simplified in-memory eligibility check
    const reasons = [];
    
    // Check capacity
    if (classData.current_enrollment >= classData.capacity) {
      reasons.push({
        type: 'capacity',
        message: 'Class is full',
        severity: 'error'
      });
    }

    // Check enrollment period
    const now = new Date();
    if (classData.enrollment_start && new Date(classData.enrollment_start) > now) {
      reasons.push({
        type: 'deadline',
        message: 'Enrollment not yet open',
        severity: 'error'
      });
    }

    if (classData.enrollment_end && new Date(classData.enrollment_end) < now) {
      reasons.push({
        type: 'deadline',
        message: 'Enrollment period ended',
        severity: 'error'
      });
    }

    return {
      eligible: reasons.filter(r => r.severity === 'error').length === 0,
      reasons
    };
  }
}

export const databaseOptimizer = new DatabaseOptimizer();