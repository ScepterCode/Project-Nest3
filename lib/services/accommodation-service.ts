import { createClient } from '@/lib/supabase/server';
import {
  StudentAccommodation,
  ClassAccessibility,
  EnrollmentAccommodation,
  AccommodationReservation,
  AccommodationEligibilityResult,
  AccessibilityAssessment,
  PriorityEnrollmentRequest,
  AccommodationType,
  AccessibilityFeature,
  AccommodationStatus
} from '@/lib/types/accommodation';

export class AccommodationService {
  private supabase = createClient();

  /**
   * Check if a student is eligible for priority enrollment based on accommodations
   */
  async checkAccommodationEligibility(
    studentId: string,
    classId: string
  ): Promise<AccommodationEligibilityResult> {
    try {
      // Get student's active accommodations
      const { data: accommodations, error: accommodationError } = await this.supabase
        .from('student_accommodations')
        .select('*')
        .eq('student_id', studentId)
        .eq('active', true)
        .or('expires_at.is.null,expires_at.gt.now()');

      if (accommodationError) throw accommodationError;

      if (!accommodations || accommodations.length === 0) {
        return {
          eligible: false,
          accommodations: [],
          priorityLevel: 0,
          reservedCapacityAvailable: false,
          requiredArrangements: [],
          alternativeOptions: []
        };
      }

      // Check for reserved capacity
      const { data: reservations } = await this.supabase
        .from('accommodation_reservations')
        .select('*')
        .eq('class_id', classId)
        .lt('used_spots', 'reserved_spots')
        .or('expires_at.is.null,expires_at.gt.now()');

      const reservedCapacityAvailable = reservations && reservations.length > 0;
      const maxPriorityLevel = Math.max(...accommodations.map(a => a.priority_level));

      // Get class accessibility features
      const { data: classFeatures } = await this.supabase
        .from('class_accessibility')
        .select('*')
        .eq('class_id', classId);

      const assessment = await this.assessAccessibilityCompatibility(
        accommodations,
        classFeatures || []
      );

      return {
        eligible: true,
        accommodations: accommodations as StudentAccommodation[],
        priorityLevel: maxPriorityLevel,
        reservedCapacityAvailable,
        requiredArrangements: assessment.recommendedArrangements,
        alternativeOptions: assessment.alternativeClasses,
        supportContactInfo: this.getSupportContactInfo()
      };
    } catch (error) {
      console.error('Error checking accommodation eligibility:', error);
      throw error;
    }
  }

  /**
   * Process priority enrollment for students with accommodations
   */
  async processPriorityEnrollment(
    request: PriorityEnrollmentRequest
  ): Promise<{ success: boolean; enrollmentId?: string; message: string }> {
    try {
      // Verify student has valid accommodations
      const eligibility = await this.checkAccommodationEligibility(
        request.studentId,
        request.classId
      );

      if (!eligibility.eligible) {
        return {
          success: false,
          message: 'Student does not have valid accommodations for priority enrollment'
        };
      }

      // Check if reserved capacity is available
      if (eligibility.reservedCapacityAvailable) {
        // Use reserved capacity
        const enrollmentResult = await this.enrollWithReservedCapacity(
          request.studentId,
          request.classId,
          request.accommodationIds
        );
        
        if (enrollmentResult.success) {
          // Create accommodation arrangements
          await this.createAccommodationArrangements(
            enrollmentResult.enrollmentId!,
            request.accommodationIds,
            request.justification
          );

          return {
            success: true,
            enrollmentId: enrollmentResult.enrollmentId,
            message: 'Successfully enrolled using reserved accommodation capacity'
          };
        }
      }

      // If no reserved capacity, check regular capacity with priority
      const { data: classData } = await this.supabase
        .from('classes')
        .select('capacity, current_enrollment')
        .eq('id', request.classId)
        .single();

      if (classData && classData.current_enrollment < classData.capacity) {
        // Regular enrollment with accommodation tracking
        const { data: enrollment, error } = await this.supabase
          .from('enrollments')
          .insert({
            student_id: request.studentId,
            class_id: request.classId,
            status: 'enrolled',
            enrolled_at: new Date().toISOString(),
            metadata: { priority_enrollment: true, accommodation_based: true }
          })
          .select()
          .single();

        if (error) throw error;

        // Update class enrollment count
        await this.supabase
          .from('classes')
          .update({ current_enrollment: classData.current_enrollment + 1 })
          .eq('id', request.classId);

        // Create accommodation arrangements
        await this.createAccommodationArrangements(
          enrollment.id,
          request.accommodationIds,
          request.justification
        );

        return {
          success: true,
          enrollmentId: enrollment.id,
          message: 'Successfully enrolled with priority accommodation processing'
        };
      }

      return {
        success: false,
        message: 'Class is at capacity and no reserved accommodation spots available'
      };
    } catch (error) {
      console.error('Error processing priority enrollment:', error);
      throw error;
    }
  }

