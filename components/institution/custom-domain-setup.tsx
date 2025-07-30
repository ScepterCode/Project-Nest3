'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Clock, AlertTriangle, Copy } from 'lucide-react';

interface DNSRecord {
  type: 'CNAME' | 'A' | 'TXT';
  name: string;
  value: string;
  ttl?: number;
}

interface DomainValidationResult {
  isValid: boolean;
  records: {
    record: DNSRecord;
    status: 'valid' | 'invalid' | 'pending';
    message?: string;
  }[];
  sslStatus: 'pending' | 'valid' | 'invalid';
  lastChecked: Date;
}

interface CustomDomainSetupProps {
  institutionId: string;
  currentDomain?: string;
  onDomainUpdate: (domain: string) => Promise<{ success: boolean; errors?: any[] }>;
  onValidateDomain: (domain: string) => Promise<DomainValidationResult>;
  isLoading?: boolean;
  canCustomizeDomain?: boolean;
}

export function CustomDomainSetup({
  institutionId,
  currentDomain,
  onDomainUpdate,
  onValidateDomain,
  isLoading = false,
  canCustomizeDomain = true
}: CustomDomainSetupProps) {
  const [domain, setDomain] = useState(currentDomain || '');
  const [validationResult, setValidationResult] = useState<DomainValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'input' | 'dns' | 'validation' | 'complete'>('input');

  const requiredDNSRecords: DNSRecord[] = [
    {
      type: 'CNAME',
      name: domain || 'your-domain.com',
      value: `${institutionId}.platform.example.com`,
      ttl: 300
    },
    {
      type: 'TXT',
      name: `_platform-verification.${domain || 'your-domain.com'}`,
      value: `platform-verification=${institutionId}`,
      ttl: 300
    }
  ];

  useEffect(() => {
    if (currentDomain) {
      setDomain(currentDomain);
      if (currentDomain !== domain) {
        setStep('validation');
        handleValidation();
      }
    }
  }, [currentDomain]);

  const isValidDomain = (domain: string) => {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
    return domainRegex.test(domain);
  };

  const handleDomainChange = (value: string) => {
    setDomain(value);
    setErrors({});
    if (value && !isValidDomain(value)) {
      setErrors({ domain: 'Please enter a valid domain name' });
    }
  };

  const handleNext = () => {
    if (!domain) {
      setErrors({ domain: 'Domain is required' });
      return;
    }
    if (!isValidDomain(domain)) {
      setErrors({ domain: 'Please enter a valid domain name' });
      return;
    }
    setStep('dns');
  };

  const handleValidation = async () => {
    setIsValidating(true);
    setErrors({});
    
    try {
      const result = await onValidateDomain(domain);
      setValidationResult(result);
      
      if (result.isValid && result.sslStatus === 'valid') {
        setStep('complete');
        // Update the domain in the backend
        await onDomainUpdate(domain);
      } else {
        setStep('validation');
      }
    } catch (error) {
      setErrors({ validation: 'Failed to validate domain. Please try again.' });
    } finally {
      setIsValidating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getStatusIcon = (status: 'valid' | 'invalid' | 'pending') => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'invalid':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: 'valid' | 'invalid' | 'pending') => {
    const variants = {
      valid: 'default',
      invalid: 'destructive',
      pending: 'secondary'
    } as const;
    
    return (
      <Badge variant={variants[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (!canCustomizeDomain) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Custom Domain</CardTitle>
          <CardDescription>
            Custom domains are not available on your current plan.
            <Badge variant="outline" className="ml-2">Upgrade Required</Badge>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Custom Domain Setup</h2>
        <p className="text-muted-foreground">
          Configure a custom domain for your institution's portal
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center space-x-4">
        {['Domain', 'DNS Setup', 'Validation', 'Complete'].map((stepName, index) => {
          const stepIndex = ['input', 'dns', 'validation', 'complete'].indexOf(step);
          const isActive = index === stepIndex;
          const isCompleted = index < stepIndex;
          
          return (
            <div key={stepName} className="flex items-center">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${isCompleted ? 'bg-green-500 text-white' : 
                  isActive ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}
              `}>
                {isCompleted ? <CheckCircle className="h-4 w-4" /> : index + 1}
              </div>
              <span className={`ml-2 text-sm ${isActive ? 'font-medium' : 'text-gray-500'}`}>
                {stepName}
              </span>
              {index < 3 && <div className="w-8 h-px bg-gray-300 mx-4" />}
            </div>
          );
        })}
      </div>

      {/* Step 1: Domain Input */}
      {step === 'input' && (
        <Card>
          <CardHeader>
            <CardTitle>Enter Your Domain</CardTitle>
            <CardDescription>
              Enter the custom domain you want to use for your institution
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="domain">Custom Domain</Label>
              <Input
                id="domain"
                type="text"
                value={domain}
                onChange={(e) => handleDomainChange(e.target.value)}
                placeholder="portal.yourinstitution.edu"
                className={errors.domain ? 'border-red-500' : ''}
              />
              {errors.domain && (
                <p className="text-sm text-red-500">{errors.domain}</p>
              )}
              <p className="text-sm text-muted-foreground">
                Enter your domain without http:// or https://
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleNext} disabled={!domain || !!errors.domain}>
                Next: Configure DNS
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: DNS Configuration */}
      {step === 'dns' && (
        <Card>
          <CardHeader>
            <CardTitle>Configure DNS Records</CardTitle>
            <CardDescription>
              Add these DNS records to your domain provider to verify ownership
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You need to add these DNS records at your domain registrar or DNS provider.
                Changes may take up to 24 hours to propagate.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              {requiredDNSRecords.map((record, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{record.type} Record</h4>
                    <Badge variant="outline">{record.type}</Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <Label className="text-xs text-muted-foreground">Name/Host</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs flex-1">
                          {record.name}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(record.name)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      <Label className="text-xs text-muted-foreground">Value/Target</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs flex-1">
                          {record.value}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(record.value)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      <Label className="text-xs text-muted-foreground">TTL</Label>
                      <div className="mt-1">
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                          {record.ttl || 'Auto'}
                        </code>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setStep('input')} variant="outline">
                Back
              </Button>
              <Button onClick={() => setStep('validation')}>
                I've Added the Records
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Validation */}
      {step === 'validation' && (
        <Card>
          <CardHeader>
            <CardTitle>Domain Validation</CardTitle>
            <CardDescription>
              We're checking your DNS records and SSL certificate
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!validationResult && (
              <div className="text-center py-8">
                <Button onClick={handleValidation} disabled={isValidating}>
                  {isValidating ? 'Validating...' : 'Check DNS Records'}
                </Button>
              </div>
            )}

            {validationResult && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium">DNS Records Status</h4>
                  {validationResult.records.map((record, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(record.status)}
                        <span className="font-mono text-sm">{record.record.type}</span>
                        <span className="text-sm text-muted-foreground">
                          {record.record.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(record.status)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">SSL Certificate</h4>
                  <div className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(validationResult.sslStatus)}
                      <span className="text-sm">SSL Certificate</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(validationResult.sslStatus)}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Last checked: {validationResult.lastChecked.toLocaleString()}
                </div>

                {errors.validation && (
                  <Alert>
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>{errors.validation}</AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-2">
                  <Button onClick={() => setStep('dns')} variant="outline">
                    Back to DNS
                  </Button>
                  <Button onClick={handleValidation} disabled={isValidating}>
                    {isValidating ? 'Checking...' : 'Check Again'}
                  </Button>
                  {validationResult.isValid && validationResult.sslStatus === 'valid' && (
                    <Button onClick={() => setStep('complete')}>
                      Complete Setup
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Domain Setup Complete
            </CardTitle>
            <CardDescription>
              Your custom domain is now active and ready to use
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Your institution portal is now accessible at{' '}
                <a 
                  href={`https://${domain}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-medium underline"
                >
                  https://{domain}
                </a>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <h4 className="font-medium">Next Steps</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Update your institution's marketing materials with the new domain</li>
                <li>• Configure email templates to use the custom domain</li>
                <li>• Test all functionality on the new domain</li>
                <li>• Set up redirects from your old domain if needed</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setStep('input')} variant="outline">
                Change Domain
              </Button>
              <Button asChild>
                <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer">
                  Visit Your Portal
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}