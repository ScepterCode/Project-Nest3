'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  IntegrationType, 
  IntegrationProvider, 
  SSOConfig, 
  OAuth2Config, 
  SISConfig, 
  LMSConfig 
} from '@/lib/types/integration';
import { CheckCircle, AlertCircle, Loader2, ArrowLeft, ArrowRight } from 'lucide-react';

interface IntegrationSetupWizardProps {
  institutionId: string;
  onComplete: (integration: any) => void;
  onCancel: () => void;
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<any>;
}

export function IntegrationSetupWizard({ 
  institutionId, 
  onComplete, 
  onCancel 
}: IntegrationSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [integrationType, setIntegrationType] = useState<IntegrationType | null>(null);
  const [provider, setProvider] = useState<IntegrationProvider | null>(null);
  const [config, setConfig] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    responseTime?: number;
  } | null>(null);

  const steps: WizardStep[] = [
    {
      id: 'type',
      title: 'Integration Type',
      description: 'Choose the type of integration you want to set up',
      component: TypeSelectionStep,
    },
    {
      id: 'provider',
      title: 'Provider Selection',
      description: 'Select your specific provider',
      component: ProviderSelectionStep,
    },
    {
      id: 'configuration',
      title: 'Configuration',
      description: 'Configure your integration settings',
      component: ConfigurationStep,
    },
    {
      id: 'test',
      title: 'Test Connection',
      description: 'Test your integration configuration',
      component: TestConnectionStep,
    },
    {
      id: 'review',
      title: 'Review & Complete',
      description: 'Review your settings and complete setup',
      component: ReviewStep,
    },
  ];

  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleTestConnection = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: integrationType,
          provider,
          config,
        }),
      });

      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Failed to test connection',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutionId,
          type: integrationType,
          provider,
          name: `${provider} Integration`,
          config,
        }),
      });

      if (response.ok) {
        const integration = await response.json();
        onComplete(integration);
      } else {
        throw new Error('Failed to create integration');
      }
    } catch (error) {
      console.error('Failed to create integration:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const CurrentStepComponent = steps[currentStep].component;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Integration Setup Wizard</CardTitle>
              <CardDescription>
                Step {currentStep + 1} of {steps.length}: {steps[currentStep].description}
              </CardDescription>
            </div>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
          <Progress value={progress} className="mt-4" />
        </CardHeader>
        <CardContent>
          <CurrentStepComponent
            integrationType={integrationType}
            setIntegrationType={setIntegrationType}
            provider={provider}
            setProvider={setProvider}
            config={config}
            setConfig={setConfig}
            testResult={testResult}
            onTestConnection={handleTestConnection}
            isLoading={isLoading}
          />

          <div className="flex justify-between mt-8">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 0}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>

            {currentStep === steps.length - 1 ? (
              <Button onClick={handleComplete} disabled={isLoading}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Complete Setup
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={
                  (currentStep === 0 && !integrationType) ||
                  (currentStep === 1 && !provider) ||
                  (currentStep === 3 && (!testResult || !testResult.success))
                }
              >
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TypeSelectionStep({ integrationType, setIntegrationType }: any) {
  const integrationTypes = [
    {
      type: 'sso' as IntegrationType,
      title: 'Single Sign-On (SSO)',
      description: 'Allow users to log in with your existing authentication system',
      icon: '🔐',
    },
    {
      type: 'sis' as IntegrationType,
      title: 'Student Information System (SIS)',
      description: 'Sync student data, courses, and enrollments',
      icon: '🎓',
    },
    {
      type: 'lms' as IntegrationType,
      title: 'Learning Management System (LMS)',
      description: 'Integrate with your existing LMS for assignments and grades',
      icon: '📚',
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Select Integration Type</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {integrationTypes.map((type) => (
          <Card
            key={type.type}
            className={`cursor-pointer transition-colors ${
              integrationType === type.type
                ? 'border-blue-500 bg-blue-50'
                : 'hover:border-gray-300'
            }`}
            onClick={() => setIntegrationType(type.type)}
          >
            <CardContent className="p-6 text-center">
              <div className="text-4xl mb-4">{type.icon}</div>
              <h4 className="font-semibold mb-2">{type.title}</h4>
              <p className="text-sm text-gray-600">{type.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ProviderSelectionStep({ integrationType, provider, setProvider }: any) {
  const getProviders = (type: IntegrationType): { value: IntegrationProvider; label: string; description: string }[] => {
    switch (type) {
      case 'sso':
        return [
          { value: 'saml', label: 'SAML 2.0', description: 'Generic SAML 2.0 provider' },
          { value: 'oauth2', label: 'OAuth 2.0', description: 'Generic OAuth 2.0 provider' },
          { value: 'google', label: 'Google Workspace', description: 'Google SSO integration' },
          { value: 'microsoft', label: 'Microsoft Azure AD', description: 'Microsoft SSO integration' },
          { value: 'okta', label: 'Okta', description: 'Okta identity provider' },
          { value: 'auth0', label: 'Auth0', description: 'Auth0 identity platform' },
        ];
      case 'sis':
        return [
          { value: 'powerschool', label: 'PowerSchool', description: 'PowerSchool SIS integration' },
          { value: 'infinite_campus', label: 'Infinite Campus', description: 'Infinite Campus SIS' },
          { value: 'skyward', label: 'Skyward', description: 'Skyward Student Management' },
          { value: 'clever', label: 'Clever', description: 'Clever data platform' },
          { value: 'classlink', label: 'ClassLink', description: 'ClassLink identity management' },
        ];
      case 'lms':
        return [
          { value: 'canvas', label: 'Canvas', description: 'Instructure Canvas LMS' },
          { value: 'blackboard', label: 'Blackboard', description: 'Blackboard Learn' },
          { value: 'moodle', label: 'Moodle', description: 'Moodle LMS platform' },
          { value: 'schoology', label: 'Schoology', description: 'Schoology learning platform' },
          { value: 'd2l', label: 'D2L Brightspace', description: 'D2L Brightspace LMS' },
        ];
      default:
        return [];
    }
  };

  const providers = getProviders(integrationType);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Select Provider</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {providers.map((providerOption) => (
          <Card
            key={providerOption.value}
            className={`cursor-pointer transition-colors ${
              provider === providerOption.value
                ? 'border-blue-500 bg-blue-50'
                : 'hover:border-gray-300'
            }`}
            onClick={() => setProvider(providerOption.value)}
          >
            <CardContent className="p-4">
              <h4 className="font-semibold mb-2">{providerOption.label}</h4>
              <p className="text-sm text-gray-600">{providerOption.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ConfigurationStep({ integrationType, provider, config, setConfig }: any) {
  const updateConfig = (field: string, value: any) => {
    setConfig((prev: any) => ({ ...prev, [field]: value }));
  };

  const updateNestedConfig = (parent: string, field: string, value: any) => {
    setConfig((prev: any) => ({
      ...prev,
      [parent]: {
        ...prev[parent],
        [field]: value,
      },
    }));
  };

  if (integrationType === 'sso') {
    return <SSOConfigurationForm provider={provider} config={config} updateConfig={updateConfig} updateNestedConfig={updateNestedConfig} />;
  } else if (integrationType === 'sis') {
    return <SISConfigurationForm provider={provider} config={config} updateConfig={updateConfig} updateNestedConfig={updateNestedConfig} />;
  } else if (integrationType === 'lms') {
    return <LMSConfigurationForm provider={provider} config={config} updateConfig={updateConfig} updateNestedConfig={updateNestedConfig} />;
  }

  return <div>Configuration form not available for this integration type.</div>;
}

function SSOConfigurationForm({ provider, config, updateConfig, updateNestedConfig }: any) {
  if (provider === 'saml') {
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold">SAML Configuration</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="entityId">Entity ID</Label>
            <Input
              id="entityId"
              value={config.entityId || ''}
              onChange={(e) => updateConfig('entityId', e.target.value)}
              placeholder="https://your-idp.com/entity"
            />
          </div>
          
          <div>
            <Label htmlFor="ssoUrl">SSO URL</Label>
            <Input
              id="ssoUrl"
              value={config.ssoUrl || ''}
              onChange={(e) => updateConfig('ssoUrl', e.target.value)}
              placeholder="https://your-idp.com/sso"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="certificate">X.509 Certificate</Label>
          <Textarea
            id="certificate"
            value={config.certificate || ''}
            onChange={(e) => updateConfig('certificate', e.target.value)}
            placeholder="-----BEGIN CERTIFICATE-----"
            rows={6}
          />
        </div>

        <div>
          <h4 className="font-semibold mb-4">Attribute Mapping</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="emailAttr">Email Attribute</Label>
              <Input
                id="emailAttr"
                value={config.attributeMapping?.email || ''}
                onChange={(e) => updateNestedConfig('attributeMapping', 'email', e.target.value)}
                placeholder="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
              />
            </div>
            
            <div>
              <Label htmlFor="firstNameAttr">First Name Attribute</Label>
              <Input
                id="firstNameAttr"
                value={config.attributeMapping?.firstName || ''}
                onChange={(e) => updateNestedConfig('attributeMapping', 'firstName', e.target.value)}
                placeholder="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // OAuth2 configuration
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">OAuth 2.0 Configuration</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="clientId">Client ID</Label>
          <Input
            id="clientId"
            value={config.clientId || ''}
            onChange={(e) => updateConfig('clientId', e.target.value)}
          />
        </div>
        
        <div>
          <Label htmlFor="clientSecret">Client Secret</Label>
          <Input
            id="clientSecret"
            type="password"
            value={config.clientSecret || ''}
            onChange={(e) => updateConfig('clientSecret', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="authUrl">Authorization URL</Label>
          <Input
            id="authUrl"
            value={config.authorizationUrl || ''}
            onChange={(e) => updateConfig('authorizationUrl', e.target.value)}
          />
        </div>
        
        <div>
          <Label htmlFor="tokenUrl">Token URL</Label>
          <Input
            id="tokenUrl"
            value={config.tokenUrl || ''}
            onChange={(e) => updateConfig('tokenUrl', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

function SISConfigurationForm({ provider, config, updateConfig, updateNestedConfig }: any) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">SIS Configuration</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="apiUrl">API URL</Label>
          <Input
            id="apiUrl"
            value={config.apiUrl || ''}
            onChange={(e) => updateConfig('apiUrl', e.target.value)}
            placeholder="https://api.powerschool.com"
          />
        </div>
        
        <div>
          <Label htmlFor="apiKey">API Key</Label>
          <Input
            id="apiKey"
            type="password"
            value={config.apiKey || ''}
            onChange={(e) => updateConfig('apiKey', e.target.value)}
          />
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-4">Sync Settings</h4>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="syncUsers">Sync Users</Label>
            <Switch
              id="syncUsers"
              checked={config.syncSettings?.syncUsers || false}
              onCheckedChange={(checked) => updateNestedConfig('syncSettings', 'syncUsers', checked)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="syncCourses">Sync Courses</Label>
            <Switch
              id="syncCourses"
              checked={config.syncSettings?.syncCourses || false}
              onCheckedChange={(checked) => updateNestedConfig('syncSettings', 'syncCourses', checked)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function LMSConfigurationForm({ provider, config, updateConfig, updateNestedConfig }: any) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">LMS Configuration</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="apiUrl">API URL</Label>
          <Input
            id="apiUrl"
            value={config.apiUrl || ''}
            onChange={(e) => updateConfig('apiUrl', e.target.value)}
            placeholder="https://canvas.instructure.com"
          />
        </div>
        
        <div>
          <Label htmlFor="accessToken">Access Token</Label>
          <Input
            id="accessToken"
            type="password"
            value={config.accessToken || ''}
            onChange={(e) => updateConfig('accessToken', e.target.value)}
          />
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-4">Sync Settings</h4>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="syncCourses">Sync Courses</Label>
            <Switch
              id="syncCourses"
              checked={config.syncSettings?.syncCourses || false}
              onCheckedChange={(checked) => updateNestedConfig('syncSettings', 'syncCourses', checked)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="syncAssignments">Sync Assignments</Label>
            <Switch
              id="syncAssignments"
              checked={config.syncSettings?.syncAssignments || false}
              onCheckedChange={(checked) => updateNestedConfig('syncSettings', 'syncAssignments', checked)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TestConnectionStep({ testResult, onTestConnection, isLoading }: any) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Test Connection</h3>
      <p className="text-gray-600">
        Test your integration configuration to ensure it's working correctly.
      </p>

      <div className="flex justify-center">
        <Button onClick={onTestConnection} disabled={isLoading}>
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Test Connection
        </Button>
      </div>

      {testResult && (
        <Card className={testResult.success ? 'border-green-500' : 'border-red-500'}>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              {testResult.success ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500" />
              )}
              <span className={testResult.success ? 'text-green-700' : 'text-red-700'}>
                {testResult.message}
              </span>
            </div>
            {testResult.responseTime && (
              <p className="text-sm text-gray-600 mt-2">
                Response time: {testResult.responseTime}ms
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReviewStep({ integrationType, provider, config }: any) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Review Configuration</h3>
      
      <div className="space-y-4">
        <div>
          <Label>Integration Type</Label>
          <p className="text-sm text-gray-600 capitalize">{integrationType}</p>
        </div>
        
        <div>
          <Label>Provider</Label>
          <p className="text-sm text-gray-600">{provider}</p>
        </div>
        
        <div>
          <Label>Configuration Summary</Label>
          <Card>
            <CardContent className="p-4">
              <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                {JSON.stringify(config, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}