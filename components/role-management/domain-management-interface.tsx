'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Checkbox } from '../ui/checkbox';
import { Textarea } from '../ui/textarea';
import { 
  Plus, 
  Check, 
  X, 
  AlertCircle, 
  Globe, 
  Shield, 
  Copy,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { UserRole } from '../../lib/types/role-management';

interface InstitutionDomain {
  id: string;
  domain: string;
  verified: boolean;
  autoApproveRoles: UserRole[];
  verificationToken?: string;
  verificationMethod?: string;
  createdAt: string;
  verifiedAt?: string;
}

interface DomainManagementInterfaceProps {
  institutionId: string;
  onLoadDomains: (institutionId: string) => Promise<InstitutionDomain[]>;
  onAddDomain: (institutionId: string, domain: string, autoApproveRoles: UserRole[]) => Promise<InstitutionDomain>;
  onVerifyDomain: (domainId: string, verificationToken: string) => Promise<boolean>;
  onRemoveDomain?: (domainId: string) => Promise<void>;
}

const ROLE_LABELS = {
  [UserRole.STUDENT]: 'Student',
  [UserRole.TEACHER]: 'Teacher',
  [UserRole.DEPARTMENT_ADMIN]: 'Department Admin',
  [UserRole.INSTITUTION_ADMIN]: 'Institution Admin'
};

const AVAILABLE_ROLES = [
  UserRole.STUDENT,
  UserRole.TEACHER,
  UserRole.DEPARTMENT_ADMIN
];

export function DomainManagementInterface({
  institutionId,
  onLoadDomains,
  onAddDomain,
  onVerifyDomain,
  onRemoveDomain
}: DomainManagementInterfaceProps) {
  const [domains, setDomains] = useState<InstitutionDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationTokens, setVerificationTokens] = useState<Record<string, string>>({});

  useEffect(() => {
    loadDomains();
  }, [institutionId]);

  const loadDomains = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await onLoadDomains(institutionId);
      setDomains(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load domains');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newDomain.trim()) {
      setError('Domain is required');
      return;
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
    if (!domainRegex.test(newDomain.trim())) {
      setError('Please enter a valid domain name');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      
      const domain = await onAddDomain(
        institutionId,
        newDomain.trim().toLowerCase(),
        selectedRoles
      );
      
      setDomains([...domains, domain]);
      setNewDomain('');
      setSelectedRoles([]);
      setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add domain');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyDomain = async (domain: InstitutionDomain) => {
    const token = verificationTokens[domain.id];
    if (!token?.trim()) {
      setError('Please enter the verification token');
      return;
    }

    try {
      setError(null);
      const isVerified = await onVerifyDomain(domain.id, token.trim());
      
      if (isVerified) {
        // Update domain in local state
        setDomains(domains.map(d => 
          d.id === domain.id 
            ? { ...d, verified: true, verifiedAt: new Date().toISOString() }
            : d
        ));
        setVerificationTokens({ ...verificationTokens, [domain.id]: '' });
      } else {
        setError('Domain verification failed. Please check the token and try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify domain');
    }
  };

  const handleRoleToggle = (role: UserRole, checked: boolean) => {
    if (checked) {
      setSelectedRoles([...selectedRoles, role]);
    } else {
      setSelectedRoles(selectedRoles.filter(r => r !== role));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString));
  };

  const getDNSInstructions = (domain: InstitutionDomain) => {
    if (!domain.verificationToken) return null;
    
    return {
      recordType: 'TXT',
      name: `_kiro-verification.${domain.domain}`,
      value: domain.verificationToken
    };
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading domains...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Domain Management</h2>
          <p className="text-muted-foreground">
            Configure email domains for automatic role verification
          </p>
        </div>
        
        <Button onClick={() => setShowAddForm(true)} disabled={showAddForm}>
          <Plus className="h-4 w-4 mr-2" />
          Add Domain
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Add Domain Form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Domain</CardTitle>
            <CardDescription>
              Add an email domain that belongs to your institution for automatic role verification.
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleAddDomain} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="domain">Domain Name</Label>
                <Input
                  id="domain"
                  type="text"
                  placeholder="university.edu"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Enter the domain without "www" or protocol (e.g., university.edu)
                </p>
              </div>

              <div className="space-y-3">
                <Label>Auto-Approve Roles</Label>
                <p className="text-sm text-muted-foreground">
                  Select which roles should be automatically approved for users with verified email addresses from this domain.
                </p>
                
                <div className="space-y-2">
                  {AVAILABLE_ROLES.map(role => (
                    <div key={role} className="flex items-center space-x-2">
                      <Checkbox
                        id={`role-${role}`}
                        checked={selectedRoles.includes(role)}
                        onCheckedChange={(checked) => handleRoleToggle(role, checked as boolean)}
                      />
                      <Label htmlFor={`role-${role}`} className="text-sm">
                        {ROLE_LABELS[role]}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewDomain('');
                    setSelectedRoles([]);
                    setError(null);
                  }}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Adding...' : 'Add Domain'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Domains List */}
      <div className="space-y-4">
        {domains.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Domains Configured
              </h3>
              <p className="text-gray-500 mb-4">
                Add email domains to enable automatic role verification for your institution.
              </p>
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Domain
              </Button>
            </CardContent>
          </Card>
        ) : (
          domains.map((domain) => {
            const dnsInstructions = getDNSInstructions(domain);
            
            return (
              <Card key={domain.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Globe className="h-5 w-5 text-blue-500" />
                      <div>
                        <CardTitle className="text-lg">{domain.domain}</CardTitle>
                        <CardDescription>
                          Added {formatDate(domain.createdAt)}
                          {domain.verifiedAt && ` • Verified ${formatDate(domain.verifiedAt)}`}
                        </CardDescription>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {domain.verified ? (
                        <Badge className="bg-green-100 text-green-800">
                          <Check className="h-3 w-3 mr-1" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Pending Verification
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* Auto-Approve Roles */}
                  <div>
                    <Label className="text-sm font-medium">Auto-Approve Roles</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {domain.autoApproveRoles.length === 0 ? (
                        <span className="text-sm text-muted-foreground">None</span>
                      ) : (
                        domain.autoApproveRoles.map(role => (
                          <Badge key={role} variant="outline">
                            {ROLE_LABELS[role]}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Verification Instructions */}
                  {!domain.verified && dnsInstructions && (
                    <div className="space-y-3">
                      <div className="border-t pt-4">
                        <Label className="text-sm font-medium">Domain Verification</Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Add the following DNS TXT record to verify domain ownership:
                        </p>
                      </div>
                      
                      <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <Label className="font-medium">Record Type</Label>
                            <div className="flex items-center space-x-2 mt-1">
                              <code className="bg-white px-2 py-1 rounded border">
                                {dnsInstructions.recordType}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(dnsInstructions.recordType)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          
                          <div>
                            <Label className="font-medium">Name</Label>
                            <div className="flex items-center space-x-2 mt-1">
                              <code className="bg-white px-2 py-1 rounded border text-xs">
                                {dnsInstructions.name}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(dnsInstructions.name)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          
                          <div>
                            <Label className="font-medium">Value</Label>
                            <div className="flex items-center space-x-2 mt-1">
                              <code className="bg-white px-2 py-1 rounded border text-xs">
                                {dnsInstructions.value}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(dnsInstructions.value)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        
                        <Alert>
                          <Shield className="h-4 w-4" />
                          <AlertDescription>
                            After adding the DNS record, it may take up to 24 hours to propagate. 
                            You can verify the domain once the DNS record is active.
                          </AlertDescription>
                        </Alert>
                      </div>

                      {/* Verification Form */}
                      <div className="flex items-center space-x-3">
                        <Input
                          placeholder="Enter verification token to confirm"
                          value={verificationTokens[domain.id] || ''}
                          onChange={(e) => setVerificationTokens({
                            ...verificationTokens,
                            [domain.id]: e.target.value
                          })}
                        />
                        <Button
                          onClick={() => handleVerifyDomain(domain)}
                          disabled={!verificationTokens[domain.id]?.trim()}
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Verify
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Verified Status */}
                  {domain.verified && (
                    <div className="border-t pt-4">
                      <div className="flex items-center space-x-2 text-green-600">
                        <Check className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          Domain verified and active for automatic role approval
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}