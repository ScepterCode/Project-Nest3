/**
 * Gradebook Integration Service
 * Handles enrollment and completion tracking with external gradebook systems
 */

export interface GradebookStudent {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  enrollmentStatus: 'enrolled' | 'dropped' | 'withdrawn' | 'completed';
  enrollmentDate: Date;
  completionDate?: Date;
  finalGrade?: string;
  creditHours: number;
}

export interface GradebookAssignment {
  id: string;
  courseId: string;
  name: string;
  description: string;
  dueDate: Date;
  maxPoints: number;
  weight: number;
  category: string;
  published: boolean;
}

export interface GradebookGrade {
  id: string;
  studentId: string;
  assignmentId: string;
  score?: number;
  letterGrade?: string;
  feedback?: string;
  submittedAt?: Date;
  gradedAt?: Date;
  late: boolean;
  excused: boolean;
}

export interface CourseGradebook {
  courseId: string;
  courseName: string;
  instructor: string;
  term: string;
  students: GradebookStudent[];
  assignments: GradebookAssignment[];
  grades: GradebookGrade[];
  gradingScale: GradingScale;
}

export interface GradingScale {
  id: string;
  name: string;
  ranges: GradeRange[];
}

export interface GradeRange {
  letter: string;
  minPercentage: number;
  maxPercentage: number;
  gpaPoints: number;
}

export interface GradebookIntegrationConfig {
  baseUrl: string;
  apiKey: string;
  institutionId: string;
  syncInterval: number;
  autoSyncGrades: boolean;
  gradeSyncThreshold: number; // Minimum grade change to trigger sync
}

export class GradebookIntegrationService {
  private config: GradebookIntegrationConfig;
  private gradebookCache: Map<string, CourseGradebook> = new Map();
  private lastSyncTimestamp: Map<string, Date> = new Map();

  constructor(config: GradebookIntegrationConfig) {
    this.config = config;
  }

  /**
   * Sync enrollment data with gradebook
   */
  async syncEnrollmentToGradebook(enrollment: {
    studentId: string;
    classId: string;
    status: 'enrolled' | 'dropped' | 'withdrawn';
    enrollmentDate: Date;
    dropDate?: Date;
    creditHours: number;
  }): Promise<void> {
    try {
      const gradebookData = {
        student_id: enrollment.studentId,
        course_id: enrollment.classId,
        enrollment_status: enrollment.status,
        enrollment_date: enrollment.enrollmentDate.toISOString(),
        drop_date: enrollment.dropDate?.toISOString(),
        credit_hours: enrollment.creditHours
      };

      await this.makeGradebookRequest(`/courses/${enrollment.classId}/enrollments`, {
        method: 'POST',
        body: JSON.stringify(gradebookData)
      });

      // Update local cache
      await this.updateEnrollmentCache(enrollment.classId, enrollment);
    } catch (error) {
      console.error('Failed to sync enrollment to gradebook:', error);
      throw error;
    }
  }

  /**
   * Get student's current grades for a course
   */
  async getStudentGrades(studentId: string, classId: string): Promise<{
    currentGrade: number;
    letterGrade: string;
    assignments: GradebookGrade[];
    lastUpdated: Date;
  }> {
    try {
      const response = await this.makeGradebookRequest(
        `/courses/${classId}/students/${studentId}/grades`
      );

      return {
        currentGrade: response.data.current_grade,
        letterGrade: response.data.letter_grade,
        assignments: response.data.assignments.map(this.parseGrade),
        lastUpdated: new Date(response.data.last_updated)
      };
    } catch (error) {
      console.error('Failed to get student grades:', error);
      throw error;
    }
  }

  /**
   * Get course completion status for students
   */
  async getCourseCompletionStatus(classId: string): Promise<{
    studentId: string;
    completed: boolean;
    completionDate?: Date;
    finalGrade?: string;
    creditEarned: number;
  }[]> {
    try {
      const response = await this.makeGradebookRequest(
        `/courses/${classId}/completion-status`
      );

      return response.data.students.map((student: any) => ({
        studentId: student.student_id,
        completed: student.completed,
        completionDate: student.completion_date ? new Date(student.completion_date) : undefined,
        finalGrade: student.final_grade,
        creditEarned: student.credit_earned
      }));
    } catch (error) {
      console.error('Failed to get completion status:', error);
      return [];
    }
  }