  /**
   * Assess accessibility compatibility between student needs and class features
   */
  async assessAccessibilityCompatibility(
    accommodations: StudentAccommodation[],
    classFeatures: ClassAccessibility[]
  ): Promise<AccessibilityAssessment> {
    const compatibility = [];
    const recommendedArrangements = [];
    const alternativeClasses = [];

    for (const accommodation of accommodations) {
      const compatibleFeatures = classFeatures.filter(feature => 
        this.isCompatible(accommodation.accommodationType as AccommodationType, feature.accessibilityType as AccessibilityFeature)
      );

      if (compatibleFeatures.length === 0) {
        // No direct compatibility, need arrangements
        const arrangement = this.getRecommendedArrangement(accommodation.accommodationType as AccommodationType);
        if (arrangement) {
          recommendedArrangements.push(arrangement);
        }
      }

      compatibility.push({
        accommodationType: accommodation.accommodationType as AccommodationType,
        accessibilityFeature: compatibleFeatures[0]?.accessibilityType as AccessibilityFeature,
        compatible: compatibleFeatures.length > 0,
        requiresArrangement: compatibleFeatures.length === 0,
        alternativeAvailable: compatibleFeatures.some(f => f.alternativeArrangements),
        notes: compatibleFeatures[0]?.description
      });
    }

    return {
      classId: classFeatures[0]?.classId || '',
      studentAccommodations: accommodations,
      classFeatures,
      compatibility,
      recommendedArrangements: [...new Set(recommendedArrangements)],
      alternativeClasses,
      supportRequired: recommendedArrangements.length > 0
    };
  }

  /**
   * Create accommodation arrangements for an enrollment
   */
  private async createAccommodationArrangements(
    enrollmentId: string,
    accommodationIds: string[],
    justification: string
  ): Promise<void> {
    const arrangements = accommodationIds.map(accommodationId => ({
      enrollment_id: enrollmentId,
      student_id: '', // Will be filled by trigger or separate query
      class_id: '', // Will be filled by trigger or separate query
      accommodation_id: accommodationId,
      status: 'pending' as AccommodationStatus,
      requested_arrangements: justification
    }));

    // Get enrollment details to fill in student_id and class_id
    const { data: enrollment } = await this.supabase
      .from('enrollments')
      .select('student_id, class_id')
      .eq('id', enrollmentId)
      .single();

    if (enrollment) {
      arrangements.forEach(arr => {
        arr.student_id = enrollment.student_id;
        arr.class_id = enrollment.class_id;
      });

      await this.supabase
        .from('enrollment_accommodations')
        .insert(arrangements);
    }
  }

