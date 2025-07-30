/**
 * Bulk Assignment Results Component
 * 
 * Displays detailed success/failure reporting for bulk role assignment operations.
 * Provides export functionality and detailed error analysis.
 */

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Download, 
  FileText,
  Users,
  TrendingUp,
  Clock,
  Mail
} from 'lucide-react';

interface BulkAssignmentError {
  index: number;
  userId: string;
  error: string;
}

interface BulkAssignmentResult {
  successful: number;
  failed: number;
  total: number;
  errors: BulkAssignmentError[];
  validateOnly: boolean;
  processingTime?: number;
  assignments?: Array<{
    id: string;
    userId: string;
    email: string;
    role: string;
    assignedAt: Date;
  }>;
}

interface BulkAssignmentResultsProps {
  result: BulkAssignmentResult;
  onClose?: () => void;
  onRetry?: (failedItems: BulkAssignmentError[]) => void;
}

export default function BulkAssignmentResults({
  result,
  onClose,
  onRetry
}: BulkAssignmentResultsProps) {
  const [activeTab, setActiveTab] = useState('summary');

  const successRate = result.total > 0 ? (result.successful / result.total) * 100 : 0;
  const failureRate = result.total > 0 ? (result.failed / result.total) * 100 : 0;

  const exportResults = (format: 'csv' | 'json') => {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `bulk_assignment_results_${timestamp}.${format}`;
    
    if (format === 'csv') {
      const csvContent = [
        'Type,Email,Status,Error,Timestamp',
        ...result.assignments?.map(assignment => 
          `Success,${assignment.email},Assigned,,"${assignment.assignedAt}"`
        ) || [],
        ...result.errors.map(error => 
          `Error,${error.userId},Failed,"${error.error}","${new Date().toISOString()}"`
        )
      ].join('\n');
      
      downloadFile(csvContent, filename, 'text/csv');
    } else {
      const jsonContent = JSON.stringify({
        summary: {
          total: result.total,
          successful: result.successful,
          failed: result.failed,
          successRate: successRate.toFixed(2) + '%',
          validateOnly: result.validateOnly,
          processingTime: result.processingTime,
          timestamp: new Date().toISOString()
        },
        successful: result.assignments || [],
        failed: result.errors
      }, null, 2);
      
      downloadFile(jsonContent, filename, 'application/json');
    }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: 'success' | 'error' | 'warning') => {
    switch (status) {
      case 'success': return 'text-green-600 bg-green-50';
      case 'error': return 'text-red-600 bg-red-50';
      case 'warning': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const groupErrorsByType = () => {
    const errorGroups = new Map<string, BulkAssignmentError[]>();
    
    result.errors.forEach(error => {
      const errorType = error.error.split(':')[0] || 'Unknown Error';
      if (!errorGroups.has(errorType)) {
        errorGroups.set(errorType, []);
      }
      errorGroups.get(errorType)!.push(error);
    });
    
    return Array.from(errorGroups.entries()).map(([type, errors]) => ({
      type,
      count: errors.length,
      errors
    }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {result.validateOnly ? (
                  <>
                    <FileText className="h-5 w-5" />
                    Validation Results
                  </>
                ) : (
                  <>
                    <Users className="h-5 w-5" />
                    Bulk Assignment Results
                  </>
                )}
              </CardTitle>
              <CardDescription>
                {result.validateOnly 
                  ? 'File validation completed'
                  : 'Bulk role assignment operation completed'
                }
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => exportResults('csv')}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportResults('json')}>
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
              {onClose && (
                <Button variant="outline" size="sm" onClick={onClose}>
                  Close
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="successful">
                Successful ({result.successful})
              </TabsTrigger>
              <TabsTrigger value="failed">
                Failed ({result.failed})
              </TabsTrigger>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-4">
              {/* Overall Status */}
              <Alert variant={result.failed === 0 ? "default" : "destructive"}>
                {result.failed === 0 ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">
                      {result.validateOnly ? 'Validation' : 'Processing'} completed: 
                      {result.successful} successful, {result.failed} failed out of {result.total} total
                    </p>
                    {result.processingTime && (
                      <p className="text-sm flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Processing time: {result.processingTime}ms
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>

              {/* Progress Visualization */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span>Success Rate</span>
                  <span className="font-medium">{successRate.toFixed(1)}%</span>
                </div>
                <Progress value={successRate} className="h-2" />
                
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className={`p-4 rounded-lg ${getStatusColor('success')}`}>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      <div>
                        <p className="font-medium">Successful</p>
                        <p className="text-2xl font-bold">{result.successful}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className={`p-4 rounded-lg ${getStatusColor('error')}`}>
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5" />
                      <div>
                        <p className="font-medium">Failed</p>
                        <p className="text-2xl font-bold">{result.failed}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              {result.failed > 0 && onRetry && (
                <div className="pt-4 border-t">
                  <Button onClick={() => onRetry(result.errors)} variant="outline">
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Retry Failed Items
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="successful" className="space-y-4">
              {result.assignments && result.assignments.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Successfully Processed</h3>
                    <Badge variant="secondary">{result.assignments.length} items</Badge>
                  </div>
                  <div className="max-h-96 overflow-y-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="p-3 text-left">Email</th>
                          <th className="p-3 text-left">Role</th>
                          <th className="p-3 text-left">Assigned At</th>
                          <th className="p-3 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.assignments.map((assignment, index) => (
                          <tr key={assignment.id} className="border-t">
                            <td className="p-3">{assignment.email}</td>
                            <td className="p-3">
                              <Badge variant="outline">{assignment.role}</Badge>
                            </td>
                            <td className="p-3">
                              {new Date(assignment.assignedAt).toLocaleString()}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="h-4 w-4" />
                                Success
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No successful assignments to display</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="failed" className="space-y-4">
              {result.errors.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Failed Items</h3>
                    <Badge variant="destructive">{result.errors.length} items</Badge>
                  </div>
                  <div className="max-h-96 overflow-y-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="p-3 text-left">Row</th>
                          <th className="p-3 text-left">Email/User</th>
                          <th className="p-3 text-left">Error</th>
                          <th className="p-3 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.map((error, index) => (
                          <tr key={index} className="border-t">
                            <td className="p-3 font-mono text-xs">{error.index + 1}</td>
                            <td className="p-3">{error.userId}</td>
                            <td className="p-3 text-red-600 text-xs">{error.error}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-1 text-red-600">
                                <XCircle className="h-4 w-4" />
                                Failed
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No failed items - all assignments were successful!</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="analysis" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Error Analysis */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Error Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {result.errors.length > 0 ? (
                      <div className="space-y-3">
                        {groupErrorsByType().map((group, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-red-50 rounded">
                            <span className="text-sm font-medium text-red-800">{group.type}</span>
                            <Badge variant="destructive">{group.count}</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No errors to analyze</p>
                    )}
                  </CardContent>
                </Card>

                {/* Performance Metrics */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Performance Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Success Rate</span>
                      <span className="font-medium">{successRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Failure Rate</span>
                      <span className="font-medium">{failureRate.toFixed(1)}%</span>
                    </div>
                    {result.processingTime && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Processing Time</span>
                        <span className="font-medium">{result.processingTime}ms</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Items per Second</span>
                      <span className="font-medium">
                        {result.processingTime 
                          ? Math.round((result.total / result.processingTime) * 1000)
                          : 'N/A'
                        }
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recommendations */}
              {result.failed > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      {failureRate > 50 && (
                        <div className="flex items-start gap-2 p-2 bg-yellow-50 rounded">
                          <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                          <p className="text-yellow-800">
                            High failure rate detected. Consider reviewing your data format and validation rules.
                          </p>
                        </div>
                      )}
                      {result.errors.some(e => e.error.includes('email')) && (
                        <div className="flex items-start gap-2 p-2 bg-blue-50 rounded">
                          <Mail className="h-4 w-4 text-blue-600 mt-0.5" />
                          <p className="text-blue-800">
                            Email format issues detected. Ensure all email addresses are valid.
                          </p>
                        </div>
                      )}
                      {result.errors.some(e => e.error.includes('role')) && (
                        <div className="flex items-start gap-2 p-2 bg-purple-50 rounded">
                          <Users className="h-4 w-4 text-purple-600 mt-0.5" />
                          <p className="text-purple-800">
                            Role validation issues found. Check that all roles are valid for your institution.
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}