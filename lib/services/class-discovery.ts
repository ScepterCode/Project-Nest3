import { createClient } from '@/lib/supabase/server';
import { cacheManager } from './cache-manager';
import {
  ClassSearchCriteria,
  ClassSearchResult,
  ClassWithEnrollment,
  EligibilityResult,
  EnrollmentStatistics,
  EnrollmentType,
  PrerequisiteType,
  RestrictionType
} from '@/lib/types/enrollment';

export class ClassDiscoveryService {
  private supabase = createClient();

  /**
   * Search for classes based on criteria
   */
  async searchClasses(criteria: ClassSearchCriteria): Promise<ClassSearchResult> {
    // Create cache key from search criteria
    const cacheKey = `search:${JSON.stringify(criteria)}`;
    
    // Try to get from cache first
    const cached = cacheManager.get<ClassSearchResult>('class-discovery', cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let query = this.supabase
        .from('classes')
        .select(`
          *,
          users!classes_teacher_id_fkey (
            id,
            first_name,
            last_name,
            email
          ),
          departments (
            id,
            name
          ),
          institutions (
            id,
            name
          ),
          enrollment_statistics (*),
          class_prerequisites (*),
          enrollment_restrictions (*)
        `);

      // Apply filters
      if (criteria.query) {
        query = query.or(`name.ilike.%${criteria.query}%,description.ilike.%${criteria.query}%,code.ilike.%${criteria.query}%`);
      }

      if (criteria.departmentId) {
        query = query.eq('department_id', criteria.departmentId);
      }

      if (criteria.instructorId) {
        query = query.eq('teacher_id', criteria.instructorId);
      }

      if (criteria.semester) {
        query = query.eq('semester', criteria.semester);
      }

      if (criteria.enrollmentType) {
        query = query.eq('enrollment_type', criteria.enrollmentType);
      }

      if (criteria.credits) {
        query = query.eq('credits', criteria.credits);
      }

      if (criteria.schedule) {
        query = query.ilike('schedule', `%${criteria.schedule}%`);
      }

      if (criteria.location) {
        query = query.ilike('location', `%${criteria.location}%`);
      }

      // Filter by availability
      if (criteria.hasAvailableSpots) {
        query = query.lt('current_enrollment', 'capacity');
      }

      if (criteria.hasWaitlistSpots) {
        // This would need a more complex query in practice
        query = query.gt('waitlist_capacity', 0);
      }

      // Apply sorting
      const sortBy = criteria.sortBy || 'name';
      const sortOrder = criteria.sortOrder || 'asc';
      
      switch (sortBy) {
        case 'enrollment':
          query = query.order('current_enrollment', { ascending: sortOrder === 'asc' });
          break;
        case 'availability':
          query = query.order('capacity', { ascending: sortOrder === 'desc' }); // More capacity = more available
          break;
        case 'created_at':
          query = query.order('created_at', { ascending: sortOrder === 'asc' });
          break;
        default:
          query = query.order('name', { ascending: sortOrder === 'asc' });
      }

      // Apply pagination
      const limit = criteria.limit || 20;
      const offset = criteria.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data: classes, error, count } = await query;

      if (error) {
        throw error;
      }

      // Transform data to ClassWithEnrollment format
      const transformedClasses: ClassWithEnrollment[] = (classes || []).map(this.transformToClassWithEnrollment);

      // Get filter aggregations
      const filters = await this.getSearchFilters(criteria);

      const result = {
        classes: transformedClasses,
        total: count || 0,
        hasMore: (count || 0) > offset + limit,
        filters
      };

      // Cache the result
      cacheManager.set('class-discovery', cacheKey, result);

      return result;
    } catch (error) {
      console.error('Error searching classes:', error);
      throw new Error('Failed to search classes');
    }
  }

  /**
   * Get available classes for a specific student
   */
  async getAvailableClasses(studentId: string): Promise<ClassWithEnrollment[]> {
    // Create cache key for student's available classes
    const cacheKey = `available:${studentId}`;
    
    // Try to get from cache first
    const cached = cacheManager.get<ClassWithEnrollment[]>('class-discovery', cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Get student's institution and department
      const { data: student } = await this.supabase
        .from('users')
        .select('institution_id, department_id')
        .eq('id', studentId)
        .single();

      if (!student) {
        throw new Error('Student not found');
      }

      // Get classes in student's institution/department
      let query = this.supabase
        .from('classes')
        .select(`
          *,
          users!classes_teacher_id_fkey (
            id,
            first_name,
            last_name,
            email
          ),
          departments (
            id,
            name
          ),
          institutions (
            id,
            name
          ),
          enrollment_statistics (*),
          class_prerequisites (*),
          enrollment_restrictions (*)
        `)
        .eq('status', 'active');

      // Filter by institution
      if (student.institution_id) {
        query = query.eq('institution_id', student.institution_id);
      }

      // Optionally filter by department (could be made configurable)
      if (student.department_id) {
        query = query.eq('department_id', student.department_id);
      }

      // Exclude classes student is already enrolled in
      const { data: enrollments } = await this.supabase
        .from('enrollments')
        .select('class_id')
        .eq('student_id', studentId)
        .in('status', ['enrolled', 'pending', 'waitlisted']);

      if (enrollments && enrollments.length > 0) {
        const enrolledClassIds = enrollments.map(e => e.class_id);
        query = query.not('id', 'in', `(${enrolledClassIds.join(',')})`);
      }

      // Only show classes with open enrollment periods
      const now = new Date().toISOString();
      query = query.or(`enrollment_start.is.null,enrollment_start.lte.${now}`)
                  .or(`enrollment_end.is.null,enrollment_end.gte.${now}`);

      const { data: classes, error } = await query.order('name');

      if (error) {
        throw error;
      }

      const result = (classes || []).map(this.transformToClassWithEnrollment);
      
      // Cache the result
      cacheManager.set('class-discovery', cacheKey, result);

      return result;
    } catch (error) {
      console.error('Error getting available classes:', error);
      throw new Error('Failed to get available classes');
    }
  }

  /**
   * Check enrollment eligibility for a student and class
   */
  async checkEnrollmentEligibility(studentId: string, classId: string): Promise<EligibilityResult> {
    // Create cache key for eligibility check
    const cacheKey = `eligibility:${studentId}:${classId}`;
    
    // Try to get from cache first
    const cached = cacheManager.get<EligibilityResult>('user-eligibility', cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const reasons: EligibilityResult['reasons'] = [];
      const recommendedActions: string[] = [];
      const alternativeClasses: string[] = [];

      // Get class details with prerequisites and restrictions
      const { data: classData } = await this.supabase
        .from('classes')
        .select(`
          *,
          class_prerequisites (*),
          enrollment_restrictions (*),
          enrollment_statistics (*)
        `)
        .eq('id', classId)
        .single();

      if (!classData) {
        return {
          eligible: false,
          reasons: [{ type: 'permission', message: 'Class not found', severity: 'error', overridable: false }],
          recommendedActions: ['Verify the class ID']
        };
      }

      // Get student details
      const { data: student } = await this.supabase
        .from('users')
        .select(`
          *,
          enrollments (
            class_id,
            status,
            grade,
            classes (
              name,
              code,
              credits
            )
          )
        `)
        .eq('id', studentId)
        .single();

      if (!student) {
        return {
          eligible: false,
          reasons: [{ type: 'permission', message: 'Student not found', severity: 'error', overridable: false }],
          recommendedActions: ['Verify student account']
        };
      }

      // Check enrollment period
      const now = new Date();
      if (classData.enrollment_start && new Date(classData.enrollment_start) > now) {
        reasons.push({
          type: 'deadline',
          message: `Enrollment opens on ${new Date(classData.enrollment_start).toLocaleDateString()}`,
          severity: 'error',
          overridable: false
        });
      }

      if (classData.enrollment_end && new Date(classData.enrollment_end) < now) {
        reasons.push({
          type: 'deadline',
          message: 'Enrollment period has ended',
          severity: 'error',
          overridable: true
        });
        recommendedActions.push('Contact instructor for late enrollment');
      }

      // Check capacity
      const stats = classData.enrollment_statistics?.[0];
      if (classData.current_enrollment >= classData.capacity) {
        if (classData.waitlist_capacity > (stats?.total_waitlisted || 0)) {
          reasons.push({
            type: 'capacity',
            message: 'Class is full, but waitlist is available',
            severity: 'warning',
            overridable: false
          });
          recommendedActions.push('Join the waitlist');
        } else {
          reasons.push({
            type: 'capacity',
            message: 'Class and waitlist are full',
            severity: 'error',
            overridable: true
          });
          recommendedActions.push('Look for alternative sections');
          
          // Find alternative classes
          const alternatives = await this.findAlternativeClasses(classId, studentId);
          alternativeClasses.push(...alternatives);
        }
      }

      // Check prerequisites
      if (classData.class_prerequisites) {
        for (const prereq of classData.class_prerequisites) {
          const prereqCheck = await this.checkPrerequisite(student, prereq);
          if (!prereqCheck.satisfied) {
            reasons.push({
              type: 'prerequisite',
              message: prereqCheck.message,
              severity: prereq.strict ? 'error' : 'warning',
              overridable: !prereq.strict
            });
            
            if (prereqCheck.recommendedAction) {
              recommendedActions.push(prereqCheck.recommendedAction);
            }
          }
        }
      }

      // Check restrictions
      if (classData.enrollment_restrictions) {
        for (const restriction of classData.enrollment_restrictions) {
          const restrictionCheck = await this.checkRestriction(student, restriction);
          if (!restrictionCheck.satisfied) {
            reasons.push({
              type: 'restriction',
              message: restrictionCheck.message,
              severity: restriction.overridable ? 'warning' : 'error',
              overridable: restriction.overridable
            });
            
            if (restrictionCheck.recommendedAction) {
              recommendedActions.push(restrictionCheck.recommendedAction);
            }
          }
        }
      }

      // Check for enrollment conflicts (time conflicts, etc.)
      const conflicts = await this.checkScheduleConflicts(studentId, classId);
      if (conflicts.length > 0) {
        reasons.push({
          type: 'restriction',
          message: `Schedule conflict with: ${conflicts.join(', ')}`,
          severity: 'warning',
          overridable: true
        });
        recommendedActions.push('Review your schedule for conflicts');
      }

      // Determine overall eligibility
      const errorReasons = reasons.filter(r => r.severity === 'error' && !r.overridable);
      const eligible = errorReasons.length === 0;

      const result = {
        eligible,
        reasons,
        recommendedActions: [...new Set(recommendedActions)], // Remove duplicates
        alternativeClasses: alternativeClasses.length > 0 ? alternativeClasses : undefined
      };

      // Cache the result
      cacheManager.set('user-eligibility', cacheKey, result);

      return result;
    } catch (error) {
      console.error('Error checking enrollment eligibility:', error);
      return {
        eligible: false,
        reasons: [{ type: 'permission', message: 'Unable to check eligibility', severity: 'error', overridable: false }],
        recommendedActions: ['Please try again later']
      };
    }
  }

  /**
   * Get detailed class information
   */
  async getClassDetails(classId: string, studentId?: string): Promise<ClassWithEnrollment | null> {
    // Create cache key for class details
    const cacheKey = studentId ? `details:${classId}:${studentId}` : `details:${classId}`;
    
    // Try to get from cache first
    const cached = cacheManager.get<ClassWithEnrollment>('class-details', cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const { data: classData, error } = await this.supabase
        .from('classes')
        .select(`
          *,
          users!classes_teacher_id_fkey (
            id,
            first_name,
            last_name,
            email
          ),
          departments (
            id,
            name
          ),
          institutions (
            id,
            name
          ),
          enrollment_statistics (*),
          class_prerequisites (*),
          enrollment_restrictions (*)
        `)
        .eq('id', classId)
        .single();

      if (error || !classData) {
        return null;
      }

      const transformedClass = this.transformToClassWithEnrollment(classData);

      // If student ID provided, add student-specific information
      if (studentId) {
        const eligibility = await this.checkEnrollmentEligibility(studentId, classId);
        (transformedClass as any).eligibility = eligibility;

        // Check if student is already enrolled/waitlisted
        const { data: enrollment } = await this.supabase
          .from('enrollments')
          .select('*')
          .eq('student_id', studentId)
          .eq('class_id', classId)
          .single();

        if (enrollment) {
          (transformedClass as any).studentEnrollment = enrollment;
        }

        // Check waitlist status
        const { data: waitlistEntry } = await this.supabase
          .from('waitlist_entries')
          .select('*')
          .eq('student_id', studentId)
          .eq('class_id', classId)
          .single();

        if (waitlistEntry) {
          (transformedClass as any).studentWaitlistEntry = waitlistEntry;
        }
      }

      // Cache the result
      cacheManager.set('class-details', cacheKey, transformedClass);

      return transformedClass;
    } catch (error) {
      console.error('Error getting class details:', error);
      return null;
    }
  }

  /**
   * Get enrollment statistics for a class
   */
  async getEnrollmentStatistics(classId: string): Promise<EnrollmentStatistics | null> {
    try {
      const { data, error } = await this.supabase
        .from('enrollment_statistics')
        .select('*')
        .eq('class_id', classId)
        .single();

      if (error || !data) {
        return null;
      }

      return data as EnrollmentStatistics;
    } catch (error) {
      console.error('Error getting enrollment statistics:', error);
      return null;
    }
  }

  // Private helper methods

  private transformToClassWithEnrollment(classData: any): ClassWithEnrollment {
    const stats = classData.enrollment_statistics?.[0];
    
    return {
      ...classData,
      teacherName: classData.users ? `${classData.users.first_name} ${classData.users.last_name}` : 'Unknown',
      enrollmentConfig: {
        enrollmentType: classData.enrollment_type || EnrollmentType.OPEN,
        capacity: classData.capacity || 30,
        waitlistCapacity: classData.waitlist_capacity || 10,
        enrollmentStart: classData.enrollment_start ? new Date(classData.enrollment_start) : undefined,
        enrollmentEnd: classData.enrollment_end ? new Date(classData.enrollment_end) : undefined,
        dropDeadline: classData.drop_deadline ? new Date(classData.drop_deadline) : undefined,
        withdrawDeadline: classData.withdraw_deadline ? new Date(classData.withdraw_deadline) : undefined,
        autoApprove: classData.enrollment_type === EnrollmentType.OPEN,
        requiresJustification: classData.enrollment_type === EnrollmentType.RESTRICTED,
        allowWaitlist: (classData.waitlist_capacity || 0) > 0,
        notificationSettings: {
          enrollmentConfirmation: true,
          waitlistUpdates: true,
          deadlineReminders: true,
          capacityAlerts: true
        }
      },
      availableSpots: Math.max(0, (classData.capacity || 30) - (classData.current_enrollment || 0)),
      waitlistCount: stats?.total_waitlisted || 0,
      isEnrollmentOpen: this.isEnrollmentOpen(classData),
      isWaitlistAvailable: (classData.waitlist_capacity || 0) > (stats?.total_waitlisted || 0),
      enrollmentStatistics: stats ? stats as EnrollmentStatistics : undefined
    } as ClassWithEnrollment;
  }

  private isEnrollmentOpen(classData: any): boolean {
    const now = new Date();
    const enrollmentStart = classData.enrollment_start ? new Date(classData.enrollment_start) : null;
    const enrollmentEnd = classData.enrollment_end ? new Date(classData.enrollment_end) : null;

    if (enrollmentStart && now < enrollmentStart) return false;
    if (enrollmentEnd && now > enrollmentEnd) return false;
    
    return classData.status === 'active';
  }

  private async getSearchFilters(criteria: ClassSearchCriteria) {
    // Get filter aggregations for the search results
    // This would typically be done with more sophisticated queries
    
    const { data: departments } = await this.supabase
      .from('departments')
      .select('id, name')
      .order('name');

    const { data: instructors } = await this.supabase
      .from('users')
      .select('id, first_name, last_name')
      .eq('role', 'teacher')
      .order('last_name');

    return {
      departments: (departments || []).map(d => ({ ...d, count: 0 })), // Would calculate actual counts
      instructors: (instructors || []).map(i => ({ 
        id: i.id, 
        name: `${i.first_name} ${i.last_name}`, 
        count: 0 
      })),
      semesters: [
        { value: 'Fall 2024', count: 0 },
        { value: 'Spring 2025', count: 0 },
        { value: 'Summer 2025', count: 0 }
      ],
      enrollmentTypes: [
        { type: EnrollmentType.OPEN, count: 0 },
        { type: EnrollmentType.RESTRICTED, count: 0 },
        { type: EnrollmentType.INVITATION_ONLY, count: 0 }
      ]
    };
  }

  private async checkPrerequisite(student: any, prerequisite: any): Promise<{ satisfied: boolean; message: string; recommendedAction?: string }> {
    const requirement = JSON.parse(prerequisite.requirement);
    
    switch (prerequisite.type) {
      case PrerequisiteType.COURSE:
        // Check if student has completed required course
        const completedCourse = student.enrollments?.find((e: any) => 
          e.classes?.code === requirement.courseCode && 
          e.status === 'completed' &&
          (requirement.minGrade ? this.gradeToNumber(e.grade) >= this.gradeToNumber(requirement.minGrade) : true)
        );
        
        if (!completedCourse) {
          return {
            satisfied: false,
            message: `Requires completion of ${requirement.courseCode}${requirement.minGrade ? ` with grade ${requirement.minGrade} or better` : ''}`,
            recommendedAction: `Complete ${requirement.courseCode} before enrolling`
          };
        }
        break;

      case PrerequisiteType.GPA:
        const currentGPA = this.calculateGPA(student.enrollments || []);
        if (currentGPA < requirement.minGPA) {
          return {
            satisfied: false,
            message: `Requires minimum GPA of ${requirement.minGPA} (current: ${currentGPA.toFixed(2)})`,
            recommendedAction: 'Improve your GPA before enrolling'
          };
        }
        break;

      case PrerequisiteType.YEAR:
        // This would check student's academic year
        const studentYear = student.year || 'freshman';
        const requiredYears = requirement.years || [];
        if (!requiredYears.includes(studentYear)) {
          return {
            satisfied: false,
            message: `Requires ${requiredYears.join(' or ')} standing (current: ${studentYear})`,
            recommendedAction: 'This course is not available for your academic level'
          };
        }
        break;

      case PrerequisiteType.MAJOR:
        const studentMajor = student.major;
        const requiredMajors = requirement.majors || [];
        if (studentMajor && !requiredMajors.includes(studentMajor)) {
          return {
            satisfied: false,
            message: `Restricted to ${requiredMajors.join(', ')} majors`,
            recommendedAction: 'Contact instructor for permission to enroll'
          };
        }
        break;
    }

    return { satisfied: true, message: 'Prerequisite satisfied' };
  }

  private async checkRestriction(student: any, restriction: any): Promise<{ satisfied: boolean; message: string; recommendedAction?: string }> {
    const condition = JSON.parse(restriction.condition);
    
    switch (restriction.type) {
      case RestrictionType.YEAR_LEVEL:
        const studentYear = student.year || 'freshman';
        const restrictedYears = condition.excludeYears || [];
        if (restrictedYears.includes(studentYear)) {
          return {
            satisfied: false,
            message: `Not available for ${studentYear} students`,
            recommendedAction: restriction.overridable ? 'Contact instructor for permission' : 'Look for courses appropriate for your level'
          };
        }
        break;

      case RestrictionType.DEPARTMENT:
        const studentDepartment = student.department_id;
        const restrictedDepartments = condition.excludeDepartments || [];
        if (studentDepartment && restrictedDepartments.includes(studentDepartment)) {
          return {
            satisfied: false,
            message: 'Not available for students from your department',
            recommendedAction: 'Contact instructor for cross-department enrollment'
          };
        }
        break;

      case RestrictionType.GPA:
        const currentGPA = this.calculateGPA(student.enrollments || []);
        if (condition.maxGPA && currentGPA > condition.maxGPA) {
          return {
            satisfied: false,
            message: `Maximum GPA requirement: ${condition.maxGPA} (current: ${currentGPA.toFixed(2)})`,
            recommendedAction: 'This course is designed for students needing additional support'
          };
        }
        break;
    }

    return { satisfied: true, message: 'Restriction satisfied' };
  }

  private async checkScheduleConflicts(studentId: string, classId: string): Promise<string[]> {
    // This would check for time conflicts with student's current schedule
    // For now, return empty array
    return [];
  }

  private async findAlternativeClasses(classId: string, studentId: string): Promise<string[]> {
    // Find similar classes that the student might be interested in
    const { data: currentClass } = await this.supabase
      .from('classes')
      .select('name, department_id, credits')
      .eq('id', classId)
      .single();

    if (!currentClass) return [];

    const { data: alternatives } = await this.supabase
      .from('classes')
      .select('id')
      .eq('department_id', currentClass.department_id)
      .eq('credits', currentClass.credits)
      .neq('id', classId)
      .lt('current_enrollment', 'capacity')
      .limit(3);

    return (alternatives || []).map(a => a.id);
  }

  private gradeToNumber(grade: string): number {
    const gradeMap: { [key: string]: number } = {
      'A+': 4.0, 'A': 4.0, 'A-': 3.7,
      'B+': 3.3, 'B': 3.0, 'B-': 2.7,
      'C+': 2.3, 'C': 2.0, 'C-': 1.7,
      'D+': 1.3, 'D': 1.0, 'D-': 0.7,
      'F': 0.0
    };
    return gradeMap[grade] || 0.0;
  }

  private calculateGPA(enrollments: any[]): number {
    const completedEnrollments = enrollments.filter(e => e.status === 'completed' && e.grade);
    if (completedEnrollments.length === 0) return 0.0;

    const totalPoints = completedEnrollments.reduce((sum, e) => sum + (this.gradeToNumber(e.grade) * e.classes.credits), 0);
    const totalCredits = completedEnrollments.reduce((sum, e) => sum + e.classes.credits, 0);

    return totalCredits > 0 ? totalPoints / totalCredits : 0.0;
  }

  /**
   * Cache invalidation utilities
   */
  invalidateClassCache(classId: string): void {
    // Invalidate all cache entries related to a specific class
    cacheManager.invalidatePattern('class-discovery', `search:.*`);
    cacheManager.invalidatePattern('class-details', `details:${classId}.*`);
    cacheManager.invalidatePattern('user-eligibility', `eligibility:.*:${classId}`);
  }

  invalidateStudentCache(studentId: string): void {
    // Invalidate all cache entries related to a specific student
    cacheManager.invalidatePattern('class-discovery', `available:${studentId}`);
    cacheManager.invalidatePattern('user-eligibility', `eligibility:${studentId}:.*`);
    cacheManager.invalidatePattern('class-details', `details:.*:${studentId}`);
  }

  invalidateEnrollmentCache(): void {
    // Invalidate enrollment-related caches when enrollments change
    cacheManager.invalidate('class-discovery');
    cacheManager.invalidate('user-eligibility');
    cacheManager.invalidatePattern('waitlist-positions', '.*');
  }

  warmupCache(classIds: string[], studentIds?: string[]): Promise<void> {
    // Pre-populate cache with frequently accessed data
    return Promise.all([
      // Warm up class details
      ...classIds.map(classId => this.getClassDetails(classId)),
      // Warm up student-specific data if provided
      ...(studentIds ? studentIds.flatMap(studentId => [
        this.getAvailableClasses(studentId),
        ...classIds.map(classId => this.checkEnrollmentEligibility(studentId, classId))
      ]) : [])
    ]).then(() => {});
  }
}