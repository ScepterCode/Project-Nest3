'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Clock, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { UserRole, UserRoleAssignment } from '@/lib/types/role-management';

interface RoleExtensionRequestProps {
  assignment: UserRoleAssignment;
  onRequestSubmitted?: (requestId: string) => void;
  onCancel?: () => void;
}

interface ExtensionRequestData {
  newExpirationDate: string;
  justification: string;
  urgency: 'low' | 'medium' | 'high';
  notifyAdmins: boolean;
}

const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  [UserRole.STUDENT]: 'Student',
  [UserRole.TEACHER]: 'Teacher',
  [UserRole.DEPARTMENT_ADMIN]: 'Department Administrator',
  [UserRole.INSTITUTION_ADMIN]: 'Institution Administrator',
  [UserRole.SYSTEM_ADMIN]: 'System Administrator'
};

const URGENCY_LABELS = {
  low: { label: 'Low', color: 'bg-green-100 text-green-800' },
  medium: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
  high: { label: 'High', color: 'bg-red-100 text-red-800' }
};

export function RoleExtensionRequestForm({
  assignment,
  onRequestSubmitted,
  onCancel
}: RoleExtensionRequestProps) {
  const [formData, setFormData] = useState<ExtensionRequestData>({
    newExpirationDate: '',
    justification: '',
    urgency: 'medium',
    notifyAdmins: true
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Calculate current expiration info
  const currentExpiration = assignment.expiresAt ? new Date(assignment.expiresAt) : null;
  const now = new Date();
  const isExpired = currentExpiration ? currentExpiration <= now : false;
  const daysUntilExpiration = currentExpiration 
    ? Math.ceil((currentExpiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Set minimum date (current expiration date or tomorrow, whichever is later)
  const minDate = currentExpiration && currentExpiration > now 
    ? currentExpiration.toISOString().split('T')[0]
    : new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Set maximum date to 1 year from current expiration or now
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 1);
  const maxDateString = maxDate.toISOString().split('T')[0];

  useEffect(() => {
    // Set default new expiration date to 30 days from current expiration
    if (currentExpiration) {
      const defaultNewDate = new Date(currentExpiration);
      defaultNewDate.setDate(defaultNewDate.getDate() + 30);
      setFormData(prev => ({
        ...prev,
        newExpirationDate: defaultNewDate.toISOString().split('T')[0]
      }));
    }
  }, [currentExpiration]);

  const handleInputChange = (field: keyof ExtensionRequestData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(null);
  };

  const validateForm = (): string | null => {
    if (!formData.newExpirationDate) {
      return 'New expiration date is required';
    }

    const newExpirationDate = new Date(formData.newExpirationDate);
    const currentExpirationDate = currentExpiration || now;

    if (newExpirationDate <= currentExpirationDate) {
      return 'New expiration date must be after the current expiration date';
    }

    if (newExpirationDate > maxDate) {
      return 'Extension cannot be more than 1 year from now';
    }

    if (!formData.justification.trim()) {
      return 'Justification is required for role extensions';
    }

    if (formData.justification.length < 20) {
      return 'Justification must be at least 20 characters long';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/roles/request-extension', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignmentId: assignment.id,
          newExpirationDate: new Date(formData.newExpirationDate).toISOString(),
          justification: formData.justification,
          urgency: formData.urgency,
          notifyAdmins: formData.notifyAdmins
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit extension request');
      }

      const result = await response.json();
      setSuccess('Extension request submitted successfully');
      
      if (onRequestSubmitted) {
        onRequestSubmitted(result.requestId);
      }

    } catch (error) {
      setError(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateExtensionDuration = () => {
    if (!formData.newExpirationDate || !currentExpiration) return '';
    
    const newDate = new Date(formData.newExpirationDate);
    const diffTime = newDate.getTime() - currentExpiration.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return '1 day';
    if (diffDays < 30) return `${diffDays} days`;
    if (diffDays < 365) return `${Math.round(diffDays / 30)} months`;
    return `${Math.round(diffDays / 365)} year`;
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Request Role Extension
        </CardTitle>
        <CardDescription>
          Request to extend your temporary role assignment beyond its current expiration date
        </CardDescription>
      </CardHeader>

      <CardContent>
        {/* Current Role Info */}
        <div className="mb-6 p-4 bg-muted rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">Current Role Assignment</h3>
            <Badge variant={isExpired ? "destructive" : "default"}>
              {ROLE_DISPLAY_NAMES[assignment.role]}
            </Badge>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Assigned:</span>
              <span className="ml-2">{assignment.assignedAt.toLocaleDateString()}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Current Expiration:</span>
              <span className="ml-2">
                {currentExpiration?.toLocaleDateString() || 'No expiration'}
              </span>
            </div>
          </div>

          {/* Expiration Status */}
          {currentExpiration && (
            <div className="mt-3">
              {isExpired ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This role has already expired. Extension requests for expired roles require additional approval.
                  </AlertDescription>
                </Alert>
              ) : daysUntilExpiration <= 7 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    This role expires in {daysUntilExpiration} day{daysUntilExpiration !== 1 ? 's' : ''}. 
                    Submit your extension request soon to avoid interruption.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* New Expiration Date */}
          <div className="space-y-2">
            <Label htmlFor="newExpirationDate">New Expiration Date</Label>
            <div className="flex items-center gap-2">
              <Input
                id="newExpirationDate"
                type="date"
                value={formData.newExpirationDate}
                onChange={(e) => handleInputChange('newExpirationDate', e.target.value)}
                min={minDate}
                max={maxDateString}
                className="flex-1"
              />
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            {formData.newExpirationDate && (
              <p className="text-sm text-muted-foreground">
                Extension duration: {calculateExtensionDuration()}
              </p>
            )}
          </div>

          {/* Urgency Level */}
          <div className="space-y-2">
            <Label>Request Urgency</Label>
            <div className="flex gap-2">
              {Object.entries(URGENCY_LABELS).map(([value, config]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleInputChange('urgency', value as 'low' | 'medium' | 'high')}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    formData.urgency === value
                      ? config.color
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {config.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              High urgency requests are prioritized but require stronger justification
            </p>
          </div>

          {/* Justification */}
          <div className="space-y-2">
            <Label htmlFor="justification">Justification for Extension</Label>
            <Textarea
              id="justification"
              value={formData.justification}
              onChange={(e) => handleInputChange('justification', e.target.value)}
              placeholder="Explain why you need to extend this role assignment. Include specific reasons, ongoing projects, or responsibilities that require continued access..."
              rows={4}
              className="resize-none"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Minimum 20 characters required</span>
              <span>{formData.justification.length}/1000 characters</span>
            </div>
          </div>

          {/* Notification Settings */}
          <div className="space-y-2">
            <Label>Notification Settings</Label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.notifyAdmins}
                onChange={(e) => handleInputChange('notifyAdmins', e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Notify administrators immediately</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Administrators will be notified about your extension request for review
            </p>
          </div>

          {/* Important Notes */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> Extension requests require administrator approval. 
              Your current role will remain active until the original expiration date, 
              even if the extension is pending review.
            </AlertDescription>
          </Alert>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success Display */}
          {success && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? 'Submitting Request...' : 'Submit Extension Request'}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}