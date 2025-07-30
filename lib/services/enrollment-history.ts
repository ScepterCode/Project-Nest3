import { createClient } from '@/lib/supabase/server';

export interface EnrollmentHistoryRecord {
  id: string;
  student_id: string;
  class_id: string;
  enrollment_id?: string;
  action: string;
  status_before?: string;
  status_after?: string;
  timestamp: Date;
  academic_term: string;
  grade_at_time?: string;
  credits: number;
  metadata: Record<string, any>;
  hash: string; // For integrity verification
  previous_hash?: string; // Chain of records
}

export interface EnrollmentSnapshot {
  student_id: string;
  class_id: string;
  status: string;
  enrolled_at: Date;
  grade?: string;
  credits: number;
  academic_term: string;
  snapshot_at: Date;
  metadata: Record<string, any>;
}

export class EnrollmentHistoryService {
  private supabase = createClient();

  /**
   * Create an immutable history record for enrollment changes
   */
  async createHistoryRecord(
    studentId: string,
    classId: string,
    action: string,
    statusBefore: string | null,
    statusAfter: string | null,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      // Get the last record for this student/class to create chain
      const { data: lastRecord } = await this.supabase
        .from('enrollment_history')
        .select('hash')
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      // Get current enrollment details
      const { data: enrollment } = await this.supabase
        .from('enrollments')
        .select('*')
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .single();

      // Get current academic term
      const currentTerm = await this.getCurrentAcademicTerm();

      const historyRecord = {
        student_id: studentId,
        class_id: classId,
        enrollment_id: enrollment?.id,
        action,
        status_before: statusBefore,
        status_after: statusAfter,
        timestamp: new Date().toISOString(),
        academic_term: currentTerm,
        grade_at_time: enrollment?.grade,
        credits: enrollment?.credits || 0,
        metadata,
        previous_hash: lastRecord?.hash
      };

      // Generate hash for integrity
      const hash = await this.generateRecordHash(historyRecord);
      
      const { error } = await this.supabase
        .from('enrollment_history')
        .insert({
          ...historyRecord,
          hash
        });

      if (error) {
        console.error('Failed to create history record:', error);
      }
    } catch (error) {
      console.error('History record creation error:', error);
    }
  }

  /**
   * Create periodic snapshots of enrollment state
   */
  async createEnrollmentSnapshot(
    studentId: string,
    classId: string
  ): Promise<void> {
    try {
      const { data: enrollment } = await this.supabase
        .from('enrollments')
        .select('*')
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .single();

      if (!enrollment) return;

      const currentTerm = await this.getCurrentAcademicTerm();

      const snapshot: Partial<EnrollmentSnapshot> = {
        student_id: studentId,
        class_id: classId,
        status: enrollment.status,
        enrolled_at: enrollment.enrolled_at,
        grade: enrollment.grade,
        credits: enrollment.credits,
        academic_term: currentTerm,
        snapshot_at: new Date().toISOString(),
        metadata: enrollment.metadata || {}
      };

      const { error } = await this.supabase
        .from('enrollment_snapshots')
        .insert(snapshot);

      if (error) {
        console.error('Failed to create enrollment snapshot:', error);
      }
    } catch (error) {
      console.error('Snapshot creation error:', error);
    }
  }

  /**
   * Get complete enrollment history for a student
   */
  async getStudentEnrollmentHistory(
    studentId: string,
    options: {
      classId?: string;
      academicTerm?: string;
      includeSnapshots?: boolean;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{
    history: EnrollmentHistoryRecord[];
    snapshots?: EnrollmentSnapshot[];
  }> {
    let historyQuery = this.supabase
      .from('enrollment_history')
      .select(`
        *,
        class:classes!enrollment_history_class_id_fkey(id, name, code, department_id)
      `)
      .eq('student_id', studentId)
      .order('timestamp', { ascending: false });

    if (options.classId) {
      historyQuery = historyQuery.eq('class_id', options.classId);
    }

    if (options.academicTerm) {
      historyQuery = historyQuery.eq('academic_term', options.academicTerm);
    }

    if (options.startDate) {
      historyQuery = historyQuery.gte('timestamp', options.startDate.toISOString());
    }

    if (options.endDate) {
      historyQuery = historyQuery.lte('timestamp', options.endDate.toISOString());
    }

    const { data: history, error: historyError } = await historyQuery;

    if (historyError) {
      throw new Error(`Failed to fetch enrollment history: ${historyError.message}`);
    }

    let snapshots: EnrollmentSnapshot[] = [];

    if (options.includeSnapshots) {
      let snapshotQuery = this.supabase
        .from('enrollment_snapshots')
        .select('*')
        .eq('student_id', studentId)
        .order('snapshot_at', { ascending: false });

      if (options.classId) {
        snapshotQuery = snapshotQuery.eq('class_id', options.classId);
      }

      if (options.academicTerm) {
        snapshotQuery = snapshotQuery.eq('academic_term', options.academicTerm);
      }

      const { data: snapshotData, error: snapshotError } = await snapshotQuery;

      if (snapshotError) {
        console.error('Failed to fetch snapshots:', snapshotError);
      } else {
        snapshots = snapshotData || [];
      }
    }

    return {
      history: history || [],
      snapshots: options.includeSnapshots ? snapshots : undefined
    };
  }

  /**
   * Verify the integrity of enrollment history chain
   */
  async verifyHistoryIntegrity(
    studentId: string,
    classId: string
  ): Promise<{
    isValid: boolean;
    brokenChains: string[];
    invalidHashes: string[];
  }> {
    const { data: records, error } = await this.supabase
      .from('enrollment_history')
      .select('*')
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .order('timestamp', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch history for verification: ${error.message}`);
    }

    const brokenChains: string[] = [];
    const invalidHashes: string[] = [];

    for (let i = 0; i < (records?.length || 0); i++) {
      const record = records![i];
      
      // Verify hash integrity
      const expectedHash = await this.generateRecordHash({
        ...record,
        hash: undefined // Remove hash for verification
      });

      if (record.hash !== expectedHash) {
        invalidHashes.push(record.id);
      }

      // Verify chain integrity
      if (i > 0) {
        const previousRecord = records![i - 1];
        if (record.previous_hash !== previousRecord.hash) {
          brokenChains.push(record.id);
        }
      }
    }

    return {
      isValid: brokenChains.length === 0 && invalidHashes.length === 0,
      brokenChains,
      invalidHashes
    };
  }

  /**
   * Generate academic transcript from enrollment history
   */
  async generateTranscript(
    studentId: string,
    options: {
      academicTerm?: string;
      includeInProgress?: boolean;
      officialFormat?: boolean;
    } = {}
  ): Promise<{
    student: any;
    enrollments: Array<{
      class: any;
      status: string;
      grade?: string;
      credits: number;
      academicTerm: string;
      enrolledAt: Date;
      completedAt?: Date;
    }>;
    summary: {
      totalCredits: number;
      completedCredits: number;
      gpa?: number;
      academicStanding: string;
    };
  }> {
    // Get student information
    const { data: student } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', studentId)
      .single();

    // Get enrollment history
    const { history } = await this.getStudentEnrollmentHistory(studentId, {
      academicTerm: options.academicTerm
    });

    // Process enrollments for transcript
    const enrollmentMap = new Map();
    
    history.forEach(record => {
      const key = `${record.class_id}-${record.academic_term}`;
      if (!enrollmentMap.has(key) || 
          new Date(record.timestamp) > new Date(enrollmentMap.get(key).timestamp)) {
        enrollmentMap.set(key, record);
      }
    });

    const enrollments = Array.from(enrollmentMap.values())
      .filter(record => {
        if (!options.includeInProgress && record.status_after === 'enrolled') {
          return false;
        }
        return record.status_after === 'completed' || 
               (options.includeInProgress && record.status_after === 'enrolled');
      })
      .map(record => ({
        class: record.class,
        status: record.status_after,
        grade: record.grade_at_time,
        credits: record.credits,
        academicTerm: record.academic_term,
        enrolledAt: new Date(record.timestamp),
        completedAt: record.status_after === 'completed' ? new Date(record.timestamp) : undefined
      }));

    // Calculate summary statistics
    const totalCredits = enrollments.reduce((sum, e) => sum + e.credits, 0);
    const completedCredits = enrollments
      .filter(e => e.status === 'completed')
      .reduce((sum, e) => sum + e.credits, 0);

    // Calculate GPA if grades are available
    let gpa: number | undefined;
    const gradedEnrollments = enrollments.filter(e => e.grade && e.status === 'completed');
    if (gradedEnrollments.length > 0) {
      const gradePoints = gradedEnrollments.reduce((sum, e) => {
        const points = this.gradeToPoints(e.grade!);
        return sum + (points * e.credits);
      }, 0);
      gpa = gradePoints / completedCredits;
    }

    return {
      student,
      enrollments,
      summary: {
        totalCredits,
        completedCredits,
        gpa,
        academicStanding: this.calculateAcademicStanding(gpa, completedCredits)
      }
    };
  }

  private async generateRecordHash(record: any): Promise<string> {
    const recordString = JSON.stringify({
      student_id: record.student_id,
      class_id: record.class_id,
      action: record.action,
      status_before: record.status_before,
      status_after: record.status_after,
      timestamp: record.timestamp,
      previous_hash: record.previous_hash
    });

    // Simple hash function - in production, use crypto.subtle.digest
    let hash = 0;
    for (let i = 0; i < recordString.length; i++) {
      const char = recordString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  private async getCurrentAcademicTerm(): Promise<string> {
    // This would typically integrate with an academic calendar system
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    if (month >= 8 && month <= 12) {
      return `Fall ${year}`;
    } else if (month >= 1 && month <= 5) {
      return `Spring ${year}`;
    } else {
      return `Summer ${year}`;
    }
  }

  private gradeToPoints(grade: string): number {
    const gradeMap: Record<string, number> = {
      'A+': 4.0, 'A': 4.0, 'A-': 3.7,
      'B+': 3.3, 'B': 3.0, 'B-': 2.7,
      'C+': 2.3, 'C': 2.0, 'C-': 1.7,
      'D+': 1.3, 'D': 1.0, 'D-': 0.7,
      'F': 0.0
    };
    return gradeMap[grade] || 0.0;
  }

  private calculateAcademicStanding(gpa?: number, credits?: number): string {
    if (!gpa || !credits) return 'Unknown';
    
    if (gpa >= 3.5) return 'Dean\'s List';
    if (gpa >= 3.0) return 'Good Standing';
    if (gpa >= 2.0) return 'Satisfactory';
    return 'Academic Probation';
  }
}