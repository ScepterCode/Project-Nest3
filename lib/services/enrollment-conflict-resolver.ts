import { createClient } from '@/lib/supabase/server';
import { EnrollmentConflict } from './enrollment-analytics';

export interface ConflictResolution {
  conflictId: string;
  resolutionType: 'manual_override' | 'capacity_increase' | 'student_transfer' | 'policy_exception' | 'dismiss';
  description: string;
  actionTaken: string;
  resolvedBy: string;
  resolvedAt: Date;
  affectedStudents: string[];
  notes?: string;
}

export interface OverrideCapability {
  type: 'enrollment_override' | 'prerequisite_override' | 'capacity_override' | 'deadline_override';
  description: string;
  requiresApproval: boolean;
  approvalLevel: 'department' | 'institution' | 'system';
  maxOverrides?: number;
  conditions?: string[];
}

export interface EnrollmentOverride {
  id: string;
  studentId: string;
  classId: string;
  overrideType: OverrideCapability['type'];
  reason: string;
  requestedBy: string;
  approvedBy?: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  requestedAt: Date;
  approvedAt?: Date;
  expiresAt?: Date;
  conditions?: string[];
}

export class EnrollmentConflictResolver {
  private supabase = createClient();

  async detectConflicts(institutionId: string): Promise<EnrollmentConflict[]> {
    const conflicts: EnrollmentConflict[] = [];

    // Detect capacity violations
    const capacityConflicts = await this.detectCapacityViolations(institutionId);
    conflicts.push(...capacityConflicts);

    // Detect prerequisite violations
    const prerequisiteConflicts = await this.detectPrerequisiteViolations(institutionId);
    conflicts.push(...prerequisiteConflicts);

    // Detect schedule conflicts
    const scheduleConflicts = await this.detectScheduleConflicts(institutionId);
    conflicts.push(...scheduleConflicts);

    // Detect suspicious activity
    const suspiciousActivity = await this.detectSuspiciousActivity(institutionId);
    conflicts.push(...suspiciousActivity);

    // Detect policy violations
    const policyViolations = await this.detectPolicyViolations(institutionId);
    conflicts.push(...policyViolations);

    return conflicts;
  }

  private async detectCapacityViolations(institutionId: string): Promise<EnrollmentConflict[]> {
    const { data, error } = await this.supabase
      .from('classes')
      .select(`
        id,
        name,
        capacity,
        current_enrollment,
        department:departments!inner(
          id,
          name,
          institution_id
        )
      `)
      .eq('department.institution_id', institutionId)
      .gt('current_enrollment', 'capacity');

    if (error) {
      console.error('Error detecting capacity violations:', error);
      return [];
    }

    return (data || []).map(cls => ({
      id: `capacity-violation-${cls.id}`,
      type: 'capacity_exceeded' as const,
      severity: 'high' as const,
      description: `Class "${cls.name}" has exceeded its capacity of ${cls.capacity} with ${cls.current_enrollment} enrolled students`,
      affectedStudents: (cls.current_enrollment || 0) - (cls.capacity || 0),
      classId: cls.id,
      className: cls.name,
      detectedAt: new Date(),
      status: 'open' as const
    }));
  }

  private async detectPrerequisiteViolations(institutionId: string): Promise<EnrollmentConflict[]> {
    // This would check for students enrolled in classes without meeting prerequisites
    const { data, error } = await this.supabase
      .from('enrollments')
      .select(`
        id,
        student_id,
        class:classes!inner(
          id,
          name,
          class_prerequisites(
            id,
            type,
            requirement,
            strict
          ),
          department:departments!inner(institution_id)
        ),
        student:users!inner(
          id,
          email,
          user_metadata
        )
      `)
      .eq('class.department.institution_id', institutionId)
      .eq('status', 'enrolled');

    if (error) {
      console.error('Error detecting prerequisite violations:', error);
      return [];
    }

    const conflicts: EnrollmentConflict[] = [];

    // This would involve complex logic to check if students meet prerequisites
    // For now, returning empty array as this requires more complex prerequisite checking
    return conflicts;
  }

