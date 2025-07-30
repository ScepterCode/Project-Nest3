/**
 * Bulk Role Assignment Interface
 * 
 * Provides a user interface for uploading CSV/Excel files containing user data
 * and bulk assigning roles to multiple users at once.
 */

'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  Download, 
  FileText, 
  AlertCircle, 
  CheckCircle, 
  XCircle,
  Users,
  FileSpreadsheet
} from 'lucide-react';
import { UserRole } from '@/lib/types/role-management';

interface BulkAssignmentData {
  email: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  departmentId?: string;
  justification?: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
  value?: string;
}

interface ProcessingResult {
  successful: number;
  failed: number;
  errors: Array<{
    row: number;
    email: string;
    error: string;
  }>;
}

interface BulkRoleAssignmentInterfaceProps {
  institutionId: string;
  departments: Array<{ id: string; name: string }>;
  onAssignmentComplete?: (result: ProcessingResult) => void;
}

export default function BulkRoleAssignmentInterface({
  institutionId,
  departments,
  onAssignmentComplete
}: BulkRoleAssignmentInterfaceProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<BulkAssignmentData[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);
  const [defaultRole, setDefaultRole] = useState<UserRole>(UserRole.STUDENT);
  const [defaultDepartment, setDefaultDepartment] = useState<string>('');
  const [validateOnly, setValidateOnly] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      parseFile(selectedFile);
    }
  };

  const parseFile = async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        throw new Error('File is empty');
      }

      // Parse CSV format
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const data: BulkAssignmentData[] = [];
      const errors: ValidationError[] = [];

      // Validate headers
      const requiredHeaders = ['email'];
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        errors.push({
          row: 0,
          field: 'headers',
          message: `Missing required headers: ${missingHeaders.join(', ')}`
        });
      }

      // Parse data rows
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const rowData: Partial<BulkAssignmentData> = {};

        headers.forEach((header, index) => {
          const value = values[index] || '';
          switch (header) {
            case 'email':
              rowData.email = value;
              break;
            case 'firstname':
            case 'first_name':
              rowData.firstName = value;
              break;
            case 'lastname':
            case 'last_name':
              rowData.lastName = value;
              break;
            case 'role':
              if (value && Object.values(UserRole).includes(value as UserRole)) {
                rowData.role = value as UserRole;
              } else {
                rowData.role = defaultRole;
              }
              break;
            case 'department':
            case 'department_id':
              rowData.departmentId = value || defaultDepartment;
              break;
            case 'justification':
              rowData.justification = value;
              break;
          }
        });

        // Validate row data
        if (!rowData.email) {
          errors.push({
            row: i + 1,
            field: 'email',
            message: 'Email is required',
            value: rowData.email
          });
        } else if (!isValidEmail(rowData.email)) {
          errors.push({
            row: i + 1,
            field: 'email',
            message: 'Invalid email format',
            value: rowData.email
          });
        }

        if (!rowData.role) {
          rowData.role = defaultRole;
        }

        if (!rowData.departmentId) {
          rowData.departmentId = defaultDepartment;
        }

        data.push(rowData as BulkAssignmentData);
      }

      setParsedData(data);
      setValidationErrors(errors);
    } catch (error) {
      setValidationErrors([{
        row: 0,
        field: 'file',
        message: error instanceof Error ? error.message : 'Failed to parse file'
      }]);
    }
  };

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const processBulkAssignment = async () => {
    if (parsedData.length === 0 || validationErrors.length > 0) {
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingResult(null);

    try {
      const response = await fetch('/api/roles/bulk-assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignments: parsedData.map(data => ({
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            role: data.role,
            departmentId: data.departmentId,
            institutionId,
            justification: data.justification || `Bulk assignment from file: ${file?.name}`
          })),
          validateOnly
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to process bulk assignment');
      }

      const result = await response.json();
      setProcessingResult(result);
      onAssignmentComplete?.(result);

      // Simulate progress for better UX
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        setProcessingProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
        }
      }, 100);

    } catch (error) {
      setValidationErrors([{
        row: 0,
        field: 'processing',
        message: error instanceof Error ? error.message : 'Failed to process bulk assignment'
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = [
      'email,first_name,last_name,role,department_id,justification',
      'user1@example.com,John,Doe,student,,Initial assignment',
      'teacher@example.com,Jane,Smith,teacher,dept-123,Department teacher'
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk_role_assignment_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const clearData = () => {
    setFile(null);
    setParsedData([]);
    setValidationErrors([]);
    setProcessingResult(null);
    setProcessingProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Bulk Role Assignment
          </CardTitle>
          <CardDescription>
            Upload a CSV file to assign roles to multiple users at once. 
            Download the template to see the required format.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Template Download */}
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-blue-900">Need a template?</p>
                <p className="text-sm text-blue-700">Download our CSV template to get started</p>
              </div>
            </div>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>

          {/* Default Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="defaultRole">Default Role</Label>
              <Select value={defaultRole} onValueChange={(value) => setDefaultRole(value as UserRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select default role" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(UserRole).map((role) => (
                    <SelectItem key={role} value={role}>
                      {role.replace('_', ' ').toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultDepartment">Default Department</Label>
              <Select value={defaultDepartment} onValueChange={setDefaultDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="Select default department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Department</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file">Upload CSV File</Label>
            <div className="flex items-center gap-2">
              <Input
                ref={fileInputRef}
                id="file"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="flex-1"
              />
              {file && (
                <Button variant="outline" size="sm" onClick={clearData}>
                  Clear
                </Button>
              )}
            </div>
            {file && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FileText className="h-4 w-4" />
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-medium">Validation Errors:</p>
                  {validationErrors.slice(0, 5).map((error, index) => (
                    <p key={index} className="text-sm">
                      Row {error.row}: {error.message}
                      {error.value && ` (${error.value})`}
                    </p>
                  ))}
                  {validationErrors.length > 5 && (
                    <p className="text-sm">... and {validationErrors.length - 5} more errors</p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Data Preview */}
          {parsedData.length > 0 && validationErrors.length === 0 && (
            <div className="space-y-2">
              <Label>Data Preview ({parsedData.length} users)</Label>
              <div className="max-h-40 overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 text-left">Email</th>
                      <th className="p-2 text-left">Name</th>
                      <th className="p-2 text-left">Role</th>
                      <th className="p-2 text-left">Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 10).map((data, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-2">{data.email}</td>
                        <td className="p-2">{data.firstName} {data.lastName}</td>
                        <td className="p-2">
                          <Badge variant="secondary">{data.role}</Badge>
                        </td>
                        <td className="p-2">
                          {data.departmentId ? 
                            departments.find(d => d.id === data.departmentId)?.name || data.departmentId 
                            : 'None'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedData.length > 10 && (
                  <div className="p-2 text-center text-gray-500 text-sm border-t">
                    ... and {parsedData.length - 10} more users
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Processing Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <Label>Processing...</Label>
              <Progress value={processingProgress} className="w-full" />
              <p className="text-sm text-gray-600">
                Processing {parsedData.length} user assignments...
              </p>
            </div>
          )}

          {/* Processing Result */}
          {processingResult && (
            <Alert variant={processingResult.failed === 0 ? "default" : "destructive"}>
              {processingResult.failed === 0 ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">
                    Processing Complete: {processingResult.successful} successful, {processingResult.failed} failed
                  </p>
                  {processingResult.errors.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Errors:</p>
                      {processingResult.errors.slice(0, 3).map((error, index) => (
                        <p key={index} className="text-sm">
                          Row {error.row} ({error.email}): {error.error}
                        </p>
                      ))}
                      {processingResult.errors.length > 3 && (
                        <p className="text-sm">... and {processingResult.errors.length - 3} more errors</p>
                      )}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              onClick={processBulkAssignment}
              disabled={parsedData.length === 0 || validationErrors.length > 0 || isProcessing}
              className="flex-1"
            >
              {isProcessing ? (
                <>Processing...</>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {validateOnly ? 'Validate Data' : 'Assign Roles'}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setValidateOnly(!validateOnly)}
              disabled={isProcessing}
            >
              {validateOnly ? 'Validate Only' : 'Process & Assign'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}