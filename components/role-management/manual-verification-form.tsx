'use client';

import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { Upload, X, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { UserRole, VerificationEvidence } from '../../lib/types/role-management';

interface ManualVerificationFormProps {
  userId: string;
  institutionId: string;
  requestedRole: UserRole;
  onSubmit: (evidence: VerificationEvidence[], justification: string) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

interface FileUpload {
  id: string;
  file: File;
  url?: string;
  uploading: boolean;
  error?: string;
}

const EVIDENCE_TYPES = [
  { value: 'document', label: 'Official Document', description: 'Employment letter, ID card, etc.' },
  { value: 'email', label: 'Email Verification', description: 'Official email from institution' },
  { value: 'reference', label: 'Reference Contact', description: 'Contact information for verification' },
  { value: 'other', label: 'Other', description: 'Other supporting evidence' }
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

export function ManualVerificationForm({
  userId,
  institutionId,
  requestedRole,
  onSubmit,
  onCancel,
  isSubmitting = false
}: ManualVerificationFormProps) {
  const [evidence, setEvidence] = useState<VerificationEvidence[]>([]);
  const [justification, setJustification] = useState('');
  const [fileUploads, setFileUploads] = useState<FileUpload[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const addEvidenceItem = () => {
    const newEvidence: VerificationEvidence = {
      type: 'document',
      description: '',
      metadata: {}
    };
    setEvidence([...evidence, newEvidence]);
  };

  const updateEvidence = (index: number, updates: Partial<VerificationEvidence>) => {
    const updated = [...evidence];
    updated[index] = { ...updated[index], ...updates };
    setEvidence(updated);
  };

  const removeEvidence = (index: number) => {
    const updated = evidence.filter((_, i) => i !== index);
    setEvidence(updated);
    
    // Remove associated file upload if exists
    const associatedUpload = fileUploads.find(upload => upload.id === `evidence-${index}`);
    if (associatedUpload) {
      setFileUploads(fileUploads.filter(upload => upload.id !== associatedUpload.id));
    }
  };

  const handleFileSelect = async (index: number, file: File) => {
    // Validate file
    const validationErrors: string[] = [];
    
    if (file.size > MAX_FILE_SIZE) {
      validationErrors.push(`File "${file.name}" is too large. Maximum size is 10MB.`);
    }
    
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      validationErrors.push(`File type "${file.type}" is not allowed.`);
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    // Create file upload entry
    const uploadId = `evidence-${index}`;
    const newUpload: FileUpload = {
      id: uploadId,
      file,
      uploading: true
    };

    setFileUploads([...fileUploads.filter(u => u.id !== uploadId), newUpload]);
    setErrors([]);

    try {
      // Simulate file upload (in real implementation, upload to storage service)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Generate mock URL (in real implementation, get from storage service)
      const fileUrl = `https://storage.example.com/verification/${uploadId}/${file.name}`;
      
      // Update upload status
      setFileUploads(uploads => 
        uploads.map(upload => 
          upload.id === uploadId 
            ? { ...upload, url: fileUrl, uploading: false }
            : upload
        )
      );

      // Update evidence with file URL
      updateEvidence(index, { 
        fileUrl,
        metadata: {
          ...evidence[index]?.metadata,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type
        }
      });

    } catch (error) {
      setFileUploads(uploads => 
        uploads.map(upload => 
          upload.id === uploadId 
            ? { ...upload, uploading: false, error: 'Upload failed' }
            : upload
        )
      );
      setErrors(['File upload failed. Please try again.']);
    }
  };

  const removeFile = (index: number) => {
    const uploadId = `evidence-${index}`;
    setFileUploads(fileUploads.filter(upload => upload.id !== uploadId));
    updateEvidence(index, { fileUrl: undefined });
  };

  const validateForm = (): boolean => {
    const validationErrors: string[] = [];

    if (!justification.trim()) {
      validationErrors.push('Justification is required.');
    }

    if (evidence.length === 0) {
      validationErrors.push('At least one piece of evidence is required.');
    }

    evidence.forEach((item, index) => {
      if (!item.description.trim()) {
        validationErrors.push(`Evidence item ${index + 1} requires a description.`);
      }
    });

    setErrors(validationErrors);
    return validationErrors.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      await onSubmit(evidence, justification);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Submission failed']);
    }
  };

  const getFileUpload = (index: number) => {
    return fileUploads.find(upload => upload.id === `evidence-${index}`);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Manual Role Verification</CardTitle>
        <CardDescription>
          Submit supporting evidence to verify your {requestedRole.replace('_', ' ')} role.
          This will be reviewed by authorized personnel.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Justification */}
          <div className="space-y-2">
            <Label htmlFor="justification">
              Justification <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="justification"
              placeholder="Please explain why you need this role and how you are affiliated with the institution..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={4}
              required
            />
          </div>

          {/* Evidence Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Supporting Evidence <span className="text-red-500">*</span></Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addEvidenceItem}
                disabled={evidence.length >= 5}
              >
                Add Evidence
              </Button>
            </div>

            {evidence.length === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Please add at least one piece of supporting evidence to verify your role.
                </AlertDescription>
              </Alert>
            )}

            {evidence.map((item, index) => {
              const fileUpload = getFileUpload(index);
              
              return (
                <Card key={index} className="p-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Evidence Item {index + 1}</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEvidence(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Evidence Type</Label>
                        <Select
                          value={item.type}
                          onValueChange={(value: any) => updateEvidence(index, { type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EVIDENCE_TYPES.map(type => (
                              <SelectItem key={type.value} value={type.value}>
                                <div>
                                  <div className="font-medium">{type.label}</div>
                                  <div className="text-sm text-muted-foreground">{type.description}</div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Input
                          placeholder="Describe this evidence..."
                          value={item.description}
                          onChange={(e) => updateEvidence(index, { description: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    {/* File Upload */}
                    <div className="space-y-2">
                      <Label>File Attachment (Optional)</Label>
                      
                      {!fileUpload && (
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                          <Upload className="mx-auto h-12 w-12 text-gray-400" />
                          <div className="mt-2">
                            <Label htmlFor={`file-${index}`} className="cursor-pointer">
                              <span className="text-blue-600 hover:text-blue-500">Upload a file</span>
                              <span className="text-gray-500"> or drag and drop</span>
                            </Label>
                            <Input
                              id={`file-${index}`}
                              type="file"
                              className="hidden"
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleFileSelect(index, file);
                                }
                              }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            PDF, DOC, DOCX, JPG, PNG, GIF up to 10MB
                          </p>
                        </div>
                      )}

                      {fileUpload && (
                        <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                          <FileText className="h-8 w-8 text-blue-500" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {fileUpload.file.name}
                            </p>
                            <p className="text-sm text-gray-500">
                              {(fileUpload.file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          
                          {fileUpload.uploading && (
                            <div className="text-sm text-blue-600">Uploading...</div>
                          )}
                          
                          {fileUpload.url && (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          )}
                          
                          {fileUpload.error && (
                            <AlertCircle className="h-5 w-5 text-red-500" />
                          )}
                          
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1">
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || evidence.length === 0}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Verification Request'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}