  private async detectScheduleConflicts(institutionId: string): Promise<EnrollmentConflict[]> {
    // This would detect students enrolled in classes with overlapping schedules
    // Implementation would require schedule data structure
    return [];
  }

  private async detectSuspiciousActivity(institutionId: string): Promise<EnrollmentConflict[]> {
    const conflicts: EnrollmentConflict[] = [];

    // Detect rapid enrollment attempts
    const { data: rapidEnrollments } = await this.supabase
      .from('enrollment_audit_log')
      .select(`
        student_id,
        class_id,
        timestamp,
        student:users!inner(email),
        class:classes!inner(
          name,
          department:departments!inner(institution_id)
        )
      `)
      .eq('class.department.institution_id', institutionId)
      .eq('action', 'enrolled')
      .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours

    if (rapidEnrollments) {
      const studentEnrollmentCounts = new Map<string, { count: number; email: string }>();
      
      rapidEnrollments.forEach(enrollment => {
        const key = enrollment.student_id;
        if (!studentEnrollmentCounts.has(key)) {
          studentEnrollmentCounts.set(key, { count: 0, email: enrollment.student.email });
        }
        studentEnrollmentCounts.get(key)!.count++;
      });

      // Flag students with more than 10 enrollments in 24 hours
      studentEnrollmentCounts.forEach((data, studentId) => {
        if (data.count > 10) {
          conflicts.push({
            id: `suspicious-activity-${studentId}`,
            type: 'suspicious_activity',
            severity: 'medium',
            description: `Student ${data.email} has enrolled in ${data.count} classes in the last 24 hours`,
            affectedStudents: 1,
            studentId,
            studentName: data.email,
            detectedAt: new Date(),
            status: 'open'
          });
        }
      });
    }

    return conflicts;
  }

  private async detectPolicyViolations(institutionId: string): Promise<EnrollmentConflict[]> {
    // This would check for violations of institution policies
    // Implementation would depend on policy structure and enforcement rules
    return [];
  }

  async resolveConflict(
    conflictId: string,
    resolution: ConflictResolution
  ): Promise<void> {
    try {
      // Log the resolution
      const { error: logError } = await this.supabase
        .from('conflict_resolutions')
        .insert({
          conflict_id: conflictId,
          resolution_type: resolution.resolutionType,
          description: resolution.description,
          action_taken: resolution.actionTaken,
          resolved_by: resolution.resolvedBy,
          resolved_at: resolution.resolvedAt.toISOString(),
          affected_students: resolution.affectedStudents,
          notes: resolution.notes
        });

      if (logError) throw logError;

      // Execute the resolution action
      await this.executeResolutionAction(resolution);

    } catch (error) {
      console.error('Error resolving conflict:', error);
      throw new Error('Failed to resolve conflict');
    }
  }

  private async executeResolutionAction(resolution: ConflictResolution): Promise<void> {
    switch (resolution.resolutionType) {
      case 'capacity_increase':
        await this.increaseClassCapacity(resolution);
        break;
      case 'student_transfer':
        await this.transferStudents(resolution);
        break;
      case 'manual_override':
        await this.applyManualOverride(resolution);
        break;
      case 'policy_exception':
        await this.createPolicyException(resolution);
        break;
      case 'dismiss':
        // No action needed for dismissal
        break;
    }
  }

  private async increaseClassCapacity(resolution: ConflictResolution): Promise<void> {
    // Extract class ID from conflict ID (assuming format: capacity-violation-{classId})
    const classId = resolution.conflictId.replace('capacity-violation-', '');
    
    // This would increase the class capacity
    // Implementation would depend on the specific increase amount
    console.log(`Increasing capacity for class ${classId}`);
  }

  private async transferStudents(resolution: ConflictResolution): Promise<void> {
    // This would transfer students to alternative sections or classes
    console.log(`Transferring students: ${resolution.affectedStudents.join(', ')}`);
  }

  private async applyManualOverride(resolution: ConflictResolution): Promise<void> {
    // This would apply manual overrides for specific situations
    console.log(`Applying manual override: ${resolution.description}`);
  }

