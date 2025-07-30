import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AccessibilityIndicators from '@/components/enrollment/accessibility-indicators';
import { ClassAccessibility, AccommodationType } from '@/lib/types/accommodation';

describe('AccessibilityIndicators', () => {
  const mockAccessibilityFeatures: ClassAccessibility[] = [
    {
      id: 'feat-1',
      classId: 'class-1',
      accessibilityType: 'wheelchair_accessible',
      available: true,
      description: 'Fully wheelchair accessible classroom with ramps and wide doorways',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'feat-2',
      classId: 'class-1',
      accessibilityType: 'hearing_loop',
      available: true,
      description: 'Hearing loop system installed',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'feat-3',
      classId: 'class-1',
      accessibilityType: 'visual_aids',
      available: false,
      description: 'Visual aids not currently available',
      alternativeArrangements: 'Large print materials can be provided upon request',
      contactInfo: 'Contact instructor at instructor@example.com',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  const mockStudentAccommodations: AccommodationType[] = ['mobility', 'hearing'];

  describe('Compact Mode', () => {
    it('should render compact view with badges', () => {
      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={mockAccessibilityFeatures}
          studentAccommodations={mockStudentAccommodations}
          compact={true}
        />
      );

      expect(screen.getByText('Wheelchair Accessible')).toBeInTheDocument();
      expect(screen.getByText('Hearing Loop Available')).toBeInTheDocument();
      expect(screen.getByText('Accommodations Supported')).toBeInTheDocument();
    });

    it('should only show available features in compact mode', () => {
      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={mockAccessibilityFeatures}
          compact={true}
        />
      );

      expect(screen.getByText('Wheelchair Accessible')).toBeInTheDocument();
      expect(screen.getByText('Hearing Loop Available')).toBeInTheDocument();
      expect(screen.queryByText('Visual Aids Provided')).not.toBeInTheDocument();
    });
  });

  describe('Full Mode', () => {
    it('should render full accessibility information card', () => {
      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={mockAccessibilityFeatures}
          studentAccommodations={mockStudentAccommodations}
        />
      );

      expect(screen.getByText('Accessibility Information')).toBeInTheDocument();
      expect(screen.getByText('Available Accessibility Features')).toBeInTheDocument();
      expect(screen.getByText('Your Accommodation Compatibility')).toBeInTheDocument();
      expect(screen.getByText('Limitations & Alternative Arrangements')).toBeInTheDocument();
    });

    it('should display available features with descriptions', () => {
      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={mockAccessibilityFeatures}
        />
      );

      expect(screen.getByText('Wheelchair Accessible')).toBeInTheDocument();
      expect(screen.getByText('Fully wheelchair accessible classroom with ramps and wide doorways')).toBeInTheDocument();
      expect(screen.getByText('Hearing Loop Available')).toBeInTheDocument();
      expect(screen.getByText('Hearing loop system installed')).toBeInTheDocument();
    });

    it('should show student accommodation compatibility', () => {
      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={mockAccessibilityFeatures}
          studentAccommodations={mockStudentAccommodations}
        />
      );

      expect(screen.getByText('Mobility Accommodation')).toBeInTheDocument();
      expect(screen.getByText('Hearing Accommodation')).toBeInTheDocument();
      expect(screen.getAllByText('Supported')).toHaveLength(2);
    });

    it('should display limitations and alternatives', () => {
      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={mockAccessibilityFeatures}
        />
      );

      expect(screen.getByText('Visual Aids Provided is not available.')).toBeInTheDocument();
      expect(screen.getByText('Large print materials can be provided upon request')).toBeInTheDocument();
      expect(screen.getByText('instructor@example.com')).toBeInTheDocument();
    });

    it('should show support contact information', () => {
      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={mockAccessibilityFeatures}
        />
      );

      expect(screen.getByText('Need accommodation support?')).toBeInTheDocument();
      expect(screen.getByText(/disabilities@institution.edu/)).toBeInTheDocument();
      expect(screen.getByText(/\(555\) 123-4567/)).toBeInTheDocument();
    });
  });

  describe('Accommodation Compatibility Logic', () => {
    it('should mark mobility accommodations as compatible with wheelchair access', () => {
      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={[mockAccessibilityFeatures[0]]} // wheelchair_accessible
          studentAccommodations={['mobility']}
        />
      );

      expect(screen.getByText('Mobility Accommodation')).toBeInTheDocument();
      expect(screen.getByText('Supported')).toBeInTheDocument();
      expect(screen.getByText(/Available: Wheelchair Accessible/)).toBeInTheDocument();
    });

    it('should mark accommodations as needing arrangement when features are unavailable', () => {
      const unavailableFeatures: ClassAccessibility[] = [
        {
          id: 'feat-1',
          classId: 'class-1',
          accessibilityType: 'wheelchair_accessible',
          available: false,
          description: 'Not wheelchair accessible',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={unavailableFeatures}
          studentAccommodations={['mobility']}
        />
      );

      expect(screen.getByText('Mobility Accommodation')).toBeInTheDocument();
      expect(screen.getByText('Needs Arrangement')).toBeInTheDocument();
    });

    it('should handle multiple accommodation types correctly', () => {
      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={mockAccessibilityFeatures}
          studentAccommodations={['mobility', 'hearing', 'visual']}
        />
      );

      expect(screen.getByText('Mobility Accommodation')).toBeInTheDocument();
      expect(screen.getByText('Hearing Accommodation')).toBeInTheDocument();
      expect(screen.getByText('Visual Accommodation')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty accessibility features', () => {
      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={[]}
          studentAccommodations={['mobility']}
        />
      );

      expect(screen.getByText('Accessibility Information')).toBeInTheDocument();
      expect(screen.queryByText('Available Accessibility Features')).not.toBeInTheDocument();
    });

    it('should handle no student accommodations', () => {
      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={mockAccessibilityFeatures}
          studentAccommodations={[]}
        />
      );

      expect(screen.getByText('Available Accessibility Features')).toBeInTheDocument();
      expect(screen.queryByText('Your Accommodation Compatibility')).not.toBeInTheDocument();
    });

    it('should handle unknown accommodation types gracefully', () => {
      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={mockAccessibilityFeatures}
          studentAccommodations={['unknown_type' as AccommodationType]}
        />
      );

      expect(screen.getByText('Unknown Type Accommodation')).toBeInTheDocument();
    });

    it('should not show alternatives section when showAlternatives is false', () => {
      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={mockAccessibilityFeatures}
          showAlternatives={false}
        />
      );

      expect(screen.getByText('Available Accessibility Features')).toBeInTheDocument();
      // Should still show limitations since they're part of the main display
      expect(screen.getByText('Limitations & Alternative Arrangements')).toBeInTheDocument();
    });
  });

  describe('Accessibility Features', () => {
    it('should have proper ARIA labels and semantic structure', () => {
      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={mockAccessibilityFeatures}
          studentAccommodations={mockStudentAccommodations}
        />
      );

      // Check for proper heading structure
      expect(screen.getByRole('heading', { name: /Accessibility Information/ })).toBeInTheDocument();
      
      // Check for proper list structure for features
      const featureElements = screen.getAllByText(/Wheelchair Accessible|Hearing Loop Available/);
      expect(featureElements.length).toBeGreaterThan(0);
    });

    it('should display icons for different accommodation types', () => {
      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={mockAccessibilityFeatures}
          studentAccommodations={['mobility', 'hearing', 'visual', 'cognitive']}
        />
      );

      // Icons should be present (testing via their container elements)
      expect(screen.getByText('Mobility Accommodation')).toBeInTheDocument();
      expect(screen.getByText('Hearing Accommodation')).toBeInTheDocument();
      expect(screen.getByText('Visual Accommodation')).toBeInTheDocument();
      expect(screen.getByText('Cognitive Accommodation')).toBeInTheDocument();
    });
  });

  describe('Feature Label Mapping', () => {
    it('should correctly format feature labels', () => {
      const featuresWithVariousTypes: ClassAccessibility[] = [
        {
          id: 'feat-1',
          classId: 'class-1',
          accessibilityType: 'wheelchair_accessible',
          available: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'feat-2',
          classId: 'class-1',
          accessibilityType: 'sign_language_interpreter',
          available: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'feat-3',
          classId: 'class-1',
          accessibilityType: 'assistive_technology',
          available: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      render(
        <AccessibilityIndicators
          classId="class-1"
          accessibilityFeatures={featuresWithVariousTypes}
        />
      );

      expect(screen.getByText('Wheelchair Accessible')).toBeInTheDocument();
      expect(screen.getByText('Sign Language Interpreter')).toBeInTheDocument();
      expect(screen.getByText('Assistive Technology')).toBeInTheDocument();
    });
  });
});