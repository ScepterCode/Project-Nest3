'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Eye, 
  Send, 
  Save, 
  Plus, 
  X, 
  Bold, 
  Italic, 
  Underline, 
  Link, 
  Image, 
  AlignLeft, 
  AlignCenter, 
  AlignRight,
  Code,
  Type,
  Palette
} from 'lucide-react';
import {
  NotificationTemplate,
  TemplateVariable,
  TemplateCondition,
  NotificationType,
  BrandingConfig,
  TemplatePreview
} from '@/lib/types/enhanced-notifications';

interface TemplateEditorProps {
  template?: NotificationTemplate;
  institutionId: string;
  branding?: BrandingConfig;
  onSave: (template: Omit<NotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onPreview: (templateData: any, variables: Record<string, any>) => Promise<TemplatePreview>;
  onTest: (templateData: any, recipients: string[], variables: Record<string, any>) => Promise<void>;
}

export function TemplateEditor({ 
  template, 
  institutionId, 
  branding, 
  onSave, 
  onPreview, 
  onTest 
}: TemplateEditorProps) {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    type: template?.type || NotificationType.CUSTOM,
    subject: template?.subject || '',
    htmlContent: template?.htmlContent || '',
    textContent: template?.textContent || '',
    isActive: template?.isActive ?? true
  });

  const [variables, setVariables] = useState<TemplateVariable[]>(template?.variables || []);
  const [conditions, setConditions] = useState<TemplateCondition[]>(template?.conditions || []);
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [testRecipients, setTestRecipients] = useState<string>('');
  const [testVariables, setTestVariables] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('content');

  const htmlEditorRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState('');

  // Initialize test variables based on template variables
  useEffect(() => {
    const initialTestVars: Record<string, any> = {};
    variables.forEach(variable => {
      initialTestVars[variable.name] = variable.defaultValue || 
        (variable.type === 'text' ? 'Sample Text' :
         variable.type === 'number' ? 123 :
         variable.type === 'date' ? new Date().toISOString().split('T')[0] :
         variable.type === 'boolean' ? true : 'Sample Value');
    });
    setTestVariables(initialTestVars);
  }, [variables]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleHtmlContentChange = () => {
    if (htmlEditorRef.current) {
      const content = htmlEditorRef.current.innerHTML;
      handleInputChange('htmlContent', content);
    }
  };

  const insertVariable = (variableName: string) => {
    const variableTag = `{{${variableName}}}`;
    
    if (htmlEditorRef.current && htmlEditorRef.current === document.activeElement) {
      document.execCommand('insertText', false, variableTag);
      handleHtmlContentChange();
    } else {
      // Insert into subject or text content based on active field
      const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
      if (activeElement && (activeElement.name === 'subject' || activeElement.name === 'textContent')) {
        const start = activeElement.selectionStart || 0;
        const end = activeElement.selectionEnd || 0;
        const value = activeElement.value;
        const newValue = value.substring(0, start) + variableTag + value.substring(end);
        
        if (activeElement.name === 'subject') {
          handleInputChange('subject', newValue);
        } else {
          handleInputChange('textContent', newValue);
        }
        
        // Set cursor position after the inserted variable
        setTimeout(() => {
          activeElement.selectionStart = activeElement.selectionEnd = start + variableTag.length;
          activeElement.focus();
        }, 0);
      }
    }
  };

  const formatText = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    handleHtmlContentChange();
  };

  const addVariable = () => {
    const newVariable: TemplateVariable = {
      name: `variable_${variables.length + 1}`,
      type: 'text',
      description: '',
      required: false
    };
    setVariables([...variables, newVariable]);
  };

  const updateVariable = (index: number, field: keyof TemplateVariable, value: any) => {
    const updated = [...variables];
    updated[index] = { ...updated[index], [field]: value };
    setVariables(updated);
  };

  const removeVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index));
  };

  const addCondition = () => {
    const newCondition: TemplateCondition = {
      field: '',
      operator: 'equals',
      value: '',
      action: 'show'
    };
    setConditions([...conditions, newCondition]);
  };

  const updateCondition = (index: number, field: keyof TemplateCondition, value: any) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value };
    setConditions(updated);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handlePreview = async () => {
    setIsLoading(true);
    try {
      const templateData = {
        ...formData,
        variables,
        conditions,
        institutionId,
        branding
      };
      const previewResult = await onPreview(templateData, testVariables);
      setPreview(previewResult);
      setActiveTab('preview');
    } catch (error) {
      console.error('Preview failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTest = async () => {
    if (!testRecipients.trim()) return;
    
    setIsLoading(true);
    try {
      const recipients = testRecipients.split(',').map(email => email.trim()).filter(Boolean);
      const templateData = {
        ...formData,
        variables,
        conditions,
        institutionId,
        branding
      };
      await onTest(templateData, recipients, testVariables);
    } catch (error) {
      console.error('Test failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await onSave({
        ...formData,
        variables,
        conditions,
        institutionId,
        branding
      });
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyBranding = (content: string): string => {
    if (!branding) return content;
    
    const brandedContent = `
      <div style="
        font-family: ${branding.fontFamily};
        font-size: ${branding.fontSize};
        color: ${branding.textColor};
        background-color: ${branding.backgroundColor};
        padding: 20px;
        max-width: 600px;
        margin: 0 auto;
      ">
        ${branding.logoUrl ? `<img src="${branding.logoUrl}" alt="Logo" style="max-width: 200px; margin-bottom: 20px;" />` : ''}
        ${content}
        ${branding.customCss ? `<style>${branding.customCss}</style>` : ''}
      </div>
    `;
    
    return brandedContent;
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {template ? 'Edit Template' : 'Create Template'}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePreview} disabled={isLoading}>
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={isLoading || !testRecipients.trim()}>
            <Send className="w-4 h-4 mr-2" />
            Test
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="variables">Variables</TabsTrigger>
          <TabsTrigger value="conditions">Conditions</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Template Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Template Name</Label>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="Enter template name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="type">Template Type</Label>
                      <Select value={formData.type} onValueChange={(value) => handleInputChange('type', value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(NotificationType).map(type => (
                            <SelectItem key={type} value={type}>
                              {type.replace('_', ' ').toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="subject">Subject Line</Label>
                    <Input
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={(e) => handleInputChange('subject', e.target.value)}
                      placeholder="Enter email subject"
                    />
                  </div>

                  <div>
                    <Label>HTML Content</Label>
                    <div className="border rounded-md">
                      <div className="flex items-center gap-1 p-2 border-b bg-gray-50">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => formatText('bold')}
                        >
                          <Bold className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => formatText('italic')}
                        >
                          <Italic className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => formatText('underline')}
                        >
                          <Underline className="w-4 h-4" />
                        </Button>
                        <Separator orientation="vertical" className="h-6" />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => formatText('justifyLeft')}
                        >
                          <AlignLeft className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => formatText('justifyCenter')}
                        >
                          <AlignCenter className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => formatText('justifyRight')}
                        >
                          <AlignRight className="w-4 h-4" />
                        </Button>
                        <Separator orientation="vertical" className="h-6" />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => formatText('createLink', prompt('Enter URL:') || '')}
                        >
                          <Link className="w-4 h-4" />
                        </Button>
                      </div>
                      <div
                        ref={htmlEditorRef}
                        contentEditable
                        className="min-h-[200px] p-4 focus:outline-none"
                        dangerouslySetInnerHTML={{ __html: formData.htmlContent }}
                        onInput={handleHtmlContentChange}
                        onBlur={handleHtmlContentChange}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="textContent">Plain Text Content (Optional)</Label>
                    <Textarea
                      id="textContent"
                      name="textContent"
                      value={formData.textContent}
                      onChange={(e) => handleInputChange('textContent', e.target.value)}
                      placeholder="Enter plain text version"
                      rows={6}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="isActive"
                      checked={formData.isActive}
                      onCheckedChange={(checked) => handleInputChange('isActive', checked)}
                    />
                    <Label htmlFor="isActive">Template is active</Label>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Type className="w-4 h-4" />
                    Available Variables
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {variables.map((variable, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
                          onClick={() => insertVariable(variable.name)}
                        >
                          <div>
                            <div className="font-medium text-sm">{variable.name}</div>
                            <div className="text-xs text-gray-500">{variable.description}</div>
                          </div>
                          <Badge variant={variable.required ? 'default' : 'secondary'}>
                            {variable.type}
                          </Badge>
                        </div>
                      ))}
                      {variables.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-4">
                          No variables defined. Add variables in the Variables tab.
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {branding && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Palette className="w-4 h-4" />
                      Branding Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded border"
                          style={{ backgroundColor: branding.primaryColor }}
                        />
                        <span>Primary: {branding.primaryColor}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded border"
                          style={{ backgroundColor: branding.secondaryColor }}
                        />
                        <span>Secondary: {branding.secondaryColor}</span>
                      </div>
                      <div>Font: {branding.fontFamily}</div>
                      <div>Size: {branding.fontSize}</div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="variables" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Template Variables</CardTitle>
                <Button onClick={addVariable} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Variable
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {variables.map((variable, index) => (
                  <div key={index} className="p-4 border rounded-lg">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <Label>Variable Name</Label>
                        <Input
                          value={variable.name}
                          onChange={(e) => updateVariable(index, 'name', e.target.value)}
                          placeholder="variable_name"
                        />
                      </div>
                      <div>
                        <Label>Type</Label>
                        <Select 
                          value={variable.type} 
                          onValueChange={(value) => updateVariable(index, 'type', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="boolean">Boolean</SelectItem>
                            <SelectItem value="object">Object</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="mb-4">
                      <Label>Description</Label>
                      <Input
                        value={variable.description}
                        onChange={(e) => updateVariable(index, 'description', e.target.value)}
                        placeholder="Describe this variable"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={variable.required}
                          onCheckedChange={(checked) => updateVariable(index, 'required', checked)}
                        />
                        <Label>Required</Label>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeVariable(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {variables.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No variables defined. Click "Add Variable" to create one.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conditions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Conditional Logic</CardTitle>
                <Button onClick={addCondition} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Condition
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {conditions.map((condition, index) => (
                  <div key={index} className="p-4 border rounded-lg">
                    <div className="grid grid-cols-4 gap-4 mb-4">
                      <div>
                        <Label>Field</Label>
                        <Input
                          value={condition.field}
                          onChange={(e) => updateCondition(index, 'field', e.target.value)}
                          placeholder="field_name"
                        />
                      </div>
                      <div>
                        <Label>Operator</Label>
                        <Select 
                          value={condition.operator} 
                          onValueChange={(value) => updateCondition(index, 'operator', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">Equals</SelectItem>
                            <SelectItem value="not_equals">Not Equals</SelectItem>
                            <SelectItem value="contains">Contains</SelectItem>
                            <SelectItem value="not_contains">Not Contains</SelectItem>
                            <SelectItem value="greater_than">Greater Than</SelectItem>
                            <SelectItem value="less_than">Less Than</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Value</Label>
                        <Input
                          value={condition.value}
                          onChange={(e) => updateCondition(index, 'value', e.target.value)}
                          placeholder="comparison_value"
                        />
                      </div>
                      <div>
                        <Label>Action</Label>
                        <Select 
                          value={condition.action} 
                          onValueChange={(value) => updateCondition(index, 'action', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="show">Show</SelectItem>
                            <SelectItem value="hide">Hide</SelectItem>
                            <SelectItem value="modify">Modify</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeCondition(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {conditions.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No conditions defined. Click "Add Condition" to create one.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="space-y-4">
          {preview ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Email Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label>Subject</Label>
                      <div className="p-2 bg-gray-50 rounded border">
                        {preview.subject}
                      </div>
                    </div>
                    <div>
                      <Label>HTML Content</Label>
                      <div 
                        className="p-4 border rounded min-h-[300px] bg-white"
                        dangerouslySetInnerHTML={{ 
                          __html: branding ? applyBranding(preview.htmlContent) : preview.htmlContent 
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Plain Text Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-4 bg-gray-50 rounded border min-h-[300px] whitespace-pre-wrap font-mono text-sm">
                    {preview.textContent || 'No plain text version available'}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-gray-500">Click "Preview" to see how your template will look</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="test" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Template</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="testRecipients">Test Recipients (comma-separated emails)</Label>
                <Textarea
                  id="testRecipients"
                  value={testRecipients}
                  onChange={(e) => setTestRecipients(e.target.value)}
                  placeholder="test@example.com, admin@example.com"
                  rows={3}
                />
              </div>

              <div>
                <Label>Test Variable Values</Label>
                <div className="space-y-2 mt-2">
                  {variables.map((variable, index) => (
                    <div key={index} className="grid grid-cols-2 gap-4">
                      <Label className="text-sm">{variable.name}</Label>
                      <Input
                        value={testVariables[variable.name] || ''}
                        onChange={(e) => setTestVariables(prev => ({
                          ...prev,
                          [variable.name]: e.target.value
                        }))}
                        placeholder={`Test value for ${variable.name}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Button 
                onClick={handleTest} 
                disabled={isLoading || !testRecipients.trim()}
                className="w-full"
              >
                <Send className="w-4 h-4 mr-2" />
                Send Test Email
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}