  private async createPolicyException(resolution: ConflictResolution): Promise<void> {
    // This would create exceptions to institutional policies
    console.log(`Creating policy exception: ${resolution.description}`);
  }

  async requestOverride(override: Omit<EnrollmentOverride, 'id' | 'status' | 'requestedAt'>): Promise<string> {
    const overrideId = `override-${Date.now()}`;
    
    const { error } = await this.supabase
      .from('enrollment_overrides')
      .insert({
        id: overrideId,
        student_id: override.studentId,
        class_id: override.classId,
        override_type: override.overrideType,
        reason: override.reason,
        requested_by: override.requestedBy,
        status: 'pending',
        requested_at: new Date().toISOString(),
        expires_at: override.expiresAt?.toISOString(),
        conditions: override.conditions
      });

    if (error) throw error;

    return overrideId;
  }

  async approveOverride(
    overrideId: string,
    approvedBy: string,
    conditions?: string[]
  ): Promise<void> {
    const { error } = await this.supabase
      .from('enrollment_overrides')
      .update({
        status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        conditions
      })
      .eq('id', overrideId);

    if (error) throw error;

    // Execute the override action
    await this.executeOverride(overrideId);
  }

  async denyOverride(overrideId: string, deniedBy: string, reason?: string): Promise<void> {
    const { error } = await this.supabase
      .from('enrollment_overrides')
      .update({
        status: 'denied',
        approved_by: deniedBy,
        approved_at: new Date().toISOString(),
        notes: reason
      })
      .eq('id', overrideId);

    if (error) throw error;
  }

  private async executeOverride(overrideId: string): Promise<void> {
    const { data: override, error } = await this.supabase
      .from('enrollment_overrides')
      .select('*')
      .eq('id', overrideId)
      .single();

    if (error || !override) {
      throw new Error('Override not found');
    }

    switch (override.override_type) {
      case 'enrollment_override':
        await this.executeEnrollmentOverride(override);
        break;
      case 'prerequisite_override':
        await this.executePrerequisiteOverride(override);
        break;
      case 'capacity_override':
        await this.executeCapacityOverride(override);
        break;
      case 'deadline_override':
        await this.executeDeadlineOverride(override);
        break;
    }
  }

  private async executeEnrollmentOverride(override: any): Promise<void> {
    // Force enroll the student despite normal restrictions
    console.log(`Executing enrollment override for student ${override.student_id} in class ${override.class_id}`);
  }

  private async executePrerequisiteOverride(override: any): Promise<void> {
    // Allow enrollment despite missing prerequisites
    console.log(`Executing prerequisite override for student ${override.student_id} in class ${override.class_id}`);
  }

  private async executeCapacityOverride(override: any): Promise<void> {
    // Allow enrollment despite capacity limits
    console.log(`Executing capacity override for student ${override.student_id} in class ${override.class_id}`);
  }

  private async executeDeadlineOverride(override: any): Promise<void> {
    // Allow enrollment despite deadline restrictions
    console.log(`Executing deadline override for student ${override.student_id} in class ${override.class_id}`);
  }

  async getOverrideCapabilities(userRole: string, institutionId: string): Promise<OverrideCapability[]> {
    const capabilities: OverrideCapability[] = [];

    // Define capabilities based on user role
    if (userRole === 'institution_admin') {
      capabilities.push(
        {
          type: 'enrollment_override',
          description: 'Override enrollment restrictions for specific students',
          requiresApproval: false,
          approvalLevel: 'institution'
        },
        {
          type: 'prerequisite_override',
          description: 'Allow enrollment without meeting prerequisites',
          requiresApproval: true,
          approvalLevel: 'department'
        },
        {
          type: 'capacity_override',
          description: 'Exceed class capacity limits',
          requiresApproval: false,
          approvalLevel: 'institution',
          maxOverrides: 5,
          conditions: ['Must provide justification', 'Limited to 5 students per class']
        },
        {
          type: 'deadline_override',
          description: 'Allow enrollment after deadlines',
          requiresApproval: false,
          approvalLevel: 'institution'
        }
      );
    }

    return capabilities;
  }
}