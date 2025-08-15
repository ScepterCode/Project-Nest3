'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Save, 
  Upload, 
  Palette, 
  Type, 
  Image,
  Eye,
  RefreshCw
} from 'lucide-react';
import { BrandingConfig } from '@/lib/types/enhanced-notifications';

interface BrandingConfigProps {
  branding?: BrandingConfig;
  onSave: (branding: BrandingConfig) => Promise<void>;
  onPreview: (branding: BrandingConfig) => void;
}

export function BrandingConfiguration({ branding, onSave, onPreview }: BrandingConfigProps) {
  const [formData, setFormData] = useState<BrandingConfig>({
    primary_color: '#007bff',
    secondary_color: '#6c757d',
    font_family: 'Arial, sans-serif',
    ...branding
  });

  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (branding) {
      setFormData(branding);
      if (branding.logo_url) {
        setLogoPreview(branding.logo_url);
      }
    }
  }, [branding]);

  const handleInputChange = (field: keyof BrandingConfig, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setLogoFile(file);
      
      // Create preview URL
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let logoUrl = formData.logo_url;
      
      // If a new logo file was uploaded, we would upload it here
      // For now, we'll use the preview URL (in a real app, you'd upload to storage)
      if (logoFile && logoPreview) {
        logoUrl = logoPreview; // In production, this would be the uploaded file URL
      }

      await onSave({
        ...formData,
        logo_url: logoUrl
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = () => {
    onPreview({
      ...formData,
      logo_url: logoPreview || formData.logo_url
    });
  };

  const resetToDefaults = () => {
    setFormData({
      primary_color: '#007bff',
      secondary_color: '#6c757d',
      font_family: 'Arial, sans-serif',
      header_text: '',
      footer_text: '',
      custom_css: ''
    });
    setLogoFile(null);
    setLogoPreview(null);
  };

  const colorPresets = [
    { name: 'Blue', primary: '#007bff', secondary: '#6c757d' },
    { name: 'Green', primary: '#28a745', secondary: '#6c757d' },
    { name: 'Red', primary: '#dc3545', secondary: '#6c757d' },
    { name: 'Purple', primary: '#6f42c1', secondary: '#6c757d' },
    { name: 'Orange', primary: '#fd7e14', secondary: '#6c757d' },
    { name: 'Teal', primary: '#20c997', secondary: '#6c757d' }
  ];

  const fontOptions = [
    'Arial, sans-serif',
    'Helvetica, sans-serif',
    'Georgia, serif',
    'Times New Roman, serif',
    'Verdana, sans-serif',
    'Trebuchet MS, sans-serif',
    'Courier New, monospace'
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Branding Configuration</h2>
          <p className="text-gray-600">
            Customize the look and feel of your notification emails
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetToDefaults}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button variant="outline" onClick={handlePreview}>
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="colors" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="colors">Colors</TabsTrigger>
          <TabsTrigger value="logo">Logo & Images</TabsTrigger>
          <TabsTrigger value="typography">Typography</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
        </TabsList>

        {/* Colors Tab */}
        <TabsContent value="colors" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                Color Scheme
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Color Presets */}
              <div>
                <Label className="text-base font-medium">Quick Presets</Label>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {colorPresets.map((preset) => (
                    <Button
                      key={preset.name}
                      variant="outline"
                      className="h-auto p-3 flex flex-col items-center gap-2"
                      onClick={() => {
                        handleInputChange('primary_color', preset.primary);
                        handleInputChange('secondary_color', preset.secondary);
                      }}
                    >
                      <div className="flex gap-1">
                        <div 
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: preset.primary }}
                        />
                        <div 
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: preset.secondary }}
                        />
                      </div>
                      <span className="text-xs">{preset.name}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Custom Colors */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="primary_color">Primary Color</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      id="primary_color"
                      type="color"
                      value={formData.primary_color}
                      onChange={(e) => handleInputChange('primary_color', e.target.value)}
                      className="w-12 h-10 p-1 border rounded"
                    />
                    <Input
                      value={formData.primary_color}
                      onChange={(e) => handleInputChange('primary_color', e.target.value)}
                      placeholder="#007bff"
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Used for headers, buttons, and links
                  </p>
                </div>

                <div>
                  <Label htmlFor="secondary_color">Secondary Color</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      id="secondary_color"
                      type="color"
                      value={formData.secondary_color}
                      onChange={(e) => handleInputChange('secondary_color', e.target.value)}
                      className="w-12 h-10 p-1 border rounded"
                    />
                    <Input
                      value={formData.secondary_color}
                      onChange={(e) => handleInputChange('secondary_color', e.target.value)}
                      placeholder="#6c757d"
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Used for subtle elements and borders
                  </p>
                </div>
              </div>

              {/* Color Preview */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-3">Preview</h4>
                <div className="space-y-2">
                  <div 
                    className="h-8 rounded flex items-center px-3 text-white text-sm"
                    style={{ backgroundColor: formData.primary_color }}
                  >
                    Primary Color - Headers & Buttons
                  </div>
                  <div 
                    className="h-6 rounded flex items-center px-3 text-white text-xs"
                    style={{ backgroundColor: formData.secondary_color }}
                  >
                    Secondary Color - Subtle Elements
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logo Tab */}
        <TabsContent value="logo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="w-4 h-4" />
                Logo & Images
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="logo-upload">Institution Logo</Label>
                <div className="mt-2 space-y-4">
                  {logoPreview && (
                    <div className="border rounded-lg p-4 bg-gray-50">
                      <img 
                        src={logoPreview} 
                        alt="Logo preview" 
                        className="max-h-16 max-w-full object-contain"
                      />
                    </div>
                  )}
                  
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('logo-upload')?.click()}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Logo
                    </Button>
                    <input
                      id="logo-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <span className="text-sm text-gray-500">
                      Recommended: PNG or SVG, max 200px height
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="logo_url">Logo URL (Alternative)</Label>
                <Input
                  id="logo_url"
                  value={formData.logo_url || ''}
                  onChange={(e) => handleInputChange('logo_url', e.target.value)}
                  placeholder="https://example.com/logo.png"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Or provide a direct URL to your logo image
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Typography Tab */}
        <TabsContent value="typography" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Type className="w-4 h-4" />
                Typography
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="font_family">Font Family</Label>
                <select
                  id="font_family"
                  value={formData.font_family}
                  onChange={(e) => handleInputChange('font_family', e.target.value)}
                  className="w-full mt-1 p-2 border rounded-md"
                >
                  {fontOptions.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </div>

              {/* Font Preview */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-3">Font Preview</h4>
                <div style={{ fontFamily: formData.font_family }}>
                  <h3 className="text-lg font-bold mb-2">Heading Text</h3>
                  <p className="text-base mb-2">
                    This is how regular paragraph text will appear in your notifications.
                  </p>
                  <p className="text-sm text-gray-600">
                    This is smaller text for captions and footnotes.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Content Tab */}
        <TabsContent value="content" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Default Content</CardTitle>
              <p className="text-sm text-gray-600">
                Set default header and footer text for all notifications
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="header_text">Header Text</Label>
                <Input
                  id="header_text"
                  value={formData.header_text || ''}
                  onChange={(e) => handleInputChange('header_text', e.target.value)}
                  placeholder="Welcome to [Institution Name]"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Appears at the top of notification emails
                </p>
              </div>

              <div>
                <Label htmlFor="footer_text">Footer Text</Label>
                <Textarea
                  id="footer_text"
                  value={formData.footer_text || ''}
                  onChange={(e) => handleInputChange('footer_text', e.target.value)}
                  placeholder="© 2024 [Institution Name]. All rights reserved."
                  rows={3}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Appears at the bottom of notification emails
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custom CSS</CardTitle>
              <p className="text-sm text-gray-600">
                Add custom CSS for advanced styling (optional)
              </p>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.custom_css || ''}
                onChange={(e) => handleInputChange('custom_css', e.target.value)}
                placeholder=".custom-class { color: red; }"
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Advanced users can add custom CSS rules here
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}