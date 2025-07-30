import { createClient } from '@/lib/supabase/server';

export interface BalancingOperation {
  id: string;
  type: 'redistribute' | 'swap' | 'move';
  fromSectionId: string;
  toSectionId: string;
  studentIds: string[];
  reason: string;
  estimatedImpact: string;
  status: 'pending' | 'approved' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export interface SectionBalance {
  sectionId: string;
  sectionName: string;
  currentEnrollment: number;
  capacity: number;
  utilizationRate: number;
  targetEnrollment: number;
  balanceScore: number; // 0-100, higher is better balanced
}

export interface BalancingPlan {
  operations: BalancingOperation[];
  expectedOutcome: {
    beforeBalance: SectionBalance[];
    afterBalance: SectionBalance[];
    improvementScore: number;
  };
  feasibilityScore: number;
  estimatedTimeToComplete: number; // in minutes
}

export class EnrollmentBalancingService {
  private supabase = createClient();

  async generateBalancingPlan(
    sectionIds: string[],
    targetUtilization: number = 85
  ): Promise<BalancingPlan> {
    // Get current section data
    const currentBalance = await this.getSectionBalances(sectionIds);
    
    // Calculate optimal distribution
    const targetBalance = this.calculateOptimalDistribution(currentBalance, targetUtilization);
    
    // Generate balancing operations
    const operations = await this.generateBalancingOperations(currentBalance, targetBalance);
    
    // Calculate feasibility and impact
    const feasibilityScore = this.calculateFeasibilityScore(operations);
    const improvementScore = this.calculateImprovementScore(currentBalance, targetBalance);
    
    return {
      operations,
      expectedOutcome: {
        beforeBalance: currentBalance,
        afterBalance: targetBalance,
        improvementScore
      },
      feasibilityScore,
      estimatedTimeToComplete: operations.length * 5 // 5 minutes per operation
    };
  }

  private async getSectionBalances(sectionIds: string[]): Promise<SectionBalance[]> {
    const { data: sections, error } = await this.supabase
      .from('classes')
      .select(`
        id,
        name,
        capacity,
        current_enrollment
      `)
      .in('id', sectionIds);

    if (error) {
      throw new Error(`Failed to fetch section data: ${error.message}`);
    }

    return sections?.map(section => ({
      sectionId: section.id,
      sectionName: section.name,
      currentEnrollment: section.current_enrollment || 0,
      capacity: section.capacity || 0,
      utilizationRate: section.capacity ? (section.current_enrollment / section.capacity) * 100 : 0,
      targetEnrollment: section.current_enrollment || 0,
      balanceScore: this.calculateBalanceScore(section.current_enrollment || 0, section.capacity || 0)
    })) || [];
  }

  private calculateBalanceScore(enrollment: number, capacity: number): number {
    if (capacity === 0) return 0;
    
    const utilization = (enrollment / capacity) * 100;
    const idealUtilization = 85;
    
    // Score is highest when utilization is close to ideal
    const deviation = Math.abs(utilization - idealUtilization);
    return Math.max(0, 100 - deviation * 2);
  }

  private calculateOptimalDistribution(
    currentBalance: SectionBalance[],
    targetUtilization: number
  ): SectionBalance[] {
    const totalEnrollment = currentBalance.reduce((sum, section) => sum + section.currentEnrollment, 0);
    const totalCapacity = currentBalance.reduce((sum, section) => sum + section.capacity, 0);
    
    // If total enrollment exceeds target utilization, maintain current distribution
    if (totalEnrollment > totalCapacity * (targetUtilization / 100)) {
      return currentBalance.map(section => ({
        ...section,
        targetEnrollment: section.currentEnrollment,
        balanceScore: this.calculateBalanceScore(section.currentEnrollment, section.capacity)
      }));
    }

    // Calculate optimal distribution
    return currentBalance.map(section => {
      const optimalEnrollment = Math.round(section.capacity * (targetUtilization / 100));
      const targetEnrollment = Math.min(optimalEnrollment, section.capacity);
      
      return {
        ...section,
        targetEnrollment,
        balanceScore: this.calculateBalanceScore(targetEnrollment, section.capacity)
      };
    });
  }

