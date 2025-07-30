import { createClient } from '@/lib/supabase/server';

export interface FraudDetectionResult {
  isValid: boolean;
  riskScore: number;
  flags: string[];
  recommendations: string[];
}

export interface EnrollmentAttempt {
  userId: string;
  classId: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

export interface SuspiciousActivity {
  id: string;
  userId: string;
  activityType: 'rapid_enrollment' | 'duplicate_requests' | 'unusual_pattern' | 'invalid_prerequisites';
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Date;
  metadata: Record<string, any>;
}

export class EnrollmentFraudPreventionService {
  private supabase = createClient();

  /**
   * Validate enrollment request for potential fraud indicators
   */
  async validateEnrollmentRequest(
    userId: string,
    classId: string,
    metadata: Record<string, any> = {}
  ): Promise<FraudDetectionResult> {
    const flags: string[] = [];
    let riskScore = 0;
    const recommendations: string[] = [];

    try {
      // Check for rapid enrollment attempts
      const rapidAttempts = await this.checkRapidEnrollmentAttempts(userId);
      if (rapidAttempts.isRapid) {
        flags.push('rapid_enrollment_attempts');
        riskScore += 30;
        recommendations.push('Implement cooling-off period');
      }

      // Check for duplicate requests
      const duplicateRequests = await this.checkDuplicateRequests(userId, classId);
      if (duplicateRequests.hasDuplicates) {
        flags.push('duplicate_enrollment_requests');
        riskScore += 25;
        recommendations.push('Block duplicate submissions');
      }

      // Check enrollment pattern anomalies
      const patternAnalysis = await this.analyzeEnrollmentPattern(userId);
      if (patternAnalysis.isAnomalous) {
        flags.push('unusual_enrollment_pattern');
        riskScore += patternAnalysis.riskIncrease;
        recommendations.push('Manual review required');
      }

      // Check prerequisite manipulation
      const prerequisiteCheck = await this.checkPrerequisiteManipulation(userId, classId);
      if (prerequisiteCheck.isSuspicious) {
        flags.push('prerequisite_manipulation');
        riskScore += 40;
        recommendations.push('Verify academic records');
      }

      // Check for session anomalies
      if (metadata.ipAddress && metadata.userAgent) {
        const sessionCheck = await this.checkSessionAnomalies(userId, metadata);
        if (sessionCheck.isSuspicious) {
          flags.push('session_anomalies');
          riskScore += 20;
          recommendations.push('Require additional authentication');
        }
      }

      // Log the validation attempt
      await this.logValidationAttempt(userId, classId, riskScore, flags);

      return {
        isValid: riskScore < 50, // Threshold for blocking
        riskScore,
        flags,
        recommendations
      };
    } catch (error) {
      console.error('Error validating enrollment request:', error);
      return {
        isValid: false,
        riskScore: 100,
        flags: ['validation_error'],
        recommendations: ['Manual review required due to system error']
      };
    }
  }

  /**
   * Check for rapid enrollment attempts within a short time window
   */
  private async checkRapidEnrollmentAttempts(userId: string): Promise<{
    isRapid: boolean;
    attemptCount: number;
    timeWindow: number;
  }> {
    const timeWindow = 5 * 60 * 1000; // 5 minutes
    const maxAttempts = 10;
    const cutoffTime = new Date(Date.now() - timeWindow);

    const { data: attempts, error } = await this.supabase
      .from('enrollment_attempts')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', cutoffTime.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error checking rapid attempts:', error);
      return { isRapid: false, attemptCount: 0, timeWindow };
    }

