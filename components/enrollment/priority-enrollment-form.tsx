'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Star, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  FileText,
  Users,
  Calendar
} from 'lucide-react';
import { StudentAccommodation, PriorityEnrollmentRequest } from '@/lib/types/accommodation';

interface PriorityEnrollmentFormProps {
  classId: string;
  className: string;
  studentId: string;
  studentAccommodations: StudentAccommodation[];
  onSubmit: (request: PriorityEnrollmentRequest) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const PriorityEnrollmentForm: React.FC<PriorityEnrollmentFormProps> = ({
  classId,
  className,
  studentId,
  studentAccommodations,
  onSubmit,
  onCancel,
  isSubmitting = false
}) => {
  const [selectedAccommodations, setSelectedAccommodations] = useState<string[]>([]);
  const [justification, setJustification] = useState('');
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [supportingDocs, setSupportingDocs] = useState<string[]>([]);
  const [newDocUrl, setNewDocUrl] = useState('');

  const verifiedAccommodations = studentAccommodations.filter(acc => acc.documentationVerified);
  const maxPriorityLevel = Math.max(...verifiedAccommodations.map(acc => acc.priorityLevel), 1);

  const handleAccommodationToggle = (accommodationId: string) => {
    setSelectedAccommodations(prev => 
      prev.includes(accommodationId)
        ? prev.filter(id => id !== accommodationId)
        : [...prev, accommodationId]
    );
  };

  const handleAddSupportingDoc = () => {
    if (newDocUrl.trim()) {
      setSupportingDocs(prev => [...prev, newDocUrl.trim()]);
      setNewDocUrl('');
    }
  };

  const handleRemoveSupportingDoc = (index: number) => {
    setSupportingDocs(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedAccommodations.length === 0) {
      alert('Please select at least one accommodation that requires priority enrollment.');
      return;
    }

    if (!justification.trim()) {
      alert('Please provide justification for priority enrollment.');
      return;
    }

    const request: PriorityEnrollmentRequest = {
      studentId,
      classId,
      accommodationIds: selectedAccommodations,
      justification: justification.trim(),
      priorityLevel: maxPriorityLevel,
      supportingDocumentation: supportingDocs,
      urgency
    };

    await onSubmit(request);
  };

  const getUrgencyColor = (level: string) => {
    const colors = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800'
    };
    return colors[level as keyof typeof colors] || colors.medium;
  };

  const getAccommodationTypeLabel = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (verifiedAccommodations.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You don't have any verified accommodations on file. To request priority enrollment, 
              please contact Disability Services to document your accommodations.
              <br />
              <strong>Contact:</strong> disabilities@institution.edu | (555) 123-4567
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500" />
          Priority Enrollment Request
        </CardTitle>
        <p className="text-sm text-gray-600">
          Request priority enrollment for <strong>{className}</strong> based on your documented accommodations.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Current Priority Level */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-blue-600" />
              <span className="font-medium">Your Priority Level: {maxPriorityLevel}</span>
            </div>
            <p className="text-sm text-gray-600">
              Based on your verified accommodations, you qualify for priority level {maxPriorityLevel} enrollment.
            </p>
          </div>

          {/* Accommodation Selection */}
          <div>
            <Label className="text-base font-medium">Select Relevant Accommodations</Label>
            <p className="text-sm text-gray-600 mb-3">
              Choose the accommodations that require priority enrollment for this class.
            </p>
            <div className="space-y-3">
              {verifiedAccommodations.map((accommodation) => (
                <div key={accommodation.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                  <Checkbox
                    id={accommodation.id}
                    checked={selectedAccommodations.includes(accommodation.id)}
                    onCheckedChange={() => handleAccommodationToggle(accommodation.id)}
                  />
                  <div className="flex-1">
                    <Label htmlFor={accommodation.id} className="cursor-pointer">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">
                          {getAccommodationTypeLabel(accommodation.accommodationType)}
                        </span>
                        <Badge variant="secondary" className={`text-xs ${
                          accommodation.priorityLevel === 3 ? 'bg-red-100 text-red-800' :
                          accommodation.priorityLevel === 2 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          Priority {accommodation.priorityLevel}
                        </Badge>
                        {accommodation.documentationVerified && (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{accommodation.description}</p>
                      {accommodation.expiresAt && (
                        <p className="text-xs text-orange-600 flex items-center gap-1 mt-1">
                          <Calendar className="h-3 w-3" />
                          Expires: {new Date(accommodation.expiresAt).toLocaleDateString()}
                        </p>
                      )}
                    </Label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Justification */}
          <div>
            <Label htmlFor="justification" className="text-base font-medium">
              Justification for Priority Enrollment
            </Label>
            <p className="text-sm text-gray-600 mb-2">
              Explain why priority enrollment is necessary for this specific class.
            </p>
            <Textarea
              id="justification"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Please explain how your accommodations require priority enrollment for this class. For example: limited accessible seating, need for specific room arrangements, scheduling conflicts with medical appointments, etc."
              rows={4}
              required
            />
          </div>

          {/* Urgency Level */}
          <div>
            <Label className="text-base font-medium">Request Urgency</Label>
            <p className="text-sm text-gray-600 mb-2">
              How urgent is this enrollment request?
            </p>
            <Select value={urgency} onValueChange={(value: any) => setUrgency(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    Low - Standard processing time acceptable
                  </div>
                </SelectItem>
                <SelectItem value="medium">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                    Medium - Prefer expedited processing
                  </div>
                </SelectItem>
                <SelectItem value="high">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                    High - Time-sensitive due to accommodation needs
                  </div>
                </SelectItem>
                <SelectItem value="critical">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    Critical - Immediate processing required
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Supporting Documentation */}
          <div>
            <Label className="text-base font-medium">Supporting Documentation (Optional)</Label>
            <p className="text-sm text-gray-600 mb-2">
              Add links to additional documentation that supports your request.
            </p>
            <div className="flex gap-2 mb-2">
              <Input
                value={newDocUrl}
                onChange={(e) => setNewDocUrl(e.target.value)}
                placeholder="Enter document URL or reference"
              />
              <Button type="button" onClick={handleAddSupportingDoc} variant="outline">
                Add
              </Button>
            </div>
            {supportingDocs.length > 0 && (
              <div className="space-y-1">
                {supportingDocs.map((doc, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                    <FileText className="h-4 w-4" />
                    <span className="flex-1 text-sm">{doc}</span>
                    <Button
                      type="button"
                      onClick={() => handleRemoveSupportingDoc(index)}
                      variant="ghost"
                      size="sm"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Processing Information */}
          <Alert className="border-blue-200 bg-blue-50">
            <Clock className="h-4 w-4" />
            <AlertDescription>
              <strong>Processing Time:</strong> Priority enrollment requests are typically processed within 1-2 business days. 
              You will receive email notification once your request is reviewed.
              <br />
              <strong>Questions?</strong> Contact Disability Services at disabilities@institution.edu
            </AlertDescription>
          </Alert>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button 
              type="submit" 
              disabled={isSubmitting || selectedAccommodations.length === 0}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Submitting Request...
                </>
              ) : (
                <>
                  <Star className="h-4 w-4 mr-2" />
                  Submit Priority Request
                </>
              )}
            </Button>
            <Button type="button" onClick={onCancel} variant="outline">
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default PriorityEnrollmentForm;