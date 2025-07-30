'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Code, Send, Info } from 'lucide-react';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  variables: string[];
  category: 'welcome' | 'invitation' | 'notification' | 'reminder';
}

interface EmailTemplateCustomizationProps {
  institutionId: string;
  templates: EmailTemplate[];
  onUpdateTemplate: (templateId: string, updates: Partial<EmailTemplate>) => Promise<{ success: boolean; errors?: any[] }>;
  onPreviewTemplate: (templateId: string, variables: Record<string, string>) => Promise<{ success: boolean; preview?: string; errors?: any[] }>;
  onSendTestEmail: (templateId: string, email: string, variables: Record<string, string>) => Promise<{ success: boolean; errors?: any[] }>;
  isLoading?: boolean;
  canCustomizeEmails?: boolean;
}

const AVAILABLE_VARIABLES = {
  user: [
    '{{userName}}',
    '{{userEmail}}',
    '{{userRole}}',
    '{{userFirstName}}',
    '{{userLastName}}'
  ],
  institution: [
    '{{institutionName}}',
    '{{institutionDomain}}',
    '{{institutionLogo}}',
    '{{institutionAddress}}',
    '{{institutionPhone}}'
  ],
  system: [
    '{{currentDate}}',
    '{{currentYear}}',
    '{{loginUrl}}',
    '{{dashboardUrl}}',
    '{{supportEmail}}'
  ],
  invitation: [
    '{{invitationToken}}',
    '{{invitationUrl}}',
    '{{invitedBy}}',
    '{{expirationDate}}',
    '{{departmentName}}'
  ]
};