    const attemptCount = attempts?.length || 0;
    return {
      isRapid: attemptCount > maxAttempts,
      attemptCount,
      timeWindow
    };
  }

  /**
   * Check for duplicate enrollment requests
   */
  private async checkDuplicateRequests(userId: string, classId: string): Promise<{
    hasDuplicates: boolean;
    duplicateCount: number;
  }> {
    const timeWindow = 24 * 60 * 60 * 1000; // 24 hours
    const cutoffTime = new Date(Date.now() - timeWindow);

    const { data: requests, error } = await this.supabase
      .from('enrollment_requests')
      .select('*')
      .eq('student_id', userId)
      .eq('class_id', classId)
      .gte('requested_at', cutoffTime.toISOString());

    if (error) {
      console.error('Error checking duplicate requests:', error);
      return { hasDuplicates: false, duplicateCount: 0 };
    }

    const duplicateCount = requests?.length || 0;
    return {
      hasDuplicates: duplicateCount > 1,
      duplicateCount
    };
  }

  /**
   * Analyze enrollment patterns for anomalies
   */
  private async analyzeEnrollmentPattern(userId: string): Promise<{
    isAnomalous: boolean;
    riskIncrease: number;
    patterns: string[];
  }> {
    const patterns: string[] = [];
    let riskIncrease = 0;

    // Check enrollment frequency
    const { data: recentEnrollments, error } = await this.supabase
      .from('enrollments')
      .select('*')
      .eq('student_id', userId)
      .gte('enrolled_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (error) {
      console.error('Error analyzing enrollment pattern:', error);
      return { isAnomalous: false, riskIncrease: 0, patterns: [] };
    }

    const enrollmentCount = recentEnrollments?.length || 0;

    // Unusual enrollment frequency
    if (enrollmentCount > 15) {
      patterns.push('excessive_enrollment_frequency');
      riskIncrease += 25;
    }

    // Check for enrollment in conflicting time slots
    const conflictingEnrollments = await this.checkTimeConflicts(recentEnrollments || []);
    if (conflictingEnrollments.hasConflicts) {
      patterns.push('time_slot_conflicts');
      riskIncrease += 15;
    }

    // Check for enrollment in prerequisites without completion
    const prerequisiteViolations = await this.checkPrerequisiteViolations(userId, recentEnrollments || []);
    if (prerequisiteViolations.hasViolations) {
      patterns.push('prerequisite_violations');
      riskIncrease += 30;
    }

    return {
      isAnomalous: patterns.length > 0,
      riskIncrease,
      patterns
    };
  }

  /**
   * Check for prerequisite manipulation attempts
   */
  private async checkPrerequisiteManipulation(userId: string, classId: string): Promise<{
    isSuspicious: boolean;
    violations: string[];
  }> {
    const violations: string[] = [];

    // Get class prerequisites
    const { data: prerequisites, error: prereqError } = await this.supabase
      .from('class_prerequisites')
      .select('*')
      .eq('class_id', classId);

    if (prereqError || !prerequisites) {
      return { isSuspicious: false, violations: [] };
    }

    // Get student's completed courses
    const { data: completedCourses, error: coursesError } = await this.supabase
      .from('enrollments')
      .select('class_id, grade, status')
      .eq('student_id', userId)
      .in('status', ['completed', 'enrolled']);

    if (coursesError) {
      return { isSuspicious: false, violations: [] };
    }

    // Check each prerequisite
    for (const prerequisite of prerequisites) {
      if (prerequisite.type === 'course') {
        const hasCompleted = completedCourses?.some(
          course => course.class_id === prerequisite.requirement && 
          (course.status === 'completed' || course.grade)
        );

        if (!hasCompleted && prerequisite.strict) {
          violations.push(`Missing prerequisite: ${prerequisite.requirement}`);
        }
      }
    }

    return {
      isSuspicious: violations.length > 0,
      violations
    };
  }

  /**
   * Check for session-based anomalies
   */
  private async checkSessionAnomalies(userId: string, metadata: Record<string, any>): Promise<{
    isSuspicious: boolean;
    anomalies: string[];
  }> {
    const anomalies: string[] = [];

    // Check for rapid IP changes
    const { data: recentSessions, error } = await this.supabase
      .from('enrollment_attempts')
      .select('ip_address, user_agent, created_at')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !recentSessions) {
      return { isSuspicious: false, anomalies: [] };
    }

    // Check for multiple IP addresses
    const uniqueIPs = new Set(recentSessions.map(session => session.ip_address));
    if (uniqueIPs.size > 3) {
      anomalies.push('multiple_ip_addresses');
    }

    // Check for unusual user agents
    const uniqueUserAgents = new Set(recentSessions.map(session => session.user_agent));
    if (uniqueUserAgents.size > 2) {
      anomalies.push('multiple_user_agents');
    }

    return {
      isSuspicious: anomalies.length > 0,
      anomalies
    };
  }

  /**
   * Check for time slot conflicts in enrollments
   */
  private async checkTimeConflicts(enrollments: any[]): Promise<{
    hasConflicts: boolean;
    conflictCount: number;
  }> {
    // This would need to be implemented based on class schedule data
    // For now, return a basic implementation
    return { hasConflicts: false, conflictCount: 0 };
  }

  /**
   * Check for prerequisite violations
   */
  private async checkPrerequisiteViolations(userId: string, enrollments: any[]): Promise<{
    hasViolations: boolean;
    violationCount: number;
  }> {
    // This would need more complex logic to check prerequisites
    // For now, return a basic implementation
    return { hasViolations: false, violationCount: 0 };
  }

  /**
   * Log validation attempt for audit purposes
   */
  private async logValidationAttempt(
    userId: string,
    classId: string,
    riskScore: number,
    flags: string[]
  ): Promise<void> {
    try {
      await this.supabase
        .from('fraud_detection_log')
        .insert({
          user_id: userId,
          class_id: classId,
          risk_score: riskScore,
          flags: flags,
          detected_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error logging validation attempt:', error);
    }
  }

  /**
   * Report suspicious activity
   */
  async reportSuspiciousActivity(activity: Omit<SuspiciousActivity, 'id' | 'detectedAt'>): Promise<void> {
    try {
      await this.supabase
        .from('suspicious_activities')
        .insert({
          user_id: activity.userId,
          activity_type: activity.activityType,
          description: activity.description,
          risk_level: activity.riskLevel,
          detected_at: new Date().toISOString(),
          metadata: activity.metadata
        });
    } catch (error) {
      console.error('Error reporting suspicious activity:', error);
    }
  }

  /**
   * Get suspicious activities for a user
   */
  async getSuspiciousActivities(userId: string): Promise<SuspiciousActivity[]> {
    try {
      const { data, error } = await this.supabase
        .from('suspicious_activities')
        .select('*')
        .eq('user_id', userId)
        .order('detected_at', { ascending: false });

      if (error) throw error;

      return data?.map(activity => ({
        id: activity.id,
        userId: activity.user_id,
        activityType: activity.activity_type,
        description: activity.description,
        riskLevel: activity.risk_level,
        detectedAt: new Date(activity.detected_at),
        metadata: activity.metadata || {}
      })) || [];
    } catch (error) {
      console.error('Error getting suspicious activities:', error);
      return [];
    }
  }
}