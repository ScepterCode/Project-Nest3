import { createClient } from '@/lib/supabase/server';

export interface EnrollmentPattern {
  userId: string;
  patternType: 'temporal' | 'behavioral' | 'academic' | 'geographic';
  description: string;
  riskScore: number;
  confidence: number;
  detectedAt: Date;
  metadata: Record<string, any>;
}

export interface PatternAnalysisResult {
  patterns: EnrollmentPattern[];
  overallRiskScore: number;
  recommendations: string[];
  requiresReview: boolean;
}

export interface EnrollmentBehavior {
  userId: string;
  enrollmentFrequency: number;
  averageTimeToEnroll: number;
  preferredTimeSlots: string[];
  departmentDistribution: Record<string, number>;
  dropRate: number;
  waitlistBehavior: {
    joinRate: number;
    acceptanceRate: number;
    averageWaitTime: number;
  };
}

export class EnrollmentPatternAnalysisService {
  private supabase = createClient();

  /**
   * Analyze enrollment patterns for a user
   */
  async analyzeUserPatterns(userId: string): Promise<PatternAnalysisResult> {
    try {
      const patterns: EnrollmentPattern[] = [];
      let overallRiskScore = 0;
      const recommendations: string[] = [];

      // Get user's enrollment history
      const enrollmentHistory = await this.getUserEnrollmentHistory(userId);
      const behavior = await this.calculateEnrollmentBehavior(userId, enrollmentHistory);

      // Analyze temporal patterns
      const temporalPatterns = await this.analyzeTemporalPatterns(userId, enrollmentHistory);
      patterns.push(...temporalPatterns);

      // Analyze behavioral patterns
      const behavioralPatterns = await this.analyzeBehavioralPatterns(userId, behavior);
      patterns.push(...behavioralPatterns);

      // Analyze academic patterns
      const academicPatterns = await this.analyzeAcademicPatterns(userId, enrollmentHistory);
      patterns.push(...academicPatterns);

      // Analyze geographic patterns
      const geographicPatterns = await this.analyzeGeographicPatterns(userId);
      patterns.push(...geographicPatterns);

      // Calculate overall risk score
      overallRiskScore = this.calculateOverallRiskScore(patterns);

      // Generate recommendations
      recommendations.push(...this.generateRecommendations(patterns, overallRiskScore));

      return {
        patterns,
        overallRiskScore,
        recommendations,
        requiresReview: overallRiskScore > 60
      };
    } catch (error) {
      console.error('Error analyzing user patterns:', error);
      return {
        patterns: [],
        overallRiskScore: 0,
        recommendations: ['Pattern analysis failed - manual review recommended'],
        requiresReview: true
      };
    }
  }