export function EmailTemplateCustomization({
  institutionId,
  templates,
  onUpdateTemplate,
  onPreviewTemplate,
  onSendTestEmail,
  isLoading = false,
  canCustomizeEmails = true
}: EmailTemplateCustomizationProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(
    templates.length > 0 ? templates[0] : null
  );
  const [editedTemplate, setEditedTemplate] = useState<EmailTemplate | null>(null);
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit');
  const [previewContent, setPreviewContent] = useState<string>('');
  const [testEmail, setTestEmail] = useState('');
  const [testVariables, setTestVariables] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  useEffect(() => {
    if (selectedTemplate) {
      setEditedTemplate({ ...selectedTemplate });
      // Initialize test variables with sample data
      const sampleVariables: Record<string, string> = {};
      selectedTemplate.variables.forEach(variable => {
        switch (variable) {
          case '{{userName}}':
            sampleVariables[variable] = 'John Doe';
            break;
          case '{{userEmail}}':
            sampleVariables[variable] = 'john.doe@example.com';
            break;
          case '{{institutionName}}':
            sampleVariables[variable] = 'Sample University';
            break;
          case '{{currentDate}}':
            sampleVariables[variable] = new Date().toLocaleDateString();
            break;
          case '{{loginUrl}}':
            sampleVariables[variable] = 'https://portal.example.edu/login';
            break;
          default:
            sampleVariables[variable] = `[${variable.replace(/[{}]/g, '')}]`;
        }
      });
      setTestVariables(sampleVariables);
    }
  }, [selectedTemplate]);

  const handleTemplateChange = (field: keyof EmailTemplate, value: string) => {
    if (!editedTemplate) return;
    
    setEditedTemplate(prev => prev ? { ...prev, [field]: value } : null);
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleSave = async () => {
    if (!editedTemplate || !selectedTemplate) return;
    
    setErrors({});
    const result = await onUpdateTemplate(selectedTemplate.id, editedTemplate);
    
    if (!result.success && result.errors) {
      const errorMap: Record<string, string> = {};
      result.errors.forEach((error: any) => {
        errorMap[error.field] = error.message;
      });
      setErrors(errorMap);
    } else {
      // Update the selected template with saved changes
      setSelectedTemplate(editedTemplate);
    }
  };

  const handlePreview = async () => {
    if (!selectedTemplate) return;
    
    setIsPreviewLoading(true);
    const result = await onPreviewTemplate(selectedTemplate.id, testVariables);
    
    if (result.success && result.preview) {
      setPreviewContent(result.preview);
      setPreviewMode('preview');
    } else {
      setErrors({ preview: 'Failed to generate preview' });
    }
    setIsPreviewLoading(false);
  };

  const handleSendTest = async () => {
    if (!selectedTemplate || !testEmail) return;
    
    setIsSendingTest(true);
    setErrors(prev => ({ ...prev, testEmail: '' }));
    
    const result = await onSendTestEmail(selectedTemplate.id, testEmail, testVariables);
    
    if (!result.success && result.errors) {
      setErrors(prev => ({ ...prev, testEmail: result.errors?.[0]?.message || 'Failed to send test email' }));
    }
    setIsSendingTest(false);
  };

  const insertVariable = (variable: string, field: 'subject' | 'htmlContent' | 'textContent') => {
    if (!editedTemplate) return;
    
    const currentValue = editedTemplate[field];
    const newValue = currentValue + variable;
    handleTemplateChange(field, newValue);
  };

  const getVariablesByCategory = () => {
    const allVariables = Object.values(AVAILABLE_VARIABLES).flat();
    return allVariables;
  };

  if (!canCustomizeEmails) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email Template Customization</CardTitle>
          <CardDescription>
            Email template customization is not available on your current plan.
            <Badge variant="outline" className="ml-2">Upgrade Required</Badge>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Email Template Customization</h2>
          <p className="text-muted-foreground">
            Customize email templates with your institution's branding and messaging
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setPreviewMode(previewMode === 'edit' ? 'preview' : 'edit')}
            disabled={!selectedTemplate}
          >
            {previewMode === 'edit' ? <Eye className="h-4 w-4 mr-2" /> : <Code className="h-4 w-4 mr-2" />}
            {previewMode === 'edit' ? 'Preview' : 'Edit'}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || !editedTemplate}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Template Selection */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Templates</CardTitle>
            <CardDescription>
              Select a template to customize
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {templates.map((template) => (
              <Button
                key={template.id}
                variant={selectedTemplate?.id === template.id ? 'default' : 'ghost'}
                className="w-full justify-start"
                onClick={() => setSelectedTemplate(template)}
              >
                <div className="text-left">
                  <div className="font-medium">{template.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {template.category}
                  </div>
                </div>
              </Button>
            ))}
          </CardContent>
        </Card>

        {/* Template Editor */}
        <Card className="lg:col-span-3">
          {selectedTemplate && editedTemplate ? (
            <div>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {editedTemplate.name}
                  <Badge variant="outline" className="capitalize">
                    {editedTemplate.category}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Customize the email template content and variables
                </CardDescription>
              </CardHeader>
              <CardContent>
                {previewMode === 'edit' ? (
                  <Tabs defaultValue="content" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="content">Content</TabsTrigger>
                      <TabsTrigger value="variables">Variables</TabsTrigger>
                      <TabsTrigger value="test">Test</TabsTrigger>
                    </TabsList>

                    <TabsContent value="content" className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="subject">Subject Line</Label>
                        <Input
                          id="subject"
                          value={editedTemplate.subject}
                          onChange={(e) => handleTemplateChange('subject', e.target.value)}
                          placeholder="Enter email subject..."
                        />
                        {errors.subject && (
                          <p className="text-sm text-red-500">{errors.subject}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="htmlContent">HTML Content</Label>
                        <Textarea
                          id="htmlContent"
                          value={editedTemplate.htmlContent}
                          onChange={(e) => handleTemplateChange('htmlContent', e.target.value)}
                          placeholder="Enter HTML email content..."
                          rows={12}
                          className="font-mono text-sm"
                        />
                        {errors.htmlContent && (
                          <p className="text-sm text-red-500">{errors.htmlContent}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="textContent">Plain Text Content</Label>
                        <Textarea
                          id="textContent"
                          value={editedTemplate.textContent}
                          onChange={(e) => handleTemplateChange('textContent', e.target.value)}
                          placeholder="Enter plain text email content..."
                          rows={8}
                        />
                        {errors.textContent && (
                          <p className="text-sm text-red-500">{errors.textContent}</p>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="variables" className="space-y-4">
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          Click on any variable below to insert it into your template content.
                          Variables will be replaced with actual values when emails are sent.
                        </AlertDescription>
                      </Alert>

                      {Object.entries(AVAILABLE_VARIABLES).map(([category, variables]) => (
                        <div key={category} className="space-y-2">
                          <h4 className="font-medium capitalize">{category} Variables</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {variables.map((variable) => (
                              <Button
                                key={variable}
                                variant="outline"
                                size="sm"
                                className="justify-start font-mono text-xs"
                                onClick={() => {
                                  // Insert into currently focused field or default to htmlContent
                                  insertVariable(variable, 'htmlContent');
                                }}
                              >
                                {variable}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))}

                      <div className="space-y-2">
                        <h4 className="font-medium">Current Template Variables</h4>
                        <div className="flex flex-wrap gap-2">
                          {editedTemplate.variables.map((variable) => (
                            <Badge key={variable} variant="secondary" className="font-mono text-xs">
                              {variable}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="test" className="space-y-4">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="testEmail">Test Email Address</Label>
                          <Input
                            id="testEmail"
                            type="email"
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            placeholder="test@example.com"
                          />
                          {errors.testEmail && (
                            <p className="text-sm text-red-500">{errors.testEmail}</p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Test Variables</Label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {Object.entries(testVariables).map(([variable, value]) => (
                              <div key={variable} className="space-y-1">
                                <Label className="text-xs font-mono">{variable}</Label>
                                <Input
                                  value={value}
                                  onChange={(e) => setTestVariables(prev => ({
                                    ...prev,
                                    [variable]: e.target.value
                                  }))}
                                  className="text-sm"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={handlePreview}
                            disabled={isPreviewLoading}
                            variant="outline"
                          >
                            {isPreviewLoading ? 'Generating...' : 'Generate Preview'}
                          </Button>
                          <Button
                            onClick={handleSendTest}
                            disabled={isSendingTest || !testEmail}
                          >
                            <Send className="h-4 w-4 mr-2" />
                            {isSendingTest ? 'Sending...' : 'Send Test Email'}
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                ) : (
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4">
                      <h4 className="font-medium mb-2">Email Preview</h4>
                      <div 
                        className="prose max-w-none"
                        dangerouslySetInnerHTML={{ __html: previewContent }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </div>
          ) : (
            <CardContent className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Select a template to start customizing</p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}