export interface StudentAccommodation {
  id: string;
  studentId: string;
  accommodationType: AccommodationType;
  description: string;
  documentationVerified: boolean;
  verifiedBy?: string;
  verifiedAt?: Date;
  priorityLevel: 1 | 2 | 3;
  active: boolean;
  expiresAt?: Date;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type AccommodationType = 
  | 'mobility'
  | 'visual'
  | 'hearing'
  | 'cognitive'
  | 'learning'
  | 'chronic_illness'
  | 'mental_health'
  | 'temporary_disability'
  | 'other';

export interface ClassAccessibility {
  id: string;
  classId: string;
  accessibilityType: AccessibilityFeature;
  available: boolean;
  description?: string;
  alternativeArrangements?: string;
  contactInfo?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AccessibilityFeature =
  | 'wheelchair_accessible'
  | 'hearing_loop'
  | 'visual_aids'
  | 'quiet_environment'
  | 'adjustable_seating'
  | 'good_lighting'
  | 'accessible_restrooms'
  | 'elevator_access'
  | 'sign_language_interpreter'
  | 'captioning_available'
  | 'assistive_technology';

export interface EnrollmentAccommodation {
  id: string;
  enrollmentId?: string;
  enrollmentRequestId?: string;
  studentId: string;
  classId: string;
  accommodationId: string;
  status: AccommodationStatus;
  requestedArrangements: string;
  approvedArrangements?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  implementationNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AccommodationStatus = 
  | 'pending'
  | 'approved'
  | 'denied'
  | 'implemented'
  | 'needs_review';

export interface AccommodationReservation {
  id: string;
  classId: string;
  accommodationType: AccommodationType;
  reservedSpots: number;
  usedSpots: number;
  expiresAt?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccommodationCommunication {
  id: string;
  enrollmentAccommodationId: string;
  senderId: string;
  recipientId: string;
  message: string;
  communicationType: CommunicationType;
  readAt?: Date;
  createdAt: Date;
}

export type CommunicationType = 
  | 'general'
  | 'urgent'
  | 'follow_up'
  | 'resolution'
  | 'implementation_update';

export interface AccommodationEligibilityResult {
  eligible: boolean;
  accommodations: StudentAccommodation[];
  priorityLevel: number;
  reservedCapacityAvailable: boolean;
  requiredArrangements: string[];
  alternativeOptions: string[];
  supportContactInfo?: string;
}

export interface AccessibilityAssessment {
  classId: string;
  studentAccommodations: StudentAccommodation[];
  classFeatures: ClassAccessibility[];
  compatibility: AccessibilityCompatibility[];
  recommendedArrangements: string[];
  alternativeClasses: string[];
  supportRequired: boolean;
}

export interface AccessibilityCompatibility {
  accommodationType: AccommodationType;
  accessibilityFeature: AccessibilityFeature;
  compatible: boolean;
  requiresArrangement: boolean;
  alternativeAvailable: boolean;
  notes?: string;
}

export interface PriorityEnrollmentRequest {
  studentId: string;
  classId: string;
  accommodationIds: string[];
  justification: string;
  priorityLevel: number;
  supportingDocumentation?: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
}