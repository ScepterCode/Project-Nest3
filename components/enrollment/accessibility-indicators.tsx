'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Wheelchair, 
  Eye, 
  Ear, 
  Brain, 
  Heart, 
  AlertTriangle,
  CheckCircle,
  Info,
  Phone
} from 'lucide-react';
import { ClassAccessibility, AccessibilityFeature, AccommodationType } from '@/lib/types/accommodation';

interface AccessibilityIndicatorsProps {
  classId: string;
  accessibilityFeatures: ClassAccessibility[];
  studentAccommodations?: AccommodationType[];
  showAlternatives?: boolean;
  compact?: boolean;
}

const AccessibilityIndicators: React.FC<AccessibilityIndicatorsProps> = ({
  classId,
  accessibilityFeatures,
  studentAccommodations = [],
  showAlternatives = true,
  compact = false
}) => {
  const getFeatureIcon = (feature: AccessibilityFeature) => {
    const iconMap: Record<AccessibilityFeature, React.ReactNode> = {
      wheelchair_accessible: <Wheelchair className="h-4 w-4" />,
      hearing_loop: <Ear className="h-4 w-4" />,
      visual_aids: <Eye className="h-4 w-4" />,
      quiet_environment: <Brain className="h-4 w-4" />,
      adjustable_seating: <Wheelchair className="h-4 w-4" />,
      good_lighting: <Eye className="h-4 w-4" />,
      accessible_restrooms: <Wheelchair className="h-4 w-4" />,
      elevator_access: <Wheelchair className="h-4 w-4" />,
      sign_language_interpreter: <Ear className="h-4 w-4" />,
      captioning_available: <Ear className="h-4 w-4" />,
      assistive_technology: <Brain className="h-4 w-4" />
    };
    return iconMap[feature] || <Info className="h-4 w-4" />;
  };

  const getFeatureLabel = (feature: AccessibilityFeature): string => {
    const labelMap: Record<AccessibilityFeature, string> = {
      wheelchair_accessible: 'Wheelchair Accessible',
      hearing_loop: 'Hearing Loop Available',
      visual_aids: 'Visual Aids Provided',
      quiet_environment: 'Quiet Environment',
      adjustable_seating: 'Adjustable Seating',
      good_lighting: 'Good Lighting',
      accessible_restrooms: 'Accessible Restrooms',
      elevator_access: 'Elevator Access',
      sign_language_interpreter: 'Sign Language Interpreter',
      captioning_available: 'Captioning Available',
      assistive_technology: 'Assistive Technology'
    };
    return labelMap[feature] || feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getAccommodationIcon = (accommodation: AccommodationType) => {
    const iconMap: Record<AccommodationType, React.ReactNode> = {
      mobility: <Wheelchair className="h-4 w-4" />,
      visual: <Eye className="h-4 w-4" />,
      hearing: <Ear className="h-4 w-4" />,
      cognitive: <Brain className="h-4 w-4" />,
      learning: <Brain className="h-4 w-4" />,
      chronic_illness: <Heart className="h-4 w-4" />,
      mental_health: <Brain className="h-4 w-4" />,
      temporary_disability: <AlertTriangle className="h-4 w-4" />,
      other: <Info className="h-4 w-4" />
    };
    return iconMap[accommodation] || <Info className="h-4 w-4" />;
  };

  const checkCompatibility = (accommodation: AccommodationType): {
    compatible: boolean;
    availableFeatures: ClassAccessibility[];
    missingFeatures: string[];
  } => {
    const requiredFeatures: Record<AccommodationType, AccessibilityFeature[]> = {
      mobility: ['wheelchair_accessible', 'elevator_access', 'accessible_restrooms'],
      visual: ['visual_aids', 'good_lighting'],
      hearing: ['hearing_loop', 'sign_language_interpreter', 'captioning_available'],
      cognitive: ['quiet_environment', 'assistive_technology'],
      learning: ['quiet_environment', 'assistive_technology'],
      chronic_illness: ['adjustable_seating', 'accessible_restrooms'],
      mental_health: ['quiet_environment'],
      temporary_disability: ['wheelchair_accessible', 'adjustable_seating'],
      other: []
    };

    const required = requiredFeatures[accommodation] || [];
    const available = accessibilityFeatures.filter(f => 
      f.available && required.includes(f.accessibilityType as AccessibilityFeature)
    );
    const missing = required.filter(req => 
      !accessibilityFeatures.some(f => f.available && f.accessibilityType === req)
    );

    return {
      compatible: missing.length === 0 || available.length > 0,
      availableFeatures: available,
      missingFeatures: missing.map(f => getFeatureLabel(f))
    };
  };

  const availableFeatures = accessibilityFeatures.filter(f => f.available);
  const unavailableFeatures = accessibilityFeatures.filter(f => !f.available);

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {availableFeatures.map((feature) => (
          <Badge key={feature.id} variant="secondary" className="text-xs">
            {getFeatureIcon(feature.accessibilityType as AccessibilityFeature)}
            <span className="ml-1">{getFeatureLabel(feature.accessibilityType as AccessibilityFeature)}</span>
          </Badge>
        ))}
        {studentAccommodations.length > 0 && (
          <Badge variant="outline" className="text-xs">
            <CheckCircle className="h-3 w-3 mr-1" />
            Accommodations Supported
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5" />
          Accessibility Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Available Features */}
        {availableFeatures.length > 0 && (
          <div>
            <h4 className="font-medium text-green-700 mb-2 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Available Accessibility Features
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {availableFeatures.map((feature) => (
                <div key={feature.id} className="flex items-center gap-2 p-2 bg-green-50 rounded">
                  {getFeatureIcon(feature.accessibilityType as AccessibilityFeature)}
                  <div>
                    <span className="font-medium">{getFeatureLabel(feature.accessibilityType as AccessibilityFeature)}</span>
                    {feature.description && (
                      <p className="text-sm text-gray-600">{feature.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Student Accommodation Compatibility */}
        {studentAccommodations.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Your Accommodation Compatibility</h4>
            <div className="space-y-2">
              {studentAccommodations.map((accommodation) => {
                const compatibility = checkCompatibility(accommodation);
                return (
                  <div key={accommodation} className="border rounded p-3">
                    <div className="flex items-center gap-2 mb-2">
                      {getAccommodationIcon(accommodation)}
                      <span className="font-medium capitalize">
                        {accommodation.replace(/_/g, ' ')} Accommodation
                      </span>
                      {compatibility.compatible ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Supported
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Needs Arrangement
                        </Badge>
                      )}
                    </div>
                    
                    {compatibility.availableFeatures.length > 0 && (
                      <div className="text-sm text-green-700">
                        Available: {compatibility.availableFeatures.map(f => 
                          getFeatureLabel(f.accessibilityType as AccessibilityFeature)
                        ).join(', ')}
                      </div>
                    )}
                    
                    {compatibility.missingFeatures.length > 0 && (
                      <div className="text-sm text-orange-700">
                        May require arrangement: {compatibility.missingFeatures.join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Limitations and Alternatives */}
        {unavailableFeatures.length > 0 && (
          <div>
            <h4 className="font-medium text-orange-700 mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Limitations & Alternative Arrangements
            </h4>
            <div className="space-y-2">
              {unavailableFeatures.map((feature) => (
                <Alert key={feature.id} className="border-orange-200">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{getFeatureLabel(feature.accessibilityType as AccessibilityFeature)}</strong> is not available.
                    {feature.alternativeArrangements && (
                      <div className="mt-1 text-sm">
                        <strong>Alternative:</strong> {feature.alternativeArrangements}
                      </div>
                    )}
                    {feature.contactInfo && (
                      <div className="mt-1 text-sm flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        <strong>Contact:</strong> {feature.contactInfo}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </div>
        )}

        {/* Support Contact */}
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Need accommodation support?</strong>
            <br />
            Contact Disability Services: disabilities@institution.edu | (555) 123-4567
            <br />
            <span className="text-sm text-gray-600">
              We work with instructors to ensure all students have equal access to learning opportunities.
            </span>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default AccessibilityIndicators;