  /**
   * Update enrollment status in gradebook
   */
  async updateEnrollmentStatus(
    studentId: string, 
    classId: string, 
    status: 'enrolled' | 'dropped' | 'withdrawn' | 'completed',
    effectiveDate: Date
  ): Promise<void> {
    try {
      await this.makeGradebookRequest(
        `/courses/${classId}/students/${studentId}/enrollment-status`,
        {
          method: 'PUT',
          body: JSON.stringify({
            status,
            effective_date: effectiveDate.toISOString()
          })
        }
      );

      // Update local cache
      await this.updateStudentStatusCache(classId, studentId, status);
    } catch (error) {
      console.error('Failed to update enrollment status in gradebook:', error);
      throw error;
    }
  }

  /**
   * Get gradebook data for a course
   */
  async getCourseGradebook(classId: string, forceRefresh: boolean = false): Promise<CourseGradebook> {
    const cacheKey = classId;
    const lastSync = this.lastSyncTimestamp.get(cacheKey);
    const cacheExpired = !lastSync || 
      (Date.now() - lastSync.getTime()) > this.config.syncInterval;

    if (!forceRefresh && !cacheExpired && this.gradebookCache.has(cacheKey)) {
      return this.gradebookCache.get(cacheKey)!;
    }

    try {
      const response = await this.makeGradebookRequest(`/courses/${classId}/gradebook`);
      const gradebook = this.parseCourseGradebook(response.data);
      
      this.gradebookCache.set(cacheKey, gradebook);
      this.lastSyncTimestamp.set(cacheKey, new Date());
      
      return gradebook;
    } catch (error) {
      console.error('Failed to get course gradebook:', error);
      throw error;
    }
  }

  /**
   * Sync grade changes from gradebook
   */
  async syncGradeChanges(classId: string, since?: Date): Promise<{
    changedGrades: GradebookGrade[];
    newAssignments: GradebookAssignment[];
  }> {
    try {
      const sinceParam = since ? `?since=${since.toISOString()}` : '';
      const response = await this.makeGradebookRequest(
        `/courses/${classId}/changes${sinceParam}`
      );

      return {
        changedGrades: response.data.changed_grades.map(this.parseGrade),
        newAssignments: response.data.new_assignments.map(this.parseAssignment)
      };
    } catch (error) {
      console.error('Failed to sync grade changes:', error);
      return { changedGrades: [], newAssignments: [] };
    }
  }

  /**
   * Calculate final grades for course completion
   */
  async calculateFinalGrades(classId: string): Promise<{
    studentId: string;
    finalGrade: string;
    percentage: number;
    gpaPoints: number;
    passed: boolean;
  }[]> {
    try {
      const response = await this.makeGradebookRequest(
        `/courses/${classId}/final-grades`,
        { method: 'POST' }
      );

      return response.data.final_grades.map((grade: any) => ({
        studentId: grade.student_id,
        finalGrade: grade.final_grade,
        percentage: grade.percentage,
        gpaPoints: grade.gpa_points,
        passed: grade.passed
      }));
    } catch (error) {
      console.error('Failed to calculate final grades:', error);
      return [];
    }
  }

  /**
   * Get enrollment prerequisites based on grade requirements
   */
  async checkGradePrerequisites(
    studentId: string, 
    prerequisiteCourses: string[],
    minimumGrade: string = 'C'
  ): Promise<{
    met: boolean;
    missingPrerequisites: string[];
    completedPrerequisites: { courseId: string; grade: string; }[];
  }> {
    try {
      const response = await this.makeGradebookRequest(
        `/students/${studentId}/prerequisites`,
        {
          method: 'POST',
          body: JSON.stringify({
            required_courses: prerequisiteCourses,
            minimum_grade: minimumGrade
          })
        }
      );

      return {
        met: response.data.prerequisites_met,
        missingPrerequisites: response.data.missing_prerequisites,
        completedPrerequisites: response.data.completed_prerequisites
      };
    } catch (error) {
      console.error('Failed to check grade prerequisites:', error);
      return {
        met: false,
        missingPrerequisites: prerequisiteCourses,
        completedPrerequisites: []
      };
    }
  }

