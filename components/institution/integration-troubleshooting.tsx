'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  IntegrationConfig, 
  IntegrationHealth, 
  SyncJob 
} from '@/lib/types/integration';
import { 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  Search, 
  Download, 
  Bug, 
  Wrench, 
  FileText, 
  ExternalLink,
  Copy,
  Play,
  Loader2
} from 'lucide-react';

interface IntegrationTroubleshootingProps {
  institutionId: string;
}

interface DiagnosticResult {
  category: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
  details?: string;
  resolution?: string;
}

interface ErrorPattern {
  id: string;
  pattern: string;
  description: string;
  category: 'connection' | 'authentication' | 'data' | 'configuration';
  commonCauses: string[];
  resolutionSteps: string[];
}

export function IntegrationTroubleshooting({ institutionId }: IntegrationTroubleshootingProps) {
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState<string>('');
  const [diagnosticResults, setDiagnosticResults] = useState<DiagnosticResult[]>([]);
  const [recentErrors, setRecentErrors] = useState<any[]>([]);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [errorPatterns, setErrorPatterns] = useState<ErrorPattern[]>([]);

  useEffect(() => {
    loadData();
    loadErrorPatterns();
  }, [institutionId]);

  const loadData = async () => {
    try {
      const [integrationsRes, errorsRes] = await Promise.all([
        fetch(`/api/institutions/${institutionId}/integrations`),
        fetch(`/api/institutions/${institutionId}/integration-errors?limit=50`),
      ]);

      const [integrationsData, errorsData] = await Promise.all([
        integrationsRes.json(),
        errorsRes.json(),
      ]);

      setIntegrations(integrationsData);
      setRecentErrors(errorsData);
    } catch (error) {
      console.error('Failed to load troubleshooting data:', error);
    }
  };

  const loadErrorPatterns = async () => {
    // In a real implementation, this would load from a knowledge base
    const patterns: ErrorPattern[] = [
      {
        id: '1',
        pattern: 'Connection timeout',
        description: 'Request timed out while connecting to the integration endpoint',
        category: 'connection',
        commonCauses: [
          'Network connectivity issues',
          'Firewall blocking requests',
          'Integration service is down',
          'Incorrect endpoint URL'
        ],
        resolutionSteps: [
          'Check network connectivity',
          'Verify firewall settings',
          'Test endpoint URL manually',
          'Contact integration provider support'
        ]
      },
      {
        id: '2',
        pattern: 'Authentication failed',
        description: 'Unable to authenticate with the integration service',
        category: 'authentication',
        commonCauses: [
          'Invalid API key or credentials',
          'Expired authentication token',
          'Incorrect authentication method',
          'Account permissions insufficient'
        ],
        resolutionSteps: [
          'Verify API key/credentials are correct',
          'Check if authentication token needs renewal',
          'Confirm authentication method matches provider requirements',
          'Review account permissions with provider'
        ]
      },
      {
        id: '3',
        pattern: 'Data validation error',
        description: 'Data format or content validation failed',
        category: 'data',
        commonCauses: [
          'Invalid data format',
          'Missing required fields',
          'Data type mismatch',
          'Field mapping configuration error'
        ],
        resolutionSteps: [
          'Review data format requirements',
          'Check field mapping configuration',
          'Validate sample data manually',
          'Update data transformation rules'
        ]
      }
    ];
    setErrorPatterns(patterns);
  };

  const runDiagnostics = async (integrationId: string) => {
    setIsRunningDiagnostics(true);
    try {
      const response = await fetch(`/api/integrations/${integrationId}/diagnostics`, {
        method: 'POST',
      });
      const results = await response.json();
      setDiagnosticResults(results);
    } catch (error) {
      console.error('Failed to run diagnostics:', error);
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  const selectedIntegrationData = integrations.find(i => i.id === selectedIntegration);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Integration Troubleshooting</h2>
          <p className="text-gray-600">Diagnose and resolve integration issues</p>
        </div>
        <Button onClick={loadData} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Integration Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Integration</CardTitle>
          <CardDescription>Choose an integration to troubleshoot</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <Select value={selectedIntegration} onValueChange={setSelectedIntegration}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select integration" />
              </SelectTrigger>
              <SelectContent>
                {integrations.map((integration) => (
                  <SelectItem key={integration.id} value={integration.id}>
                    <div className="flex items-center space-x-2">
                      <span>{integration.name}</span>
                      <Badge variant={integration.status === 'active' ? 'default' : 'secondary'}>
                        {integration.status}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedIntegration && (
              <Button 
                onClick={() => runDiagnostics(selectedIntegration)}
                disabled={isRunningDiagnostics}
              >
                {isRunningDiagnostics && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Bug className="w-4 h-4 mr-2" />
                Run Diagnostics
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedIntegrationData && (
        <Tabs defaultValue="diagnostics" className="space-y-4">
          <TabsList>
            <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
            <TabsTrigger value="errors">Recent Errors</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
            <TabsTrigger value="tools">Debug Tools</TabsTrigger>
          </TabsList>

          <TabsContent value="diagnostics" className="space-y-4">
            <DiagnosticsPanel 
              integration={selectedIntegrationData}
              results={diagnosticResults}
              isRunning={isRunningDiagnostics}
            />
          </TabsContent>

          <TabsContent value="errors" className="space-y-4">
            <ErrorAnalysisPanel 
              integration={selectedIntegrationData}
              errors={recentErrors.filter(e => e.integrationId === selectedIntegration)}
              errorPatterns={errorPatterns}
            />
          </TabsContent>

          <TabsContent value="knowledge" className="space-y-4">
            <KnowledgeBasePanel 
              integration={selectedIntegrationData}
              errorPatterns={errorPatterns}
            />
          </TabsContent>

          <TabsContent value="tools" className="space-y-4">
            <DebugToolsPanel 
              integration={selectedIntegrationData}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function DiagnosticsPanel({ 
  integration, 
  results, 
  isRunning 
}: {
  integration: IntegrationConfig;
  results: DiagnosticResult[];
  isRunning: boolean;
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass':
        return 'text-green-600 bg-green-100';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100';
      case 'fail':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-4 h-4" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4" />;
      case 'fail':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <RefreshCw className="w-4 h-4" />;
    }
  };

  if (isRunning) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Running diagnostics for {integration.name}...</p>
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Bug className="w-8 h-8 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">No diagnostic results available</p>
          <p className="text-sm text-gray-500 mt-2">
            Click "Run Diagnostics" to analyze this integration
          </p>
        </CardContent>
      </Card>
    );
  }

  const passCount = results.filter(r => r.status === 'pass').length;
  const warningCount = results.filter(r => r.status === 'warning').length;
  const failCount = results.filter(r => r.status === 'fail').length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Diagnostic Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{passCount}</p>
              <p className="text-sm text-gray-600">Passed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">{warningCount}</p>
              <p className="text-sm text-gray-600">Warnings</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{failCount}</p>
              <p className="text-sm text-gray-600">Failed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Results */}
      <Card>
        <CardHeader>
          <CardTitle>Diagnostic Results</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {results.map((result, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(result.status)}>
                      {getStatusIcon(result.status)}
                      <span className="ml-1 capitalize">{result.status}</span>
                    </Badge>
                    <span className="font-medium">{result.category}</span>
                  </div>
                </div>
                
                <p className="text-gray-700 mb-2">{result.message}</p>
                
                {result.details && (
                  <div className="bg-gray-50 rounded p-3 mb-2">
                    <p className="text-sm text-gray-600">{result.details}</p>
                  </div>
                )}
                
                {result.resolution && (
                  <div className="bg-blue-50 rounded p-3">
                    <p className="text-sm font-medium text-blue-800 mb-1">Recommended Action:</p>
                    <p className="text-sm text-blue-700">{result.resolution}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorAnalysisPanel({ 
  integration, 
  errors, 
  errorPatterns 
}: {
  integration: IntegrationConfig;
  errors: any[];
  errorPatterns: ErrorPattern[];
}) {
  const [selectedError, setSelectedError] = useState<any>(null);

  const analyzeError = (error: any) => {
    const matchingPatterns = errorPatterns.filter(pattern =>
      error.message.toLowerCase().includes(pattern.pattern.toLowerCase())
    );
    return matchingPatterns[0] || null;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Recent Errors</CardTitle>
          <CardDescription>
            Last 50 errors for {integration.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errors.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-8 h-8 mx-auto mb-4 text-green-500" />
              <p className="text-gray-600">No recent errors found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {errors.map((error, index) => {
                const pattern = analyzeError(error);
                return (
                  <div
                    key={index}
                    className="border rounded-lg p-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => setSelectedError(error)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-red-600">{error.message}</p>
                        <p className="text-sm text-gray-600">
                          {new Date(error.timestamp).toLocaleString()}
                        </p>
                        {pattern && (
                          <Badge variant="outline" className="mt-1">
                            {pattern.category}
                          </Badge>
                        )}
                      </div>
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedError && (
        <ErrorDetailModal
          error={selectedError}
          pattern={analyzeError(selectedError)}
          onClose={() => setSelectedError(null)}
        />
      )}
    </div>
  );
}

function KnowledgeBasePanel({ 
  integration, 
  errorPatterns 
}: {
  integration: IntegrationConfig;
  errorPatterns: ErrorPattern[];
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredPatterns = errorPatterns.filter(pattern => {
    const matchesSearch = pattern.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         pattern.pattern.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || pattern.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Knowledge Base</CardTitle>
          <CardDescription>
            Common issues and solutions for {integration.type.toUpperCase()} integrations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                <Input
                  placeholder="Search for issues..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="connection">Connection</SelectItem>
                <SelectItem value="authentication">Authentication</SelectItem>
                <SelectItem value="data">Data</SelectItem>
                <SelectItem value="configuration">Configuration</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            {filteredPatterns.map((pattern) => (
              <div key={pattern.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium">{pattern.description}</h4>
                  <Badge variant="outline">{pattern.category}</Badge>
                </div>
                
                <p className="text-sm text-gray-600 mb-3">
                  Pattern: <code className="bg-gray-100 px-1 rounded">{pattern.pattern}</code>
                </p>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="font-medium text-sm mb-2">Common Causes:</h5>
                    <ul className="text-sm text-gray-600 space-y-1">
                      {pattern.commonCauses.map((cause, index) => (
                        <li key={index} className="flex items-start">
                          <span className="w-1 h-1 bg-gray-400 rounded-full mt-2 mr-2 flex-shrink-0" />
                          {cause}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <h5 className="font-medium text-sm mb-2">Resolution Steps:</h5>
                    <ol className="text-sm text-gray-600 space-y-1">
                      {pattern.resolutionSteps.map((step, index) => (
                        <li key={index} className="flex items-start">
                          <span className="w-4 h-4 bg-blue-100 text-blue-600 rounded-full text-xs flex items-center justify-center mr-2 mt-0.5 flex-shrink-0">
                            {index + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DebugToolsPanel({ integration }: { integration: IntegrationConfig }) {
  const [testEndpoint, setTestEndpoint] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  const testConnection = async () => {
    setIsTestingConnection(true);
    try {
      const response = await fetch('/api/integrations/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: integration.id,
          endpoint: testEndpoint,
        }),
      });
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Test failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const exportLogs = async () => {
    try {
      const response = await fetch(`/api/integrations/${integration.id}/logs/export`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${integration.name}-logs.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export logs:', error);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Connection Test</CardTitle>
          <CardDescription>Test connectivity to integration endpoints</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="testEndpoint">Test Endpoint</Label>
            <Input
              id="testEndpoint"
              value={testEndpoint}
              onChange={(e) => setTestEndpoint(e.target.value)}
              placeholder={`${integration.config.apiUrl || 'https://api.example.com'}/health`}
            />
          </div>
          
          <Button 
            onClick={testConnection} 
            disabled={isTestingConnection || !testEndpoint}
          >
            {isTestingConnection && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Play className="w-4 h-4 mr-2" />
            Test Connection
          </Button>

          {testResult && (
            <div className={`border rounded-lg p-4 ${
              testResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
            }`}>
              <div className="flex items-center space-x-2 mb-2">
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                )}
                <span className={`font-medium ${
                  testResult.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  {testResult.message}
                </span>
              </div>
              
              {testResult.responseTime && (
                <p className="text-sm text-gray-600">
                  Response time: {testResult.responseTime}ms
                </p>
              )}
              
              {testResult.error && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-red-800">Error Details:</p>
                  <pre className="text-xs text-red-700 bg-red-100 p-2 rounded mt-1 overflow-x-auto">
                    {testResult.error}
                  </pre>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration Inspector</CardTitle>
          <CardDescription>View and validate integration configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Current Configuration</Label>
                <Button variant="outline" size="sm">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
              </div>
              <Textarea
                value={JSON.stringify(integration.config, null, 2)}
                readOnly
                rows={10}
                className="font-mono text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log Export</CardTitle>
          <CardDescription>Export integration logs for analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={exportLogs}>
            <Download className="w-4 h-4 mr-2" />
            Export Logs
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorDetailModal({ 
  error, 
  pattern, 
  onClose 
}: {
  error: any;
  pattern: ErrorPattern | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Error Details</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ×
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Error Message</Label>
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-red-800">{error.message}</p>
            </div>
          </div>

          <div>
            <Label>Timestamp</Label>
            <p className="text-sm text-gray-600">{new Date(error.timestamp).toLocaleString()}</p>
          </div>

          {error.stackTrace && (
            <div>
              <Label>Stack Trace</Label>
              <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
                {error.stackTrace}
              </pre>
            </div>
          )}

          {pattern && (
            <div className="border-t pt-4">
              <h4 className="font-medium mb-2">Suggested Resolution</h4>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Common Causes:</p>
                  <ul className="text-sm text-gray-600 mt-1 space-y-1">
                    {pattern.commonCauses.map((cause, index) => (
                      <li key={index} className="flex items-start">
                        <span className="w-1 h-1 bg-gray-400 rounded-full mt-2 mr-2 flex-shrink-0" />
                        {cause}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <p className="text-sm font-medium">Resolution Steps:</p>
                  <ol className="text-sm text-gray-600 mt-1 space-y-1">
                    {pattern.resolutionSteps.map((step, index) => (
                      <li key={index} className="flex items-start">
                        <span className="w-4 h-4 bg-blue-100 text-blue-600 rounded-full text-xs flex items-center justify-center mr-2 mt-0.5 flex-shrink-0">
                          {index + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}