  /**
   * Enroll student using reserved accommodation capacity
   */
  private async enrollWithReservedCapacity(
    studentId: string,
    classId: string,
    accommodationIds: string[]
  ): Promise<{ success: boolean; enrollmentId?: string }> {
    try {
      // Find available reservation
      const { data: reservation } = await this.supabase
        .from('accommodation_reservations')
        .select('*')
        .eq('class_id', classId)
        .lt('used_spots', 'reserved_spots')
        .or('expires_at.is.null,expires_at.gt.now()')
        .limit(1)
        .single();

      if (!reservation) {
        return { success: false };
      }

      // Create enrollment
      const { data: enrollment, error } = await this.supabase
        .from('enrollments')
        .insert({
          student_id: studentId,
          class_id: classId,
          status: 'enrolled',
          enrolled_at: new Date().toISOString(),
          metadata: { 
            reserved_capacity: true, 
            reservation_id: reservation.id,
            accommodation_based: true 
          }
        })
        .select()
        .single();

      if (error) throw error;

      // Update reservation usage
      await this.supabase
        .from('accommodation_reservations')
        .update({ used_spots: reservation.used_spots + 1 })
        .eq('id', reservation.id);

      return { success: true, enrollmentId: enrollment.id };
    } catch (error) {
      console.error('Error enrolling with reserved capacity:', error);
      return { success: false };
    }
  }

  /**
   * Check if accommodation type is compatible with accessibility feature
   */
  private isCompatible(accommodationType: AccommodationType, accessibilityFeature: AccessibilityFeature): boolean {
    const compatibilityMap: Record<AccommodationType, AccessibilityFeature[]> = {
      mobility: ['wheelchair_accessible', 'elevator_access', 'accessible_restrooms', 'adjustable_seating'],
      visual: ['visual_aids', 'good_lighting', 'assistive_technology'],
      hearing: ['hearing_loop', 'sign_language_interpreter', 'captioning_available'],
      cognitive: ['quiet_environment', 'assistive_technology'],
      learning: ['quiet_environment', 'assistive_technology', 'good_lighting'],
      chronic_illness: ['adjustable_seating', 'accessible_restrooms'],
      mental_health: ['quiet_environment'],
      temporary_disability: ['wheelchair_accessible', 'elevator_access', 'adjustable_seating'],
      other: []
    };

    return compatibilityMap[accommodationType]?.includes(accessibilityFeature) || false;
  }

  /**
   * Get recommended arrangement for accommodation type
   */
  private getRecommendedArrangement(accommodationType: AccommodationType): string | null {
    const arrangementMap: Record<AccommodationType, string> = {
      mobility: 'Ensure wheelchair accessible seating and pathways',
      visual: 'Provide large print materials and good lighting',
      hearing: 'Arrange for sign language interpreter or assistive listening device',
      cognitive: 'Provide quiet testing environment and extended time',
      learning: 'Offer alternative format materials and note-taking assistance',
      chronic_illness: 'Allow flexible attendance and make-up opportunities',
      mental_health: 'Provide stress-reduction accommodations and flexible deadlines',
      temporary_disability: 'Temporary accessibility arrangements as needed',
      other: 'Custom accommodation arrangements as documented'
    };

    return arrangementMap[accommodationType] || null;
  }

  /**
   * Get support contact information
   */
  private getSupportContactInfo(): string {
    return 'Disability Services Office - disabilities@institution.edu - (555) 123-4567';
  }

  /**
   * Get student accommodations
   */
  async getStudentAccommodations(studentId: string): Promise<StudentAccommodation[]> {
    const { data, error } = await this.supabase
      .from('student_accommodations')
      .select('*')
      .eq('student_id', studentId)
      .eq('active', true)
      .order('priority_level', { ascending: false });

    if (error) throw error;
    return data as StudentAccommodation[];
  }

  /**
   * Get class accessibility features
   */
  async getClassAccessibilityFeatures(classId: string): Promise<ClassAccessibility[]> {
    const { data, error } = await this.supabase
      .from('class_accessibility')
      .select('*')
      .eq('class_id', classId);

    if (error) throw error;
    return data as ClassAccessibility[];
  }

  /**
   * Create or update accommodation reservation
   */
  async manageAccommodationReservation(
    classId: string,
    accommodationType: AccommodationType,
    reservedSpots: number,
    expiresAt?: Date
  ): Promise<AccommodationReservation> {
    const { data, error } = await this.supabase
      .from('accommodation_reservations')
      .upsert({
        class_id: classId,
        accommodation_type: accommodationType,
        reserved_spots: reservedSpots,
        expires_at: expiresAt?.toISOString(),
        created_by: 'system', // Should be actual user ID
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data as AccommodationReservation;
  }
}