  private async generateBalancingOperations(
    currentBalance: SectionBalance[],
    targetBalance: SectionBalance[]
  ): Promise<BalancingOperation[]> {
    const operations: BalancingOperation[] = [];
    
    // Find sections that need students moved out (over-enrolled)
    const overEnrolledSections = currentBalance.filter((section, index) => 
      section.currentEnrollment > targetBalance[index].targetEnrollment
    );
    
    // Find sections that can accept students (under-enrolled)
    const underEnrolledSections = currentBalance.filter((section, index) => 
      section.currentEnrollment < targetBalance[index].targetEnrollment
    );

    for (const overSection of overEnrolledSections) {
      const targetSection = targetBalance.find(t => t.sectionId === overSection.sectionId);
      if (!targetSection) continue;

      const studentsToMove = overSection.currentEnrollment - targetSection.targetEnrollment;
      
      for (const underSection of underEnrolledSections) {
        const targetUnderSection = targetBalance.find(t => t.sectionId === underSection.sectionId);
        if (!targetUnderSection) continue;

        const canAccept = targetUnderSection.targetEnrollment - underSection.currentEnrollment;
        const toMove = Math.min(studentsToMove, canAccept);

        if (toMove > 0) {
          // Get eligible students for transfer
          const eligibleStudents = await this.getEligibleStudentsForTransfer(
            overSection.sectionId,
            underSection.sectionId,
            toMove
          );

          if (eligibleStudents.length > 0) {
            operations.push({
              id: `balance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'redistribute',
              fromSectionId: overSection.sectionId,
              toSectionId: underSection.sectionId,
              studentIds: eligibleStudents.slice(0, toMove),
              reason: `Balance enrollment: move ${toMove} students from over-enrolled to under-enrolled section`,
              estimatedImpact: `Improve utilization balance by ${this.calculateOperationImpact(overSection, underSection, toMove)}%`,
              status: 'pending',
              createdAt: new Date()
            });

            // Update tracking for next iterations
            underSection.currentEnrollment += toMove;
          }
        }
      }
    }

    return operations;
  }

  private async getEligibleStudentsForTransfer(
    fromSectionId: string,
    toSectionId: string,
    count: number
  ): Promise<string[]> {
    // Get students from the source section
    const { data: enrollments, error } = await this.supabase
      .from('enrollments')
      .select(`
        student_id,
        enrolled_at,
        users!enrollments_student_id_fkey(
          id,
          full_name
        )
      `)
      .eq('class_id', fromSectionId)
      .eq('status', 'enrolled')
      .order('enrolled_at', { ascending: false }) // Most recent enrollments first
      .limit(count * 2); // Get more than needed to allow for filtering

    if (error) {
      console.error('Failed to fetch eligible students:', error);
      return [];
    }

    // Check schedule conflicts for target section
    const eligibleStudents: string[] = [];
    
    for (const enrollment of enrollments || []) {
      if (eligibleStudents.length >= count) break;
      
      const hasConflict = await this.checkScheduleConflict(enrollment.student_id, toSectionId);
      if (!hasConflict) {
        eligibleStudents.push(enrollment.student_id);
      }
    }

    return eligibleStudents;
  }

  private async checkScheduleConflict(studentId: string, sectionId: string): Promise<boolean> {
    // Get the target section's schedule
    const { data: targetSection, error: sectionError } = await this.supabase
      .from('classes')
      .select('schedule')
      .eq('id', sectionId)
      .single();

    if (sectionError || !targetSection?.schedule) return false;

    // Get student's current enrollments and their schedules
    const { data: studentEnrollments, error: enrollmentError } = await this.supabase
      .from('enrollments')
      .select(`
        classes!enrollments_class_id_fkey(
          schedule
        )
      `)
      .eq('student_id', studentId)
      .eq('status', 'enrolled');

    if (enrollmentError) return true; // Assume conflict if we can't check

    // Simple schedule conflict check (would need more sophisticated logic in practice)
    const targetSchedule = targetSection.schedule.toLowerCase();
    
    for (const enrollment of studentEnrollments || []) {
      const existingSchedule = enrollment.classes?.schedule?.toLowerCase() || '';
      
      // Basic overlap detection - in practice, this would parse actual time slots
      if (this.schedulesOverlap(targetSchedule, existingSchedule)) {
        return true;
      }
    }

    return false;
  }

  private schedulesOverlap(schedule1: string, schedule2: string): boolean {
    // Simplified schedule overlap check
    // In practice, this would parse time slots and check for actual overlaps
    const days1 = this.extractDays(schedule1);
    const days2 = this.extractDays(schedule2);
    
    return days1.some(day => days2.includes(day));
  }

  private extractDays(schedule: string): string[] {
    const dayPattern = /\b(mon|tue|wed|thu|fri|sat|sun)/gi;
    const matches = schedule.match(dayPattern);
    return matches ? matches.map(day => day.toLowerCase()) : [];
  }

  private calculateOperationImpact(
    fromSection: SectionBalance,
    toSection: SectionBalance,
    studentCount: number
  ): number {
    const currentVariance = Math.abs(fromSection.utilizationRate - toSection.utilizationRate);
    
    const newFromUtilization = ((fromSection.currentEnrollment - studentCount) / fromSection.capacity) * 100;
    const newToUtilization = ((toSection.currentEnrollment + studentCount) / toSection.capacity) * 100;
    const newVariance = Math.abs(newFromUtilization - newToUtilization);
    
    return Math.max(0, currentVariance - newVariance);
  }

  private calculateFeasibilityScore(operations: BalancingOperation[]): number {
    if (operations.length === 0) return 100;

    let totalScore = 0;
    
    for (const operation of operations) {
      let operationScore = 70; // Base score
      
      // Fewer students to move = higher feasibility
      if (operation.studentIds.length <= 3) operationScore += 20;
      else if (operation.studentIds.length <= 6) operationScore += 10;
      
      // Redistribute operations are generally more feasible than swaps
      if (operation.type === 'redistribute') operationScore += 10;
      
      totalScore += operationScore;
    }

    return Math.min(100, totalScore / operations.length);
  }

  private calculateImprovementScore(
    currentBalance: SectionBalance[],
    targetBalance: SectionBalance[]
  ): number {
    const currentVariance = this.calculateUtilizationVariance(
      currentBalance.map(s => s.utilizationRate)
    );
    
    const targetVariance = this.calculateUtilizationVariance(
      targetBalance.map(s => (s.targetEnrollment / s.capacity) * 100)
    );

    const improvement = Math.max(0, currentVariance - targetVariance);
    return Math.min(100, (improvement / currentVariance) * 100);
  }

  private calculateUtilizationVariance(utilizationRates: number[]): number {
    const mean = utilizationRates.reduce((sum, rate) => sum + rate, 0) / utilizationRates.length;
    const variance = utilizationRates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / utilizationRates.length;
    return Math.sqrt(variance);
  }

  async executeBalancingOperation(operationId: string): Promise<boolean> {
    try {
      // This would implement the actual student transfer logic
      // For now, we'll simulate the operation
      
      // Update operation status
      const { error } = await this.supabase
        .from('enrollment_balancing_operations')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', operationId);

      return !error;
    } catch (error) {
      console.error('Failed to execute balancing operation:', error);
      return false;
    }
  }

  async getBalancingHistory(departmentId: string): Promise<BalancingOperation[]> {
    const { data: operations, error } = await this.supabase
      .from('enrollment_balancing_operations')
      .select(`
        *,
        from_section:classes!enrollment_balancing_operations_from_section_id_fkey(name),
        to_section:classes!enrollment_balancing_operations_to_section_id_fkey(name)
      `)
      .eq('department_id', departmentId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(`Failed to fetch balancing history: ${error.message}`);
    }

    return operations?.map(op => ({
      id: op.id,
      type: op.type,
      fromSectionId: op.from_section_id,
      toSectionId: op.to_section_id,
      studentIds: op.student_ids || [],
      reason: op.reason,
      estimatedImpact: op.estimated_impact,
      status: op.status,
      createdAt: new Date(op.created_at),
      completedAt: op.completed_at ? new Date(op.completed_at) : undefined
    })) || [];
  }
}