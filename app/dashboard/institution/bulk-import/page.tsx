'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileUploadInterface } from '@/components/bulk-import/file-upload-interface';
import { ValidationResults } from '@/components/bulk-import/validation-results';
import { ImportProgress } from '@/components/bulk-import/import-progress';
import { ImportHistory } from '@/components/bulk-import/import-history';
import { 
  FileFormat, 
  BulkImportOptions, 
  ValidationResult, 
  ImportResult,
  ImportStatus as ImportStatusType
} from '@/lib/types/bulk-import';
import { Upload, Settings, History, AlertCircle } from 'lucide-react';

type ImportStep = 'upload' | 'validate' | 'configure' | 'import' | 'complete';

export default function BulkImportPage() {
  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<FileFormat | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatusType | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importOptions, setImportOptions] = useState<BulkImportOptions>({
    institutionId: '', // Will be set from user context
    sendWelcomeEmails: true,
    dryRun: false,
    batchSize: 100,
    skipDuplicates: false,
    updateExisting: false,
    createSnapshot: true,
    validateOnly: false
  });

  const acceptedFormats: FileFormat[] = ['csv', 'excel', 'json'];
  const maxFileSize = 50 * 1024 * 1024; // 50MB

  const handleFileSelect = useCallback((file: File, format: FileFormat) => {
    setSelectedFile(file);
    setFileType(format);
    setValidationResult(null);
    setError(null);
    setCurrentStep('validate');
  }, []);

  const handleFileRemove = useCallback(() => {
    setSelectedFile(null);
    setFileType(null);
    setValidationResult(null);
    setError(null);
    setCurrentStep('upload');
  }, []);

  const handleDownloadTemplate = useCallback(async (format: FileFormat) => {
    try {
      const response = await fetch(`/api/bulk-import/template?format=${format}`);
      
      if (!response.ok) {
        throw new Error('Failed to download template');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-import-template.${format === 'excel' ? 'xlsx' : format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Template download error:', error);
      setError('Failed to download template');
    }
  }, []);

  const handleValidateFile = useCallback(async () => {
    if (!selectedFile || !fileType) return;

    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/bulk-import/validate', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Validation failed');
      }

      if (result.success && result.validationResult) {
        setValidationResult(result.validationResult);
        setCurrentStep('configure');
      } else {
        setError('File validation failed');
      }
    } catch (error) {
      console.error('Validation error:', error);
      setError(error instanceof Error ? error.message : 'Validation failed');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, fileType]);

  const handleStartImport = useCallback(async () => {
    if (!selectedFile || !fileType || !validationResult) return;

    setIsProcessing(true);
    setError(null);
    setCurrentStep('import');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('options', JSON.stringify(importOptions));

      const response = await fetch('/api/bulk-import', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Import failed');
      }

      setImportResult(result);
      setCurrentStep('complete');
    } catch (error) {
      console.error('Import error:', error);
      setError(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, fileType, validationResult, importOptions]);

  const handleRetryValidation = useCallback(() => {
    setValidationResult(null);
    setError(null);
    handleValidateFile();
  }, [handleValidateFile]);

  const handleStartOver = useCallback(() => {
    setSelectedFile(null);
    setFileType(null);
    setValidationResult(null);
    setImportResult(null);
    setImportStatus(null);
    setError(null);
    setCurrentStep('upload');
  }, []);

  const renderStepContent = () => {
    switch (currentStep) {
      case 'upload':
        return (
          <FileUploadInterface
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
            acceptedFormats={acceptedFormats}
            maxFileSize={maxFileSize}
            selectedFile={selectedFile}
            onDownloadTemplate={handleDownloadTemplate}
          />
        );

      case 'validate':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Validate Import Data</CardTitle>
                <CardDescription>
                  Review your file and validate the data before importing
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedFile && (
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="font-medium">{selectedFile.name}</p>
                      <p className="text-sm text-gray-600">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • {fileType?.toUpperCase()}
                      </p>
                    </div>
                    
                    <Button 
                      onClick={handleValidateFile}
                      disabled={isProcessing}
                      className="w-full"
                    >
                      {isProcessing ? 'Validating...' : 'Validate File'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case 'configure':
        return (
          <div className="space-y-6">
            {validationResult && (
              <ValidationResults
                validationResult={validationResult}
                onRetry={handleRetryValidation}
                onProceed={() => setCurrentStep('import')}
                isProcessing={isProcessing}
              />
            )}
            
            {validationResult?.isValid && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Import Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure import settings before proceeding
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="sendWelcomeEmails"
                        checked={importOptions.sendWelcomeEmails}
                        onChange={(e) => setImportOptions(prev => ({
                          ...prev,
                          sendWelcomeEmails: e.target.checked
                        }))}
                        className="rounded"
                      />
                      <label htmlFor="sendWelcomeEmails" className="text-sm font-medium">
                        Send welcome emails to new users
                      </label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="createSnapshot"
                        checked={importOptions.createSnapshot}
                        onChange={(e) => setImportOptions(prev => ({
                          ...prev,
                          createSnapshot: e.target.checked
                        }))}
                        className="rounded"
                      />
                      <label htmlFor="createSnapshot" className="text-sm font-medium">
                        Create rollback snapshot
                      </label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="skipDuplicates"
                        checked={importOptions.skipDuplicates}
                        onChange={(e) => setImportOptions(prev => ({
                          ...prev,
                          skipDuplicates: e.target.checked
                        }))}
                        className="rounded"
                      />
                      <label htmlFor="skipDuplicates" className="text-sm font-medium">
                        Skip duplicate users
                      </label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="updateExisting"
                        checked={importOptions.updateExisting}
                        onChange={(e) => setImportOptions(prev => ({
                          ...prev,
                          updateExisting: e.target.checked
                        }))}
                        className="rounded"
                      />
                      <label htmlFor="updateExisting" className="text-sm font-medium">
                        Update existing users
                      </label>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="batchSize" className="text-sm font-medium">
                      Batch Size (records per batch)
                    </label>
                    <input
                      type="number"
                      id="batchSize"
                      min="10"
                      max="1000"
                      value={importOptions.batchSize}
                      onChange={(e) => setImportOptions(prev => ({
                        ...prev,
                        batchSize: parseInt(e.target.value) || 100
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  
                  <Button 
                    onClick={handleStartImport}
                    disabled={isProcessing}
                    className="w-full"
                  >
                    {isProcessing ? 'Starting Import...' : 'Start Import'}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 'import':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Import in Progress</CardTitle>
                <CardDescription>
                  Please wait while we import your users...
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Progress value={75} className="w-full" />
                  <p className="text-sm text-gray-600">Processing batch 3 of 4...</p>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'complete':
        return (
          <div className="space-y-6">
            {importResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {importResult.failedImports > 0 ? (
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    ) : (
                      <Upload className="h-5 w-5 text-green-500" />
                    )}
                    Import Complete
                  </CardTitle>
                  <CardDescription>
                    {importResult.failedImports > 0 
                      ? 'Import completed with some issues'
                      : 'Import completed successfully'
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">{importResult.totalRecords}</div>
                      <div className="text-sm text-gray-600">Total Records</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{importResult.successfulImports}</div>
                      <div className="text-sm text-gray-600">Imported</div>
                    </div>
                    <div className="text-center p-3 bg-yellow-50 rounded-lg">
                      <div className="text-2xl font-bold text-yellow-600">{importResult.skippedImports}</div>
                      <div className="text-sm text-gray-600">Skipped</div>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">{importResult.failedImports}</div>
                      <div className="text-sm text-gray-600">Failed</div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button onClick={handleStartOver} variant="outline">
                      Import More Users
                    </Button>
                    {importResult.snapshotId && (
                      <Button variant="outline">
                        View Rollback Options
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bulk User Import</h1>
          <p className="text-gray-600">Import multiple users from CSV, Excel, or JSON files</p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="import" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import Users
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Import History
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="import" className="space-y-6">
          {renderStepContent()}
        </TabsContent>
        
        <TabsContent value="history" className="space-y-6">
          <ImportHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}