  /**
   * Export gradebook data for enrollment reporting
   */
  async exportEnrollmentGrades(
    classId: string, 
    format: 'csv' | 'json' | 'xlsx' = 'json'
  ): Promise<{
    data: any;
    filename: string;
    contentType: string;
  }> {
    try {
      const response = await this.makeGradebookRequest(
        `/courses/${classId}/export?format=${format}`
      );

      return {
        data: response.data,
        filename: response.filename,
        contentType: response.content_type
      };
    } catch (error) {
      console.error('Failed to export gradebook data:', error);
      throw error;
    }
  }

  private parseCourseGradebook(data: any): CourseGradebook {
    return {
      courseId: data.course_id,
      courseName: data.course_name,
      instructor: data.instructor,
      term: data.term,
      students: data.students.map(this.parseGradebookStudent),
      assignments: data.assignments.map(this.parseAssignment),
      grades: data.grades.map(this.parseGrade),
      gradingScale: this.parseGradingScale(data.grading_scale)
    };
  }

  private parseGradebookStudent(data: any): GradebookStudent {
    return {
      id: data.id,
      studentId: data.student_id,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email,
      enrollmentStatus: data.enrollment_status,
      enrollmentDate: new Date(data.enrollment_date),
      completionDate: data.completion_date ? new Date(data.completion_date) : undefined,
      finalGrade: data.final_grade,
      creditHours: data.credit_hours
    };
  }

  private parseAssignment(data: any): GradebookAssignment {
    return {
      id: data.id,
      courseId: data.course_id,
      name: data.name,
      description: data.description,
      dueDate: new Date(data.due_date),
      maxPoints: data.max_points,
      weight: data.weight,
      category: data.category,
      published: data.published
    };
  }

  private parseGrade(data: any): GradebookGrade {
    return {
      id: data.id,
      studentId: data.student_id,
      assignmentId: data.assignment_id,
      score: data.score,
      letterGrade: data.letter_grade,
      feedback: data.feedback,
      submittedAt: data.submitted_at ? new Date(data.submitted_at) : undefined,
      gradedAt: data.graded_at ? new Date(data.graded_at) : undefined,
      late: data.late,
      excused: data.excused
    };
  }

  private parseGradingScale(data: any): GradingScale {
    return {
      id: data.id,
      name: data.name,
      ranges: data.ranges.map((range: any) => ({
        letter: range.letter,
        minPercentage: range.min_percentage,
        maxPercentage: range.max_percentage,
        gpaPoints: range.gpa_points
      }))
    };
  }

  private async updateEnrollmentCache(classId: string, enrollment: any): Promise<void> {
    const gradebook = this.gradebookCache.get(classId);
    if (gradebook) {
      const studentIndex = gradebook.students.findIndex(s => s.studentId === enrollment.studentId);
      if (studentIndex >= 0) {
        gradebook.students[studentIndex].enrollmentStatus = enrollment.status;
        if (enrollment.dropDate) {
          gradebook.students[studentIndex].completionDate = enrollment.dropDate;
        }
      }
    }
  }

  private async updateStudentStatusCache(classId: string, studentId: string, status: string): Promise<void> {
    const gradebook = this.gradebookCache.get(classId);
    if (gradebook) {
      const student = gradebook.students.find(s => s.studentId === studentId);
      if (student) {
        student.enrollmentStatus = status as any;
        if (status === 'completed') {
          student.completionDate = new Date();
        }
      }
    }
  }

  private async makeGradebookRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`Gradebook API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}