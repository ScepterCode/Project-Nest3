import { createClient } from '@/lib/supabase/server';

export interface SectionPlanningData {
  courseCode: string;
  courseName: string;
  currentSections: number;
  totalCapacity: number;
  totalEnrollment: number;
  totalWaitlist: number;
  utilizationRate: number;
  demandScore: number;
}

export interface SectionPlan {
  courseCode: string;
  courseName: string;
  recommendedSections: number;
  currentSections: number;
  capacityPerSection: number;
  totalRecommendedCapacity: number;
  reasoning: string[];
  priority: 'high' | 'medium' | 'low';
  estimatedCost: number;
  feasibilityFactors: FeasibilityFactor[];
}

export interface FeasibilityFactor {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
  weight: number;
}

export interface ResourceRequirement {
  type: 'instructor' | 'classroom' | 'equipment' | 'budget';
  description: string;
  quantity: number;
  availability: 'available' | 'limited' | 'unavailable';
  alternativeSolutions: string[];
}

export interface SectionOptimizationResult {
  originalPlan: SectionPlan;
  optimizedPlan: SectionPlan;
  improvements: string[];
  tradeoffs: string[];
  implementationSteps: string[];
}

export class SectionPlanningService {
  private supabase = createClient();

  async analyzeDepartmentCapacityNeeds(departmentId: string): Promise<SectionPlanningData[]> {
    const { data: courses, error } = await this.supabase
      .from('classes')
      .select(`
        course_code,
        name,
        capacity,
        current_enrollment,
        waitlist_entries(count),
        enrollments(count)
      `)
      .eq('department_id', departmentId);

    if (error) {
      throw new Error(`Failed to fetch capacity data: ${error.message}`);
    }

    // Group by course code to analyze across sections
    const courseGroups: Record<string, any[]> = {};
    courses?.forEach(course => {
      const code = course.course_code || course.name;
      if (!courseGroups[code]) {
        courseGroups[code] = [];
      }
      courseGroups[code].push(course);
    });

    const planningData: SectionPlanningData[] = [];

    Object.entries(courseGroups).forEach(([courseCode, sections]) => {
      const totalCapacity = sections.reduce((sum, s) => sum + (s.capacity || 0), 0);
      const totalEnrollment = sections.reduce((sum, s) => sum + (s.current_enrollment || 0), 0);
      const totalWaitlist = sections.reduce((sum, s) => sum + (s.waitlist_entries?.[0]?.count || 0), 0);
      const utilizationRate = totalCapacity > 0 ? (totalEnrollment / totalCapacity) * 100 : 0;
      const demandScore = this.calculateDemandScore(totalEnrollment, totalWaitlist, totalCapacity);

      planningData.push({
        courseCode,
        courseName: sections[0].name,
        currentSections: sections.length,
        totalCapacity,
        totalEnrollment,
        totalWaitlist,
        utilizationRate,
        demandScore
      });
    });

    return planningData.sort((a, b) => b.demandScore - a.demandScore);
  }

  private calculateDemandScore(enrollment: number, waitlist: number, capacity: number): number {
    const totalDemand = enrollment + waitlist;
    const utilizationFactor = capacity > 0 ? (enrollment / capacity) : 1;
    const waitlistFactor = waitlist > 0 ? Math.log(waitlist + 1) : 0;
    
    return Math.round((totalDemand * utilizationFactor + waitlistFactor * 10) * 100) / 100;
  }