  /**
   * Get user's enrollment history
   */
  private async getUserEnrollmentHistory(userId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('enrollments')
      .select(`
        *,
        classes:class_id (
          id,
          name,
          department_id,
          schedule,
          capacity
        )
      `)
      .eq('student_id', userId)
      .order('enrolled_at', { ascending: false });

    if (error) {
      console.error('Error getting enrollment history:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Calculate enrollment behavior metrics
   */
  private async calculateEnrollmentBehavior(
    userId: string,
    enrollmentHistory: any[]
  ): Promise<EnrollmentBehavior> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Calculate enrollment frequency (enrollments per month)
    const recentEnrollments = enrollmentHistory.filter(
      e => new Date(e.enrolled_at) > thirtyDaysAgo
    );
    const enrollmentFrequency = recentEnrollments.length;

    // Calculate average time to enroll (from class creation to enrollment)
    const enrollmentTimes = enrollmentHistory
      .filter(e => e.classes?.created_at)
      .map(e => {
        const classCreated = new Date(e.classes.created_at);
        const enrolled = new Date(e.enrolled_at);
        return enrolled.getTime() - classCreated.getTime();
      });
    
    const averageTimeToEnroll = enrollmentTimes.length > 0 
      ? enrollmentTimes.reduce((sum, time) => sum + time, 0) / enrollmentTimes.length
      : 0;

    // Analyze preferred time slots
    const timeSlots = enrollmentHistory
      .filter(e => e.classes?.schedule)
      .map(e => this.extractTimeSlot(e.classes.schedule));
    
    const timeSlotCounts = timeSlots.reduce((acc, slot) => {
      acc[slot] = (acc[slot] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const preferredTimeSlots = Object.entries(timeSlotCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([slot]) => slot);

    // Calculate department distribution
    const departments = enrollmentHistory
      .filter(e => e.classes?.department_id)
      .map(e => e.classes.department_id);
    
    const departmentCounts = departments.reduce((acc, dept) => {
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate drop rate
    const droppedEnrollments = enrollmentHistory.filter(
      e => e.status === 'dropped' || e.status === 'withdrawn'
    );
    const dropRate = enrollmentHistory.length > 0 
      ? droppedEnrollments.length / enrollmentHistory.length 
      : 0;

    // Get waitlist behavior
    const waitlistBehavior = await this.calculateWaitlistBehavior(userId);

    return {
      userId,
      enrollmentFrequency,
      averageTimeToEnroll,
      preferredTimeSlots,
      departmentDistribution: departmentCounts,
      dropRate,
      waitlistBehavior
    };
  }

  /**
   * Analyze temporal enrollment patterns
   */
  private async analyzeTemporalPatterns(
    userId: string,
    enrollmentHistory: any[]
  ): Promise<EnrollmentPattern[]> {
    const patterns: EnrollmentPattern[] = [];

    // Check for unusual enrollment timing
    const enrollmentTimes = enrollmentHistory.map(e => new Date(e.enrolled_at));
    
    // Check for bulk enrollments in short time periods
    const timeWindows = this.groupByTimeWindows(enrollmentTimes, 60 * 60 * 1000); // 1 hour windows
    const bulkEnrollments = timeWindows.filter(window => window.length > 5);

    if (bulkEnrollments.length > 0) {
      patterns.push({
        userId,
        patternType: 'temporal',
        description: 'Multiple enrollments in short time periods detected',
        riskScore: Math.min(bulkEnrollments.length * 15, 50),
        confidence: 0.8,
        detectedAt: new Date(),
        metadata: {
          bulkEnrollmentWindows: bulkEnrollments.length,
          maxEnrollmentsInWindow: Math.max(...bulkEnrollments.map(w => w.length))
        }
      });
    }

    // Check for off-hours enrollment activity
    const offHoursEnrollments = enrollmentTimes.filter(time => {
      const hour = time.getHours();
      return hour < 6 || hour > 22; // Before 6 AM or after 10 PM
    });

    if (offHoursEnrollments.length > enrollmentHistory.length * 0.3) {
      patterns.push({
        userId,
        patternType: 'temporal',
        description: 'High percentage of off-hours enrollment activity',
        riskScore: 25,
        confidence: 0.7,
        detectedAt: new Date(),
        metadata: {
          offHoursPercentage: offHoursEnrollments.length / enrollmentHistory.length,
          offHoursCount: offHoursEnrollments.length
        }
      });
    }

    return patterns;
  }

  /**
   * Analyze behavioral enrollment patterns
   */
  private async analyzeBehavioralPatterns(
    userId: string,
    behavior: EnrollmentBehavior
  ): Promise<EnrollmentPattern[]> {
    const patterns: EnrollmentPattern[] = [];

    // Check for excessive enrollment frequency
    if (behavior.enrollmentFrequency > 20) {
      patterns.push({
        userId,
        patternType: 'behavioral',
        description: 'Unusually high enrollment frequency detected',
        riskScore: Math.min(behavior.enrollmentFrequency * 2, 60),
        confidence: 0.9,
        detectedAt: new Date(),
        metadata: {
          enrollmentFrequency: behavior.enrollmentFrequency,
          threshold: 20
        }
      });
    }

    // Check for unusually fast enrollment behavior
    if (behavior.averageTimeToEnroll < 60 * 1000) { // Less than 1 minute
      patterns.push({
        userId,
        patternType: 'behavioral',
        description: 'Extremely fast enrollment behavior detected',
        riskScore: 40,
        confidence: 0.8,
        detectedAt: new Date(),
        metadata: {
          averageTimeToEnroll: behavior.averageTimeToEnroll,
          averageTimeInMinutes: behavior.averageTimeToEnroll / (60 * 1000)
        }
      });
    }

    // Check for high drop rate
    if (behavior.dropRate > 0.5) {
      patterns.push({
        userId,
        patternType: 'behavioral',
        description: 'High enrollment drop rate detected',
        riskScore: Math.min(behavior.dropRate * 50, 40),
        confidence: 0.7,
        detectedAt: new Date(),
        metadata: {
          dropRate: behavior.dropRate,
          threshold: 0.5
        }
      });
    }

    // Check waitlist gaming behavior
    if (behavior.waitlistBehavior.joinRate > 0.8 && behavior.waitlistBehavior.acceptanceRate < 0.3) {
      patterns.push({
        userId,
        patternType: 'behavioral',
        description: 'Potential waitlist gaming behavior detected',
        riskScore: 35,
        confidence: 0.6,
        detectedAt: new Date(),
        metadata: {
          waitlistJoinRate: behavior.waitlistBehavior.joinRate,
          waitlistAcceptanceRate: behavior.waitlistBehavior.acceptanceRate
        }
      });
    }

    return patterns;
  }

  /**
   * Analyze academic enrollment patterns
   */
  private async analyzeAcademicPatterns(
    userId: string,
    enrollmentHistory: any[]
  ): Promise<EnrollmentPattern[]> {
    const patterns: EnrollmentPattern[] = [];

    // Check for enrollment in conflicting prerequisites
    const prerequisiteConflicts = await this.checkPrerequisiteConflicts(enrollmentHistory);
    if (prerequisiteConflicts.length > 0) {
      patterns.push({
        userId,
        patternType: 'academic',
        description: 'Enrollment in classes with conflicting prerequisites',
        riskScore: prerequisiteConflicts.length * 20,
        confidence: 0.9,
        detectedAt: new Date(),
        metadata: {
          conflicts: prerequisiteConflicts,
          conflictCount: prerequisiteConflicts.length
        }
      });
    }

    // Check for enrollment in too many high-level courses without prerequisites
    const advancedEnrollments = enrollmentHistory.filter(e => 
      e.classes?.name && /[4-9]\d\d/.test(e.classes.name) // 400+ level courses
    );

    if (advancedEnrollments.length > 5) {
      const hasPrerequisites = await this.checkAdvancedCoursePrerequisites(userId, advancedEnrollments);
      if (!hasPrerequisites) {
        patterns.push({
          userId,
          patternType: 'academic',
          description: 'Enrollment in advanced courses without apparent prerequisites',
          riskScore: 45,
          confidence: 0.7,
          detectedAt: new Date(),
          metadata: {
            advancedCourseCount: advancedEnrollments.length,
            courses: advancedEnrollments.map(e => e.classes?.name)
          }
        });
      }
    }

    return patterns;
  }

  /**
   * Analyze geographic enrollment patterns
   */
  private async analyzeGeographicPatterns(userId: string): Promise<EnrollmentPattern[]> {
    const patterns: EnrollmentPattern[] = [];

    // Get enrollment attempts with IP addresses
    const { data: attempts, error } = await this.supabase
      .from('enrollment_attempts')
      .select('ip_address, created_at')
      .eq('user_id', userId)
      .not('ip_address', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !attempts) {
      return patterns;
    }

    // Check for multiple geographic locations
    const uniqueIPs = new Set(attempts.map(a => a.ip_address));
    if (uniqueIPs.size > 5) {
      patterns.push({
        userId,
        patternType: 'geographic',
        description: 'Enrollment attempts from multiple IP addresses',
        riskScore: Math.min(uniqueIPs.size * 5, 30),
        confidence: 0.6,
        detectedAt: new Date(),
        metadata: {
          uniqueIPCount: uniqueIPs.size,
          recentAttempts: attempts.length
        }
      });
    }

    // Check for rapid geographic changes
    const rapidChanges = this.detectRapidIPChanges(attempts);
    if (rapidChanges > 0) {
      patterns.push({
        userId,
        patternType: 'geographic',
        description: 'Rapid changes in enrollment location detected',
        riskScore: rapidChanges * 10,
        confidence: 0.7,
        detectedAt: new Date(),
        metadata: {
          rapidChangeCount: rapidChanges
        }
      });
    }

    return patterns;
  }

  /**
   * Calculate waitlist behavior metrics
   */
  private async calculateWaitlistBehavior(userId: string): Promise<{
    joinRate: number;
    acceptanceRate: number;
    averageWaitTime: number;
  }> {
    const { data: waitlistEntries, error } = await this.supabase
      .from('waitlist_entries')
      .select('*')
      .eq('student_id', userId);

    if (error || !waitlistEntries) {
      return { joinRate: 0, acceptanceRate: 0, averageWaitTime: 0 };
    }

    const { data: enrollments, error: enrollError } = await this.supabase
      .from('enrollments')
      .select('*')
      .eq('student_id', userId);

    if (enrollError || !enrollments) {
      return { joinRate: 0, acceptanceRate: 0, averageWaitTime: 0 };
    }

    const joinRate = waitlistEntries.length / Math.max(enrollments.length, 1);
    
    // Calculate acceptance rate (waitlist entries that led to enrollment)
    const acceptedFromWaitlist = waitlistEntries.filter(entry =>
      enrollments.some(enrollment => 
        enrollment.class_id === entry.class_id &&
        new Date(enrollment.enrolled_at) > new Date(entry.added_at)
      )
    );
    
    const acceptanceRate = waitlistEntries.length > 0 
      ? acceptedFromWaitlist.length / waitlistEntries.length 
      : 0;

    // Calculate average wait time
    const waitTimes = acceptedFromWaitlist.map(entry => {
      const enrollment = enrollments.find(e => e.class_id === entry.class_id);
      if (enrollment) {
        return new Date(enrollment.enrolled_at).getTime() - new Date(entry.added_at).getTime();
      }
      return 0;
    });

    const averageWaitTime = waitTimes.length > 0 
      ? waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length 
      : 0;

    return { joinRate, acceptanceRate, averageWaitTime };
  }

  /**
   * Helper methods
   */
  private extractTimeSlot(schedule: string): string {
    // Extract time slot from schedule string (simplified)
    const timeMatch = schedule.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1]);
      const period = timeMatch[3].toUpperCase();
      const hour24 = period === 'PM' && hour !== 12 ? hour + 12 : hour;
      
      if (hour24 < 10) return 'morning';
      if (hour24 < 14) return 'midday';
      if (hour24 < 18) return 'afternoon';
      return 'evening';
    }
    return 'unknown';
  }

  private groupByTimeWindows(times: Date[], windowMs: number): Date[][] {
    const windows: Date[][] = [];
    const sortedTimes = times.sort((a, b) => a.getTime() - b.getTime());

    let currentWindow: Date[] = [];
    let windowStart = 0;

    for (const time of sortedTimes) {
      if (currentWindow.length === 0) {
        currentWindow = [time];
        windowStart = time.getTime();
      } else if (time.getTime() - windowStart <= windowMs) {
        currentWindow.push(time);
      } else {
        if (currentWindow.length > 1) {
          windows.push(currentWindow);
        }
        currentWindow = [time];
        windowStart = time.getTime();
      }
    }

    if (currentWindow.length > 1) {
      windows.push(currentWindow);
    }

    return windows;
  }

  private async checkPrerequisiteConflicts(enrollmentHistory: any[]): Promise<string[]> {
    // Simplified implementation - would need more complex logic
    return [];
  }

  private async checkAdvancedCoursePrerequisites(userId: string, advancedEnrollments: any[]): Promise<boolean> {
    // Simplified implementation - would check if user has completed prerequisite courses
    return true;
  }

  private detectRapidIPChanges(attempts: any[]): number {
    let changes = 0;
    for (let i = 1; i < attempts.length; i++) {
      const timeDiff = new Date(attempts[i-1].created_at).getTime() - new Date(attempts[i].created_at).getTime();
      if (timeDiff < 60 * 60 * 1000 && attempts[i-1].ip_address !== attempts[i].ip_address) { // 1 hour
        changes++;
      }
    }
    return changes;
  }

  private calculateOverallRiskScore(patterns: EnrollmentPattern[]): number {
    if (patterns.length === 0) return 0;
    
    const weightedScore = patterns.reduce((sum, pattern) => 
      sum + (pattern.riskScore * pattern.confidence), 0
    );
    
    const totalWeight = patterns.reduce((sum, pattern) => sum + pattern.confidence, 0);
    
    return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
  }

  private generateRecommendations(patterns: EnrollmentPattern[], overallRiskScore: number): string[] {
    const recommendations: string[] = [];

    if (overallRiskScore > 80) {
      recommendations.push('Immediate manual review required - high fraud risk');
      recommendations.push('Consider temporarily suspending enrollment privileges');
    } else if (overallRiskScore > 60) {
      recommendations.push('Manual review recommended');
      recommendations.push('Implement additional verification steps');
    } else if (overallRiskScore > 40) {
      recommendations.push('Monitor enrollment activity closely');
      recommendations.push('Consider rate limiting enrollment attempts');
    }

    // Pattern-specific recommendations
    const temporalPatterns = patterns.filter(p => p.patternType === 'temporal');
    if (temporalPatterns.length > 0) {
      recommendations.push('Implement enrollment attempt rate limiting');
    }

    const behavioralPatterns = patterns.filter(p => p.patternType === 'behavioral');
    if (behavioralPatterns.length > 0) {
      recommendations.push('Review enrollment behavior patterns');
    }

    const academicPatterns = patterns.filter(p => p.patternType === 'academic');
    if (academicPatterns.length > 0) {
      recommendations.push('Verify academic prerequisites and qualifications');
    }

    const geographicPatterns = patterns.filter(p => p.patternType === 'geographic');
    if (geographicPatterns.length > 0) {
      recommendations.push('Verify user identity and location');
    }

    return recommendations;
  }
}