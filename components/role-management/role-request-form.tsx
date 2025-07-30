"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { 
  UserPlus, 
  AlertCircle, 
  CheckCircle, 
  Info,
  Clock,
  Shield
} from "lucide-react"
import { UserRole } from "@/lib/types/role-management"
import { useSupabase } from "@/components/session-provider"

interface RoleRequestFormProps {
  userId: string
  currentRole?: UserRole
  institutionId: string
  departmentId?: string
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
}

export function RoleRequestForm({ 
  userId, 
  currentRole, 
  institutionId, 
  departmentId,
  onSuccess,
  onCancel,
  className 
}: RoleRequestFormProps) {
  const supabase = useSupabase()
  const [requestedRole, setRequestedRole] = useState<UserRole | ''>('')
  const [justification, setJustification] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const availableRoles = [
    { value: UserRole.TEACHER, label: 'Teacher', description: 'Create and manage classes, grade assignments' },
    { value: UserRole.DEPARTMENT_ADMIN, label: 'Department Admin', description: 'Manage department users and settings' },
    { value: UserRole.INSTITUTION_ADMIN, label: 'Institution Admin', description: 'Manage institution-wide settings and users' }
  ]

  const getRoleRequirements = (role: UserRole): string[] => {
    switch (role) {
      case UserRole.TEACHER:
        return [
          'Valid institutional email address',
          'Teaching credentials or employment verification',
          'Department approval may be required'
        ]
      case UserRole.DEPARTMENT_ADMIN:
        return [
          'Current teacher or staff member',
          'Administrative responsibilities within department',
          'Department head or institution admin approval required'
        ]
      case UserRole.INSTITUTION_ADMIN:
        return [
          'Senior administrative role at institution',
          'Authority to manage institutional policies',
          'Current institution admin approval required'
        ]
      default:
        return []
    }
  }

  const getVerificationMethod = (role: UserRole): string => {
    switch (role) {
      case UserRole.TEACHER:
        return 'Email domain verification or manual review'
      case UserRole.DEPARTMENT_ADMIN:
      case UserRole.INSTITUTION_ADMIN:
        return 'Admin approval required'
      default:
        return 'Automatic'
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!requestedRole || !justification.trim()) {
      setError('Please select a role and provide justification')
      return
    }

    if (requestedRole === currentRole) {
      setError('You already have this role')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // Submit role request
      const { error: submitError } = await supabase
        .from('role_requests')
        .insert({
          user_id: userId,
          requested_role: requestedRole,
          current_role: currentRole,
          justification: justification.trim(),
          status: 'pending',
          verification_method: getVerificationMethod(requestedRole as UserRole).includes('approval') 
            ? 'admin_approval' 
            : 'email_domain',
          institution_id: institutionId,
          department_id: departmentId,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
        })

      if (submitError) throw submitError

      setSuccess(true)
      
      // Reset form
      setRequestedRole('')
      setJustification('')
      
      // Call success callback after a delay to show success message
      setTimeout(() => {
        onSuccess?.()
      }, 2000)

    } catch (err) {
      console.error('Error submitting role request:', err)
      setError(err instanceof Error ? err.message : 'Failed to submit role request')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center">
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Request Submitted Successfully</h3>
            <p className="text-muted-foreground mb-4">
              Your role request has been submitted and is now pending review. 
              You'll be notified once it's been processed.
            </p>
            <div className="flex items-center justify-center text-sm text-muted-foreground">
              <Clock className="h-4 w-4 mr-2" />
              Typical review time: 1-3 business days
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center">
          <UserPlus className="h-5 w-5 mr-2" />
          Request Role Change
        </CardTitle>
        <CardDescription>
          Request additional permissions by changing your role. All requests require justification and may need approval.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Current Role Display */}
          {currentRole && (
            <div>
              <Label className="text-sm font-medium">Current Role</Label>
              <div className="mt-1">
                <Badge variant="secondary">
                  {currentRole.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Badge>
              </div>
            </div>
          )}

          {/* Role Selection */}
          <div className="space-y-2">
            <Label htmlFor="role">Requested Role *</Label>
            <Select value={requestedRole} onValueChange={(value) => setRequestedRole(value as UserRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role to request" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    <div>
                      <div className="font-medium">{role.label}</div>
                      <div className="text-xs text-muted-foreground">{role.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Role Requirements */}
          {requestedRole && (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="font-medium">Requirements for {availableRoles.find(r => r.value === requestedRole)?.label}:</div>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {getRoleRequirements(requestedRole as UserRole).map((req, index) => (
                      <li key={index}>{req}</li>
                    ))}
                  </ul>
                  <div className="text-sm mt-2">
                    <strong>Verification:</strong> {getVerificationMethod(requestedRole as UserRole)}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Justification */}
          <div className="space-y-2">
            <Label htmlFor="justification">Justification *</Label>
            <Textarea
              id="justification"
              placeholder="Please explain why you need this role and how you plan to use the additional permissions..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={4}
              required
            />
            <div className="text-xs text-muted-foreground">
              Provide specific details about your responsibilities and why this role is necessary.
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Info Alert */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Role requests are reviewed by administrators and typically processed within 1-3 business days. 
              You'll receive an email notification once your request is approved or denied.
            </AlertDescription>
          </Alert>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button 
              type="submit" 
              disabled={isSubmitting || !requestedRole || !justification.trim()}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Submitting...
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}