  async generateSectionPlans(departmentId: string): Promise<SectionPlan[]> {
    const capacityData = await this.analyzeDepartmentCapacityNeeds(departmentId);
    const plans: SectionPlan[] = [];

    for (const data of capacityData) {
      const plan = await this.createSectionPlan(data, departmentId);
      plans.push(plan);
    }

    return plans.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  private async createSectionPlan(data: SectionPlanningData, departmentId: string): Promise<SectionPlan> {
    const totalDemand = data.totalEnrollment + data.totalWaitlist;
    const averageCapacityPerSection = data.totalCapacity / data.currentSections;
    
    // Calculate recommended sections based on demand and optimal utilization (85%)
    const optimalUtilization = 0.85;
    const recommendedCapacity = Math.ceil(totalDemand / optimalUtilization);
    const recommendedSections = Math.ceil(recommendedCapacity / averageCapacityPerSection);

    const reasoning: string[] = [];
    let priority: 'high' | 'medium' | 'low' = 'medium';

    // Determine priority and reasoning
    if (data.utilizationRate > 95 || data.totalWaitlist > data.totalCapacity * 0.2) {
      priority = 'high';
      reasoning.push('High utilization or significant waitlist indicates urgent need');
    } else if (data.utilizationRate < 50 && data.currentSections > 1) {
      priority = 'low';
      reasoning.push('Low utilization suggests potential for section consolidation');
    }

    if (recommendedSections > data.currentSections) {
      reasoning.push(`Increase from ${data.currentSections} to ${recommendedSections} sections to meet demand`);
    } else if (recommendedSections < data.currentSections) {
      reasoning.push(`Consider reducing from ${data.currentSections} to ${recommendedSections} sections`);
    } else {
      reasoning.push('Current section count appears optimal');
    }

    const feasibilityFactors = await this.assessFeasibilityFactors(data, departmentId);
    const estimatedCost = this.calculateEstimatedCost(recommendedSections - data.currentSections);

    return {
      courseCode: data.courseCode,
      courseName: data.courseName,
      recommendedSections,
      currentSections: data.currentSections,
      capacityPerSection: Math.round(averageCapacityPerSection),
      totalRecommendedCapacity: recommendedSections * Math.round(averageCapacityPerSection),
      reasoning,
      priority,
      estimatedCost,
      feasibilityFactors
    };
  }

  private async assessFeasibilityFactors(data: SectionPlanningData, departmentId: string): Promise<FeasibilityFactor[]> {
    const factors: FeasibilityFactor[] = [];

    // Instructor availability
    const instructorAvailability = await this.checkInstructorAvailability(departmentId);
    factors.push({
      factor: 'Instructor Availability',
      impact: instructorAvailability > 0.7 ? 'positive' : instructorAvailability > 0.4 ? 'neutral' : 'negative',
      description: `${Math.round(instructorAvailability * 100)}% of instructors have available capacity`,
      weight: 0.4
    });

    // Classroom availability
    const classroomAvailability = await this.checkClassroomAvailability(departmentId);
    factors.push({
      factor: 'Classroom Availability',
      impact: classroomAvailability > 0.6 ? 'positive' : classroomAvailability > 0.3 ? 'neutral' : 'negative',
      description: `${Math.round(classroomAvailability * 100)}% of time slots have available classrooms`,
      weight: 0.3
    });

    // Historical demand trends
    const demandTrend = await this.analyzeDemandTrend(data.courseCode, departmentId);
    factors.push({
      factor: 'Demand Trend',
      impact: demandTrend > 0.1 ? 'positive' : demandTrend < -0.1 ? 'negative' : 'neutral',
      description: `Demand is ${demandTrend > 0 ? 'increasing' : demandTrend < 0 ? 'decreasing' : 'stable'}`,
      weight: 0.2
    });

    // Budget constraints
    factors.push({
      factor: 'Budget Impact',
      impact: data.demandScore > 50 ? 'positive' : 'neutral',
      description: `High demand courses typically receive budget priority`,
      weight: 0.1
    });

    return factors;
  }

  private async checkInstructorAvailability(departmentId: string): Promise<number> {
    // Simplified instructor availability check
    // In practice, this would check actual instructor schedules and workloads
    const { data: instructors, error } = await this.supabase
      .from('users')
      .select(`
        id,
        classes!classes_instructor_id_fkey(count)
      `)
      .eq('role', 'teacher')
      .eq('department_id', departmentId);

    if (error || !instructors) return 0.5; // Default assumption

    const totalInstructors = instructors.length;
    const averageLoad = instructors.reduce((sum, inst) => 
      sum + (inst.classes?.[0]?.count || 0), 0) / totalInstructors;

    // Assume instructors can handle up to 4 classes optimally
    const optimalLoad = 4;
    return Math.max(0, Math.min(1, (optimalLoad - averageLoad) / optimalLoad));
  }

  private async checkClassroomAvailability(departmentId: string): Promise<number> {
    // Simplified classroom availability check
    // In practice, this would check actual room schedules and capacity
    return 0.6; // Assume 60% availability as default
  }

  private async analyzeDemandTrend(courseCode: string, departmentId: string): Promise<number> {
    const { data: historicalData, error } = await this.supabase
      .from('enrollments')
      .select(`
        enrolled_at,
        classes!inner(
          course_code,
          department_id
        )
      `)
      .eq('classes.course_code', courseCode)
      .eq('classes.department_id', departmentId)
      .gte('enrolled_at', new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString())
      .order('enrolled_at');

    if (error || !historicalData || historicalData.length < 10) {
      return 0; // No trend data available
    }

    // Simple trend calculation based on enrollment counts over time
    const monthlyEnrollments: Record<string, number> = {};
    
    historicalData.forEach(enrollment => {
      const month = enrollment.enrolled_at.substring(0, 7); // YYYY-MM
      monthlyEnrollments[month] = (monthlyEnrollments[month] || 0) + 1;
    });

    const months = Object.keys(monthlyEnrollments).sort();
    if (months.length < 6) return 0;

    const recentMonths = months.slice(-6);
    const earlierMonths = months.slice(0, 6);

    const recentAvg = recentMonths.reduce((sum, month) => sum + monthlyEnrollments[month], 0) / recentMonths.length;
    const earlierAvg = earlierMonths.reduce((sum, month) => sum + monthlyEnrollments[month], 0) / earlierMonths.length;

    return earlierAvg > 0 ? (recentAvg - earlierAvg) / earlierAvg : 0;
  }

  private calculateEstimatedCost(additionalSections: number): number {
    // Simplified cost calculation
    const costPerSection = 15000; // Estimated cost per section per semester
    return Math.max(0, additionalSections * costPerSection);
  }

  async optimizeSectionPlan(plan: SectionPlan, constraints: any = {}): Promise<SectionOptimizationResult> {
    const optimizedPlan = { ...plan };
    const improvements: string[] = [];
    const tradeoffs: string[] = [];
    const implementationSteps: string[] = [];

    // Apply optimization based on feasibility factors
    const feasibilityScore = this.calculateFeasibilityScore(plan.feasibilityFactors);

    if (feasibilityScore < 0.6) {
      // Reduce ambition if feasibility is low
      const reduction = Math.ceil((plan.recommendedSections - plan.currentSections) * 0.5);
      optimizedPlan.recommendedSections = Math.max(plan.currentSections, plan.recommendedSections - reduction);
      optimizedPlan.totalRecommendedCapacity = optimizedPlan.recommendedSections * plan.capacityPerSection;
      
      improvements.push('Reduced section increase to improve feasibility');
      tradeoffs.push('May not fully meet demand in the short term');
    }

    // Consider alternative solutions
    if (plan.priority === 'high' && optimizedPlan.recommendedSections > plan.currentSections) {
      implementationSteps.push('Phase 1: Add one section to test demand');
      implementationSteps.push('Phase 2: Evaluate success and add remaining sections');
      implementationSteps.push('Phase 3: Monitor utilization and adjust capacity');
    } else if (optimizedPlan.recommendedSections < plan.currentSections) {
      implementationSteps.push('Phase 1: Identify lowest-enrolled section for potential consolidation');
      implementationSteps.push('Phase 2: Communicate changes to affected students');
      implementationSteps.push('Phase 3: Implement consolidation with student transfer support');
    }

    // Add resource-specific optimizations
    const negativeFactors = plan.feasibilityFactors.filter(f => f.impact === 'negative');
    negativeFactors.forEach(factor => {
      if (factor.factor === 'Instructor Availability') {
        improvements.push('Consider hiring adjunct instructors or increasing class sizes');
        implementationSteps.push('Recruit qualified adjunct instructors');
      } else if (factor.factor === 'Classroom Availability') {
        improvements.push('Explore online or hybrid delivery options');
        implementationSteps.push('Evaluate technology requirements for hybrid delivery');
      }
    });

    return {
      originalPlan: plan,
      optimizedPlan,
      improvements,
      tradeoffs,
      implementationSteps
    };
  }

  private calculateFeasibilityScore(factors: FeasibilityFactor[]): number {
    let weightedScore = 0;
    let totalWeight = 0;

    factors.forEach(factor => {
      let score = 0.5; // Neutral baseline
      if (factor.impact === 'positive') score = 1;
      else if (factor.impact === 'negative') score = 0;

      weightedScore += score * factor.weight;
      totalWeight += factor.weight;
    });

    return totalWeight > 0 ? weightedScore / totalWeight : 0.5;
  }

  async getResourceRequirements(plan: SectionPlan, departmentId: string): Promise<ResourceRequirement[]> {
    const requirements: ResourceRequirement[] = [];
    const additionalSections = plan.recommendedSections - plan.currentSections;

    if (additionalSections > 0) {
      // Instructor requirements
      requirements.push({
        type: 'instructor',
        description: `${additionalSections} additional instructor(s) needed`,
        quantity: additionalSections,
        availability: await this.getInstructorAvailabilityStatus(departmentId),
        alternativeSolutions: [
          'Hire adjunct instructors',
          'Increase class sizes',
          'Use graduate teaching assistants',
          'Implement team teaching'
        ]
      });

      // Classroom requirements
      requirements.push({
        type: 'classroom',
        description: `${additionalSections} additional classroom time slots needed`,
        quantity: additionalSections,
        availability: await this.getClassroomAvailabilityStatus(departmentId),
        alternativeSolutions: [
          'Schedule during off-peak hours',
          'Use hybrid/online delivery',
          'Share classrooms with other departments',
          'Utilize alternative spaces'
        ]
      });

      // Budget requirements
      requirements.push({
        type: 'budget',
        description: `Additional budget for ${additionalSections} section(s)`,
        quantity: plan.estimatedCost,
        availability: 'limited', // Assume budget is always limited
        alternativeSolutions: [
          'Reallocate from underutilized courses',
          'Seek additional funding',
          'Implement cost-sharing with other departments',
          'Phase implementation over multiple terms'
        ]
      });
    }

    return requirements;
  }

  private async getInstructorAvailabilityStatus(departmentId: string): Promise<'available' | 'limited' | 'unavailable'> {
    const availability = await this.checkInstructorAvailability(departmentId);
    if (availability > 0.7) return 'available';
    if (availability > 0.3) return 'limited';
    return 'unavailable';
  }

  private async getClassroomAvailabilityStatus(departmentId: string): Promise<'available' | 'limited' | 'unavailable'> {
    const availability = await this.checkClassroomAvailability(departmentId);
    if (availability > 0.6) return 'available';
    if (availability > 0.3) return 'limited';
    return 'unavailable';
  }

  async generateImplementationTimeline(plans: SectionPlan[]): Promise<any> {
    const timeline = {
      immediate: [] as SectionPlan[],
      shortTerm: [] as SectionPlan[],
      longTerm: [] as SectionPlan[]
    };

    plans.forEach(plan => {
      const feasibilityScore = this.calculateFeasibilityScore(plan.feasibilityFactors);
      
      if (plan.priority === 'high' && feasibilityScore > 0.7) {
        timeline.immediate.push(plan);
      } else if (plan.priority === 'high' || (plan.priority === 'medium' && feasibilityScore > 0.5)) {
        timeline.shortTerm.push(plan);
      } else {
        timeline.longTerm.push(plan);
      }
    });

    return {
      immediate: {
        timeframe: 'Next semester',
        plans: timeline.immediate,
        totalCost: timeline.immediate.reduce((sum, p) => sum + p.estimatedCost, 0)
      },
      shortTerm: {
        timeframe: '2-3 semesters',
        plans: timeline.shortTerm,
        totalCost: timeline.shortTerm.reduce((sum, p) => sum + p.estimatedCost, 0)
      },
      longTerm: {
        timeframe: '1-2 years',
        plans: timeline.longTerm,
        totalCost: timeline.longTerm.reduce((sum, p) => sum + p.estimatedCost, 0)
      }
    };
  }
}