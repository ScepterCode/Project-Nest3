'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Upload, File, X, AlertCircle, CheckCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { FileFormat } from '@/lib/types/bulk-import';

interface FileUploadInterfaceProps {
  onFileSelect: (file: File, fileType: FileFormat) => void;
  onFileRemove: () => void;
  acceptedFormats: FileFormat[];
  maxFileSize: number; // in bytes
  isUploading?: boolean;
  uploadProgress?: number;
  selectedFile?: File | null;
  validationErrors?: string[];
  onDownloadTemplate: (format: FileFormat) => void;
}

export function FileUploadInterface({
  onFileSelect,
  onFileRemove,
  acceptedFormats,
  maxFileSize,
  isUploading = false,
  uploadProgress = 0,
  selectedFile,
  validationErrors = [],
  onDownloadTemplate
}: FileUploadInterfaceProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileType = (file: File): FileFormat | null => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'csv':
        return 'csv';
      case 'xlsx':
      case 'xls':
        return 'excel';
      case 'json':
        return 'json';
      default:
        return null;
    }
  };

  const validateFile = (file: File): string[] => {
    const errors: string[] = [];
    
    // Check file size
    if (file.size > maxFileSize) {
      errors.push(`File size (${formatFileSize(file.size)}) exceeds maximum allowed size (${formatFileSize(maxFileSize)})`);
    }
    
    // Check file type
    const fileType = getFileType(file);
    if (!fileType || !acceptedFormats.includes(fileType)) {
      errors.push(`File type not supported. Accepted formats: ${acceptedFormats.join(', ').toUpperCase()}`);
    }
    
    // Check if file is empty
    if (file.size === 0) {
      errors.push('File is empty');
    }
    
    return errors;
  };

  const handleFileSelect = useCallback((file: File) => {
    const errors = validateFile(file);
    
    if (errors.length > 0) {
      // Handle validation errors - you might want to show these in the UI
      console.error('File validation errors:', errors);
      return;
    }
    
    const fileType = getFileType(file);
    if (fileType) {
      onFileSelect(file, fileType);
    }
  }, [onFileSelect, maxFileSize, acceptedFormats]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev - 1);
    if (dragCounter <= 1) {
      setIsDragOver(false);
    }
  }, [dragCounter]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setDragCounter(0);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const getAcceptAttribute = () => {
    const extensions: string[] = [];
    if (acceptedFormats.includes('csv')) extensions.push('.csv');
    if (acceptedFormats.includes('excel')) extensions.push('.xlsx,.xls');
    if (acceptedFormats.includes('json')) extensions.push('.json');
    return extensions.join(',');
  };

  return (
    <div className="space-y-6">
      {/* Template Download Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Download Template
          </CardTitle>
          <CardDescription>
            Download a template file to ensure your data is formatted correctly
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {acceptedFormats.map((format) => (
              <Button
                key={format}
                variant="outline"
                size="sm"
                onClick={() => onDownloadTemplate(format)}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                {format.toUpperCase()} Template
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* File Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload User Data
          </CardTitle>
          <CardDescription>
            Select or drag and drop your user data file. Supported formats: {acceptedFormats.join(', ').toUpperCase()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedFile ? (
            <div
              className={`
                border-2 border-dashed rounded-lg p-8 text-center transition-colors
                ${isDragOver 
                  ? 'border-primary bg-primary/5' 
                  : 'border-gray-300 hover:border-gray-400'
                }
                ${isUploading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              `}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={handleBrowseClick}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={getAcceptAttribute()}
                onChange={handleFileInputChange}
                disabled={isUploading}
              />
              
              <div className="flex flex-col items-center gap-4">
                <div className={`
                  p-4 rounded-full 
                  ${isDragOver ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-gray-600'}
                `}>
                  <Upload className="h-8 w-8" />
                </div>
                
                <div className="space-y-2">
                  <p className="text-lg font-medium">
                    {isDragOver ? 'Drop your file here' : 'Drag and drop your file here'}
                  </p>
                  <p className="text-sm text-gray-500">
                    or <span className="text-primary font-medium">browse</span> to select a file
                  </p>
                </div>
                
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Supported formats: {acceptedFormats.join(', ').toUpperCase()}</p>
                  <p>Maximum file size: {formatFileSize(maxFileSize)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selected File Display */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded">
                    <File className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-gray-500">
                      {formatFileSize(selectedFile.size)} • {getFileType(selectedFile)?.toUpperCase()}
                    </p>
                  </div>
                </div>
                
                {!isUploading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onFileRemove}
                    className="text-gray-500 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Upload Progress */}
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Uploading...</span>
                    <span>{Math.round(uploadProgress)}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              {/* Validation Status */}
              {!isUploading && validationErrors.length === 0 && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    File uploaded successfully and ready for processing.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-medium">File validation errors:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {validationErrors.map((error, index) => (
                      <li key={index} className="text-sm">{error}</li>
                    ))}
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* File Format Information */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">File Format Requirements:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <strong>CSV:</strong> Comma-separated values with headers in the first row</li>
              <li>• <strong>Excel:</strong> .xlsx or .xls files with data in the first sheet</li>
              <li>• <strong>JSON:</strong> Array of user objects with consistent field names</li>
              <li>• Required fields: email, firstName, lastName</li>
              <li>• Optional fields: role, department, studentId, grade, phone, address</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}