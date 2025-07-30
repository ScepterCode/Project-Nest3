'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { BrandingConfig } from '@/lib/types/institution';

interface BrandingConfigInterfaceProps {
  institutionId: string;
  currentBranding: BrandingConfig;
  onUpdate: (branding: Partial<BrandingConfig>) => Promise<{ success: boolean; errors?: any[] }>;
  onLogoUpload: (file: File) => Promise<{ success: boolean; logoUrl?: string; errors?: any[] }>;
  isLoading?: boolean;
  canCustomize?: boolean;
}

export function BrandingConfigInterface({
  institutionId,
  currentBranding,
  onUpdate,
  onLogoUpload,
  isLoading = false,
  canCustomize = true
}: BrandingConfigInterfaceProps) {
  const [branding, setBranding] = useState<BrandingConfig>(currentBranding);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [realTimePreview, setRealTimePreview] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBranding(currentBranding);
  }, [currentBranding]);

  const handleColorChange = (field: keyof BrandingConfig, value: string) => {
    setBranding(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleTextChange = (field: keyof BrandingConfig, value: string) => {
    setBranding(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrors(prev => ({ ...prev, logo: '' }));

    try {
      const result = await onLogoUpload(file);
      if (result.success && result.logoUrl) {
        setBranding(prev => ({ ...prev, logo: result.logoUrl }));
      } else {
        setErrors(prev => ({
          ...prev,
          logo: result.errors?.[0]?.message || 'Failed to upload logo'
        }));
      }
    } catch (error) {
      setErrors(prev => ({ ...prev, logo: 'Unexpected error uploading logo' }));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setErrors({});
    
    const result = await onUpdate(branding);
    if (!result.success && result.errors) {
      const errorMap: Record<string, string> = {};
      result.errors.forEach((error: any) => {
        errorMap[error.field] = error.message;
      });
      setErrors(errorMap);
    }
  };

  const handleReset = () => {
    setBranding(currentBranding);
    setErrors({});
  };

  const isValidHexColor = (color: string) => {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  };

  const getPreviewStyle = () => ({
    '--primary-color': branding.primaryColor,
    '--secondary-color': branding.secondaryColor,
    '--accent-color': branding.accentColor,
    fontFamily: branding.fontFamily || 'inherit'
  } as React.CSSProperties);

  if (!canCustomize) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Branding Configuration</CardTitle>
          <CardDescription>
            Custom branding is not available on your current plan.
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
          <h2 className="text-2xl font-bold">Branding Configuration</h2>
          <p className="text-muted-foreground">
            Customize your institution's visual identity and branding
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setRealTimePreview(!realTimePreview)}
          >
            {realTimePreview ? 'Hide Preview' : 'Show Preview'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setPreviewMode(!previewMode)}
          >
            {previewMode ? 'Edit Mode' : 'Full Preview'}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={isLoading}
          >
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {(previewMode || realTimePreview) && (
        <Card style={getPreviewStyle()}>
          <CardHeader style={{ backgroundColor: 'var(--primary-color)', color: 'white' }}>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Live Preview</CardTitle>
                <CardDescription style={{ color: 'rgba(255,255,255,0.8)' }}>
                  Real-time preview of your branding changes
                </CardDescription>
              </div>
              {branding.logo && (
                <img
                  src={branding.logo}
                  alt="Institution Logo"
                  className="h-12 w-auto"
                />
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-6">
              {/* Navigation Preview */}
              <div className="border rounded-lg p-4" style={{ backgroundColor: 'var(--secondary-color)', color: 'white' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {branding.logo && (
                      <img src={branding.logo} alt="Logo" className="h-8 w-auto" />
                    )}
                    <span className="font-semibold">Institution Portal</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" style={{ backgroundColor: 'var(--accent-color)' }}>
                      Dashboard
                    </Button>
                    <Button size="sm" variant="outline" style={{ borderColor: 'white', color: 'white' }}>
                      Profile
                    </Button>
                  </div>
                </div>
              </div>

              {/* Welcome Section Preview */}
              <div className="space-y-4">
                <h3 className="text-2xl font-bold" style={{ color: 'var(--primary-color)' }}>
                  Welcome to Your Institution
                </h3>
                {branding.welcomeMessage && (
                  <p className="text-lg text-gray-700">{branding.welcomeMessage}</p>
                )}
                <div className="flex gap-3">
                  <Button style={{ backgroundColor: 'var(--primary-color)' }}>
                    Get Started
                  </Button>
                  <Button
                    variant="outline"
                    style={{ borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }}
                  >
                    Learn More
                  </Button>
                  <Button
                    variant="secondary"
                    style={{ backgroundColor: 'var(--secondary-color)', color: 'white' }}
                  >
                    Contact Us
                  </Button>
                </div>
              </div>

              {/* Card Preview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle style={{ color: 'var(--primary-color)' }}>
                      Course Enrollment
                    </CardTitle>
                    <CardDescription>
                      Manage your course registrations
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button size="sm" style={{ backgroundColor: 'var(--accent-color)' }}>
                      View Courses
                    </Button>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle style={{ color: 'var(--primary-color)' }}>
                      Academic Progress
                    </CardTitle>
                    <CardDescription>
                      Track your academic performance
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="h-2 rounded-full" 
                        style={{ backgroundColor: 'var(--accent-color)', width: '75%' }}
                      ></div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Footer Preview */}
              <div className="border-t pt-4 text-center text-sm text-gray-600">
                {branding.footerText || '© 2024 Your Institution. All rights reserved.'}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="colors" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="colors">Colors</TabsTrigger>
          <TabsTrigger value="logo">Logo & Assets</TabsTrigger>
          <TabsTrigger value="typography">Typography</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
        </TabsList>

        <TabsContent value="colors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Color Scheme</CardTitle>
              <CardDescription>
                Define your institution's primary color palette
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="primaryColor"
                      type="color"
                      value={branding.primaryColor}
                      onChange={(e) => handleColorChange('primaryColor', e.target.value)}
                      className="w-16 h-10 p-1 border rounded"
                    />
                    <Input
                      type="text"
                      value={branding.primaryColor}
                      onChange={(e) => handleColorChange('primaryColor', e.target.value)}
                      placeholder="#1f2937"
                      className={`flex-1 ${!isValidHexColor(branding.primaryColor) ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {errors.primaryColor && (
                    <p className="text-sm text-red-500">{errors.primaryColor}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="secondaryColor">Secondary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="secondaryColor"
                      type="color"
                      value={branding.secondaryColor}
                      onChange={(e) => handleColorChange('secondaryColor', e.target.value)}
                      className="w-16 h-10 p-1 border rounded"
                    />
                    <Input
                      type="text"
                      value={branding.secondaryColor}
                      onChange={(e) => handleColorChange('secondaryColor', e.target.value)}
                      placeholder="#374151"
                      className={`flex-1 ${!isValidHexColor(branding.secondaryColor) ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {errors.secondaryColor && (
                    <p className="text-sm text-red-500">{errors.secondaryColor}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accentColor">Accent Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="accentColor"
                      type="color"
                      value={branding.accentColor}
                      onChange={(e) => handleColorChange('accentColor', e.target.value)}
                      className="w-16 h-10 p-1 border rounded"
                    />
                    <Input
                      type="text"
                      value={branding.accentColor}
                      onChange={(e) => handleColorChange('accentColor', e.target.value)}
                      placeholder="#3b82f6"
                      className={`flex-1 ${!isValidHexColor(branding.accentColor) ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {errors.accentColor && (
                    <p className="text-sm text-red-500">{errors.accentColor}</p>
                  )}
                </div>
              </div>

              <div className="mt-6 p-4 border rounded-lg">
                <h4 className="font-medium mb-2">Color Preview</h4>
                <div className="flex gap-2">
                  <div
                    className="w-16 h-16 rounded border"
                    style={{ backgroundColor: branding.primaryColor }}
                    title="Primary Color"
                  />
                  <div
                    className="w-16 h-16 rounded border"
                    style={{ backgroundColor: branding.secondaryColor }}
                    title="Secondary Color"
                  />
                  <div
                    className="w-16 h-16 rounded border"
                    style={{ backgroundColor: branding.accentColor }}
                    title="Accent Color"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Logo & Visual Assets</CardTitle>
              <CardDescription>
                Upload and manage your institution's visual assets
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Institution Logo</Label>
                <div className="flex items-center gap-4">
                  {branding.logo && (
                    <img
                      src={branding.logo}
                      alt="Current logo"
                      className="h-16 w-auto border rounded"
                    />
                  )}
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/svg+xml"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? 'Uploading...' : 'Upload Logo'}
                    </Button>
                    <p className="text-sm text-muted-foreground mt-1">
                      Supported formats: JPEG, PNG, SVG (max 5MB)
                    </p>
                  </div>
                </div>
                {errors.logo && (
                  <p className="text-sm text-red-500">{errors.logo}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="favicon">Favicon URL</Label>
                <Input
                  id="favicon"
                  type="url"
                  value={branding.favicon || ''}
                  onChange={(e) => handleTextChange('favicon', e.target.value)}
                  placeholder="https://example.com/favicon.ico"
                />
                {errors.favicon && (
                  <p className="text-sm text-red-500">{errors.favicon}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="typography" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Typography</CardTitle>
              <CardDescription>
                Customize fonts and text styling
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fontFamily">Font Family</Label>
                <Input
                  id="fontFamily"
                  type="text"
                  value={branding.fontFamily || ''}
                  onChange={(e) => handleTextChange('fontFamily', e.target.value)}
                  placeholder="Inter, system-ui, sans-serif"
                />
                <p className="text-sm text-muted-foreground">
                  Specify font family names separated by commas
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customCSS">Custom CSS</Label>
                <Textarea
                  id="customCSS"
                  value={branding.customCSS || ''}
                  onChange={(e) => handleTextChange('customCSS', e.target.value)}
                  placeholder="/* Add custom CSS styles here */"
                  rows={8}
                  className="font-mono text-sm"
                />
                <p className="text-sm text-muted-foreground">
                  Add custom CSS to further customize your institution's appearance (max 10,000 characters)
                </p>
                {errors.customCSS && (
                  <p className="text-sm text-red-500">{errors.customCSS}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Content & Messaging</CardTitle>
              <CardDescription>
                Customize text content and messaging
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="welcomeMessage">Welcome Message</Label>
                <Textarea
                  id="welcomeMessage"
                  value={branding.welcomeMessage || ''}
                  onChange={(e) => handleTextChange('welcomeMessage', e.target.value)}
                  placeholder="Welcome to our institution..."
                  rows={3}
                />
                <p className="text-sm text-muted-foreground">
                  This message will be displayed on the welcome page
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="footerText">Footer Text</Label>
                <Input
                  id="footerText"
                  type="text"
                  value={branding.footerText || ''}
                  onChange={(e) => handleTextChange('footerText', e.target.value)}
                  placeholder="© 2024 Your Institution. All rights reserved."
                />
                <p className="text-sm text-muted-foreground">
                  Text to display in the page footer
                </p>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium">Email Templates</h4>
                
                <div className="space-y-2">
                  <Label htmlFor="welcomeEmailTemplate">Welcome Email Template</Label>
                  <Textarea
                    id="welcomeEmailTemplate"
                    value={branding.emailTemplates?.welcome || ''}
                    onChange={(e) => handleTextChange('emailTemplates', {
                      ...branding.emailTemplates,
                      welcome: e.target.value
                    } as any)}
                    placeholder="Welcome to {{institutionName}}..."
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invitationEmailTemplate">Invitation Email Template</Label>
                  <Textarea
                    id="invitationEmailTemplate"
                    value={branding.emailTemplates?.invitation || ''}
                    onChange={(e) => handleTextChange('emailTemplates', {
                      ...branding.emailTemplates,
                      invitation: e.target.value
                    } as any)}
                    placeholder="You've been invited to join {{institutionName}}..."
                    rows={4}
                  />
                </div>

                <p className="text-sm text-muted-foreground">
                  Use {{institutionName}}, {{userName}}, and other variables in your templates
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}