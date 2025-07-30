import { createClient } from '@/lib/supabase/server';

export interface SectionEnrollmentData {
  sectionId: string;
  sectionName: string;
  instructor: string;
  capacity: number;
  currentEnrollment: number;
  waitlistCount: number;
  enrollmentRate: number;
  schedule: string;
  room?: string;
}

export interface EnrollmentBalancingRecommendation {
  type: 'redistribute' | 'add_section' | 'increase_capacity' | 'merge_sections';
  description: string;
  affectedSections: string[];
  expectedImpact: string;
  priority: 'high' | 'medium' | 'low';
}

export interface PrerequisiteCoordination {
  courseId: string;
  courseName: string;
  prerequisites: string[];
  dependentCourses: string[];
  enrollmentImpact: number;
  recommendations: string[];
}

export interface CapacityManagementSuggestion {
  type: 'increase_capacity' | 'add_section' | 'redistribute_students' | 'adjust_schedule';
  courseId: string;
  courseName: string;
  currentDemand: number;
  projectedDemand: number;
  suggestion: string;
  estimatedCost?: number;
  feasibilityScore: number;
}

export interface PrerequisiteChainAnalysis {
  chainId: string;
  courses: PrerequisiteCoordination[];
  totalLength: number;
  bottlenecks: PrerequisiteBottleneck[];
  recommendations: string[];
}

export interface PrerequisiteBottleneck {
  courseId: string;
  courseName: string;
  type: 'low_enrollment' | 'prerequisite_gap' | 'scheduling_conflict';
  severity: 'high' | 'medium' | 'low';
  description: string;
  affectedCourses: string[];
}

export interface PrerequisiteValidationResult {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  missingPrerequisite: string;
  severity: 'high' | 'medium' | 'low';
  recommendedAction: string;
}

export class DepartmentEnrollmentCoordinator {
  private supabase = createClient();

  async getDepartmentSections(departmentId: string, termId?: string): Promise<SectionEnrollmentData[]> {
    const query = this.supabase
      .from('classes')
      .select(`
        id,
        name,
        capacity,
        current_enrollment,
        schedule,
        room,
        users!classes_instructor_id_fkey(full_name),
        enrollments(count),
        waitlist_entries(count)
      `)
      .eq('department_id', departmentId);

    if (termId) {
      query.eq('term_id', termId);
    }

    const { data: sections, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch department sections: ${error.message}`);
    }

    return sections?.map(section => ({
      sectionId: section.id,
      sectionName: section.name,
      instructor: section.users?.full_name || 'TBD',
      capacity: section.capacity || 0,
      currentEnrollment: section.current_enrollment || 0,
      waitlistCount: section.waitlist_entries?.[0]?.count || 0,
      enrollmentRate: section.capacity ? (section.current_enrollment / section.capacity) * 100 : 0,
      schedule: section.schedule || '',
      room: section.room
    })) || [];
  }

  async getEnrollmentBalancingRecommendations(
    departmentId: string, 
    courseCode?: string
  ): Promise<EnrollmentBalancingRecommendation[]> {
    const sections = await this.getDepartmentSections(departmentId);
    const recommendations: EnrollmentBalancingRecommendation[] = [];

    // Group sections by course code if available
    const sectionGroups = this.groupSectionsByCourse(sections, courseCode);

    for (const [course, courseSections] of Object.entries(sectionGroups)) {
      const analysis = this.analyzeEnrollmentBalance(courseSections);
      recommendations.push(...analysis);
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  private groupSectionsByCourse(
    sections: SectionEnrollmentData[], 
    courseCode?: string
  ): Record<string, SectionEnrollmentData[]> {
    const groups: Record<string, SectionEnrollmentData[]> = {};

    sections.forEach(section => {
      // Extract course code from section name (assuming format like "CS101-01", "CS101-02")
      const courseMatch = section.sectionName.match(/^([A-Z]+\d+)/);
      const course = courseMatch ? courseMatch[1] : section.sectionName;

      if (!courseCode || course === courseCode) {
        if (!groups[course]) {
          groups[course] = [];
        }
        groups[course].push(section);
      }
    });

    return groups;
  }

  private analyzeEnrollmentBalance(sections: SectionEnrollmentData[]): EnrollmentBalancingRecommendation[] {
    const recommendations: EnrollmentBalancingRecommendation[] = [];

    if (sections.length < 2) return recommendations;

    const totalCapacity = sections.reduce((sum, s) => sum + s.capacity, 0);
    const totalEnrollment = sections.reduce((sum, s) => sum + s.currentEnrollment, 0);
    const totalWaitlist = sections.reduce((sum, s) => sum + s.waitlistCount, 0);
    const averageEnrollmentRate = totalEnrollment / totalCapacity * 100;

    // Check for severely imbalanced sections
    const imbalancedSections = sections.filter(s => 
      Math.abs(s.enrollmentRate - averageEnrollmentRate) > 20
    );

    if (imbalancedSections.length > 0) {
      const overenrolledSections = imbalancedSections.filter(s => s.enrollmentRate > averageEnrollmentRate);
      const underenrolledSections = imbalancedSections.filter(s => s.enrollmentRate < averageEnrollmentRate);

      if (overenrolledSections.length > 0 && underenrolledSections.length > 0) {
        recommendations.push({
          type: 'redistribute',
          description: `Redistribute students between sections to balance enrollment`,
          affectedSections: imbalancedSections.map(s => s.sectionId),
          expectedImpact: `Could balance ${imbalancedSections.length} sections`,
          priority: 'high'
        });
      }
    }

    // Check if additional sections are needed
    if (totalWaitlist > totalCapacity * 0.1) {
      recommendations.push({
        type: 'add_section',
        description: `High waitlist demand suggests need for additional section`,
        affectedSections: sections.map(s => s.sectionId),
        expectedImpact: `Could accommodate ${totalWaitlist} waitlisted students`,
        priority: 'high'
      });
    }

    // Check for underutilized sections that could be merged
    const underutilizedSections = sections.filter(s => s.enrollmentRate < 40);
    if (underutilizedSections.length >= 2) {
      recommendations.push({
        type: 'merge_sections',
        description: `Consider merging underutilized sections`,
        affectedSections: underutilizedSections.map(s => s.sectionId),
        expectedImpact: `Could free up instructor resources`,
        priority: 'medium'
      });
    }

    return recommendations;
  }

  async getPrerequisiteCoordination(departmentId: string): Promise<PrerequisiteCoordination[]> {
    const { data: courses, error } = await this.supabase
      .from('classes')
      .select(`
        id,
        name,
        course_code,
        class_prerequisites(
          requirement,
          description
        ),
        current_enrollment
      `)
      .eq('department_id', departmentId);

    if (error) {
      throw new Error(`Failed to fetch prerequisite data: ${error.message}`);
    }

    const coordinationData: PrerequisiteCoordination[] = [];

    for (const course of courses || []) {
      const prerequisites = course.class_prerequisites?.map(p => p.requirement) || [];
      const dependentCourses = await this.findDependentCourses(course.course_code, departmentId);
      
      coordinationData.push({
        courseId: course.id,
        courseName: course.name,
        prerequisites,
        dependentCourses,
        enrollmentImpact: course.current_enrollment || 0,
        recommendations: this.generatePrerequisiteRecommendations(course, prerequisites, dependentCourses)
      });
    }

    return coordinationData;
  }

  async analyzePrerequisiteChains(departmentId: string): Promise<PrerequisiteChainAnalysis[]> {
    const courses = await this.getPrerequisiteCoordination(departmentId);
    const chains: PrerequisiteChainAnalysis[] = [];

    // Build prerequisite chains
    for (const course of courses) {
      const chain = await this.buildPrerequisiteChain(course, courses);
      if (chain.length > 1) {
        chains.push({
          chainId: `chain_${course.courseId}`,
          courses: chain,
          totalLength: chain.length,
          bottlenecks: this.identifyBottlenecks(chain),
          recommendations: this.generateChainRecommendations(chain)
        });
      }
    }

    return chains;
  }

  private async buildPrerequisiteChain(
    startCourse: PrerequisiteCoordination,
    allCourses: PrerequisiteCoordination[],
    visited: Set<string> = new Set()
  ): Promise<PrerequisiteCoordination[]> {
    if (visited.has(startCourse.courseId)) {
      return []; // Avoid circular dependencies
    }

    visited.add(startCourse.courseId);
    const chain = [startCourse];

    // Find prerequisite courses
    for (const prereqCode of startCourse.prerequisites) {
      const prereqCourse = allCourses.find(c => 
        c.courseName.includes(prereqCode) || c.courseId === prereqCode
      );
      
      if (prereqCourse) {
        const subChain = await this.buildPrerequisiteChain(prereqCourse, allCourses, new Set(visited));
        chain.unshift(...subChain);
      }
    }

    return chain;
  }

  private identifyBottlenecks(chain: PrerequisiteCoordination[]): PrerequisiteBottleneck[] {
    const bottlenecks: PrerequisiteBottleneck[] = [];

    for (let i = 0; i < chain.length - 1; i++) {
      const current = chain[i];
      const next = chain[i + 1];

      // Check if current course has low enrollment that might affect next course
      if (current.enrollmentImpact < 20) {
        bottlenecks.push({
          courseId: current.courseId,
          courseName: current.courseName,
          type: 'low_enrollment',
          severity: current.enrollmentImpact < 10 ? 'high' : 'medium',
          description: `Low enrollment (${current.enrollmentImpact}) may limit students for dependent courses`,
          affectedCourses: [next.courseId]
        });
      }

      // Check for prerequisite gaps
      if (current.prerequisites.length === 0 && next.prerequisites.includes(current.courseName)) {
        bottlenecks.push({
          courseId: current.courseId,
          courseName: current.courseName,
          type: 'prerequisite_gap',
          severity: 'medium',
          description: 'Course lacks prerequisites but is required for advanced courses',
          affectedCourses: [next.courseId]
        });
      }
    }

    return bottlenecks;
  }

  private generateChainRecommendations(chain: PrerequisiteCoordination[]): string[] {
    const recommendations: string[] = [];

    // Check chain length
    if (chain.length > 4) {
      recommendations.push('Consider if all prerequisites in this long chain are necessary');
    }

    // Check for enrollment drops along the chain
    const enrollmentDrops = [];
    for (let i = 0; i < chain.length - 1; i++) {
      const current = chain[i];
      const next = chain[i + 1];
      const dropRate = (current.enrollmentImpact - next.enrollmentImpact) / current.enrollmentImpact;
      
      if (dropRate > 0.5) {
        enrollmentDrops.push(`${current.courseName} to ${next.courseName}: ${(dropRate * 100).toFixed(1)}% drop`);
      }
    }

    if (enrollmentDrops.length > 0) {
      recommendations.push(`High enrollment drops detected: ${enrollmentDrops.join(', ')}`);
    }

    // Check for alternative pathways
    const hasAlternatives = chain.some(course => course.dependentCourses.length > 1);
    if (!hasAlternatives && chain.length > 2) {
      recommendations.push('Consider creating alternative prerequisite pathways');
    }

    return recommendations;
  }

  async validatePrerequisiteEnforcement(departmentId: string): Promise<PrerequisiteValidationResult[]> {
    const { data: violations, error } = await this.supabase
      .from('enrollments')
      .select(`
        id,
        student_id,
        class_id,
        classes!enrollments_class_id_fkey(
          name,
          course_code,
          class_prerequisites(
            requirement,
            description,
            strict
          )
        ),
        users!enrollments_student_id_fkey(
          full_name,
          email
        )
      `)
      .eq('classes.department_id', departmentId)
      .eq('status', 'enrolled');

    if (error) {
      throw new Error(`Failed to validate prerequisites: ${error.message}`);
    }

    const validationResults: PrerequisiteValidationResult[] = [];

    for (const enrollment of violations || []) {
      const prerequisites = enrollment.classes?.class_prerequisites || [];
      
      for (const prereq of prerequisites) {
        if (prereq.strict) {
          const hasPrereq = await this.checkStudentPrerequisite(
            enrollment.student_id,
            prereq.requirement
          );

          if (!hasPrereq) {
            validationResults.push({
              enrollmentId: enrollment.id,
              studentId: enrollment.student_id,
              studentName: enrollment.users?.full_name || 'Unknown',
              courseId: enrollment.class_id,
              courseName: enrollment.classes?.name || 'Unknown',
              missingPrerequisite: prereq.requirement,
              severity: 'high',
              recommendedAction: 'Review enrollment or grant prerequisite waiver'
            });
          }
        }
      }
    }

    return validationResults;
  }

  private async checkStudentPrerequisite(studentId: string, prerequisiteCode: string): Promise<boolean> {
    const { data: completedCourses, error } = await this.supabase
      .from('enrollments')
      .select(`
        classes!enrollments_class_id_fkey(
          course_code,
          name
        )
      `)
      .eq('student_id', studentId)
      .in('status', ['completed', 'enrolled'])
      .eq('grade', 'A', 'B', 'C', 'P'); // Passing grades

    if (error) return false;

    return completedCourses?.some(enrollment => 
      enrollment.classes?.course_code === prerequisiteCode ||
      enrollment.classes?.name?.includes(prerequisiteCode)
    ) || false;
  }

  private async findDependentCourses(courseCode: string, departmentId: string): Promise<string[]> {
    const { data: dependents, error } = await this.supabase
      .from('classes')
      .select('course_code')
      .eq('department_id', departmentId)
      .contains('class_prerequisites', [{ requirement: courseCode }]);

    if (error) return [];

    return dependents?.map(d => d.course_code) || [];
  }

  private generatePrerequisiteRecommendations(
    course: any, 
    prerequisites: string[], 
    dependentCourses: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (prerequisites.length === 0 && dependentCourses.length > 0) {
      recommendations.push('Consider adding prerequisites to ensure student readiness');
    }

    if (prerequisites.length > 3) {
      recommendations.push('Review if all prerequisites are necessary - may be blocking enrollment');
    }

    if (course.current_enrollment < 10 && prerequisites.length > 0) {
      recommendations.push('Low enrollment may indicate prerequisite barriers');
    }

    return recommendations;
  }

  async getCapacityManagementSuggestions(departmentId: string): Promise<CapacityManagementSuggestion[]> {
    const sections = await this.getDepartmentSections(departmentId);
    const suggestions: CapacityManagementSuggestion[] = [];

    // Group by course for analysis
    const courseGroups = this.groupSectionsByCourse(sections);

    for (const [courseCode, courseSections] of Object.entries(courseGroups)) {
      const totalCapacity = courseSections.reduce((sum, s) => sum + s.capacity, 0);
      const totalEnrollment = courseSections.reduce((sum, s) => sum + s.currentEnrollment, 0);
      const totalWaitlist = courseSections.reduce((sum, s) => sum + s.waitlistCount, 0);
      const utilizationRate = totalCapacity > 0 ? (totalEnrollment / totalCapacity) * 100 : 0;

      // High demand courses
      if (totalWaitlist > totalCapacity * 0.15) {
        suggestions.push({
          type: 'add_section',
          courseId: courseSections[0].sectionId,
          courseName: courseCode,
          currentDemand: totalEnrollment + totalWaitlist,
          projectedDemand: Math.round((totalEnrollment + totalWaitlist) * 1.1),
          suggestion: `Add additional section to accommodate ${totalWaitlist} waitlisted students`,
          feasibilityScore: this.calculateFeasibilityScore('add_section', courseSections)
        });
      }

      // Overutilized courses
      if (utilizationRate > 95) {
        suggestions.push({
          type: 'increase_capacity',
          courseId: courseSections[0].sectionId,
          courseName: courseCode,
          currentDemand: totalEnrollment,
          projectedDemand: totalEnrollment + totalWaitlist,
          suggestion: `Increase capacity or find larger classroom`,
          feasibilityScore: this.calculateFeasibilityScore('increase_capacity', courseSections)
        });
      }

      // Underutilized courses
      if (utilizationRate < 50 && courseSections.length > 1) {
        suggestions.push({
          type: 'redistribute_students',
          courseId: courseSections[0].sectionId,
          courseName: courseCode,
          currentDemand: totalEnrollment,
          projectedDemand: totalEnrollment,
          suggestion: `Redistribute students to fewer sections`,
          feasibilityScore: this.calculateFeasibilityScore('redistribute_students', courseSections)
        });
      }
    }

    return suggestions.sort((a, b) => b.feasibilityScore - a.feasibilityScore);
  }

  private calculateFeasibilityScore(type: string, sections: SectionEnrollmentData[]): number {
    let score = 50; // Base score

    switch (type) {
      case 'add_section':
        // Higher score if there are available instructors (simplified assumption)
        score += sections.length < 3 ? 30 : 10;
        break;
      case 'increase_capacity':
        // Score based on current utilization
        const avgUtilization = sections.reduce((sum, s) => sum + s.enrollmentRate, 0) / sections.length;
        score += avgUtilization > 90 ? 40 : 20;
        break;
      case 'redistribute_students':
        // Higher score if there's significant imbalance
        const utilizationVariance = this.calculateUtilizationVariance(sections);
        score += utilizationVariance > 20 ? 35 : 15;
        break;
    }

    return Math.min(100, Math.max(0, score));
  }

  private calculateUtilizationVariance(sections: SectionEnrollmentData[]): number {
    const rates = sections.map(s => s.enrollmentRate);
    const avg = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
    const variance = rates.reduce((sum, rate) => sum + Math.pow(rate - avg, 2), 0) / rates.length;
    return Math.sqrt(variance);
  }

  async generateEnrollmentProjections(departmentId: string, termsAhead: number = 2): Promise<any> {
    // Get historical enrollment data
    const { data: historicalData, error } = await this.supabase
      .from('enrollments')
      .select(`
        class_id,
        enrolled_at,
        classes!inner(
          name,
          course_code,
          department_id,
          capacity
        )
      `)
      .eq('classes.department_id', departmentId)
      .gte('enrolled_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString());

    if (error) {
      throw new Error(`Failed to fetch historical data: ${error.message}`);
    }

    // Simple projection based on historical trends
    const projections = this.calculateEnrollmentProjections(historicalData || [], termsAhead);
    
    return projections;
  }

  private calculateEnrollmentProjections(historicalData: any[], termsAhead: number): any {
    // Simplified projection logic - in reality, this would be more sophisticated
    const courseEnrollments: Record<string, number[]> = {};

    historicalData.forEach(enrollment => {
      const courseCode = enrollment.classes.course_code;
      if (!courseEnrollments[courseCode]) {
        courseEnrollments[courseCode] = [];
      }
      courseEnrollments[courseCode].push(1); // Count enrollments
    });

    const projections: Record<string, any> = {};

    Object.entries(courseEnrollments).forEach(([courseCode, enrollments]) => {
      const avgEnrollment = enrollments.length / 4; // Assuming quarterly data
      const trend = this.calculateTrend(enrollments);
      
      projections[courseCode] = {
        currentAverage: Math.round(avgEnrollment),
        projectedEnrollment: Math.round(avgEnrollment * (1 + trend * termsAhead)),
        trend: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
        confidence: this.calculateConfidence(enrollments)
      };
    });

    return projections;
  }

  private calculateTrend(data: number[]): number {
    if (data.length < 2) return 0;
    
    // Simple linear trend calculation
    const n = data.length;
    const sumX = (n * (n + 1)) / 2;
    const sumY = data.reduce((sum, val) => sum + val, 0);
    const sumXY = data.reduce((sum, val, index) => sum + val * (index + 1), 0);
    const sumX2 = (n * (n + 1) * (2 * n + 1)) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope / sumY * n; // Normalize to percentage change
  }

  private calculateConfidence(data: number[]): number {
    // Simple confidence based on data consistency
    if (data.length < 3) return 0.5;
    
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    const coefficient = Math.sqrt(variance) / mean;
    
    return Math.max(0.1, Math.min(0.9, 1 - coefficient));
  }
}