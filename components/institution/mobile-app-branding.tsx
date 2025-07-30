'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Smartphone, Upload, Eye, Download, Info } from 'lucide-react';

interface MobileAppBrandingConfig {
  appName: string;
  appIcon: string;
  splashScreenLogo: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  statusBarStyle: 'light' | 'dark' | 'auto';
  navigationBarColor: string;
  tabBarColor: string;
  welcomeMessage: string;
  pushNotificationIcon: string;
  customFonts: {
    primary: string;
    secondary: string;
  };
  darkModeSupport: boolean;
  darkModeColors?: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    backgroundColor: string;
  };
}

interface MobileAppBrandingProps {
  institutionId: string;
  currentConfig: MobileAppBrandingConfig;
  onUpdate: (config: Partial<MobileAppBrandingConfig>) => Promise<{ success: boolean; errors?: any[] }>;
  onUploadAsset: (file: File, assetType: string) => Promise<{ success: boolean; assetUrl?: string; errors?: any[] }>;
  onGeneratePreview: (config: MobileAppBrandingConfig) => Promise<{ success: boolean; previewUrl?: string; errors?: any[] }>;
  isLoading?: boolean;
  canCustomizeMobileApp?: boolean;
}

const DEVICE_PREVIEWS = [
  { name: 'iPhone 14', width: 390, height: 844, scale: 0.3 },
  { name: 'iPhone SE', width: 375, height: 667, scale: 0.3 },
  { name: 'Android Large', width: 412, height: 892, scale: 0.3 },
  { name: 'Android Medium', width: 360, height: 640, scale: 0.3 }
];

export function MobileAppBranding({
  institutionId,
  currentConfig,
  onUpdate,
  onUploadAsset,
  onGeneratePreview,
  isLoading = false,
  canCustomizeMobileApp = true
}: MobileAppBrandingProps) {
  const [config, setConfig] = useState<MobileAppBrandingConfig>(currentConfig);
  const [selectedDevice, setSelectedDevice] = useState(DEVICE_PREVIEWS[0]);
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState<Record<string, boolean>>({});
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  const fileInputRefs = {
    appIcon: useRef<HTMLInputElement>(null),
    splashScreenLogo: useRef<HTMLInputElement>(null),
    pushNotificationIcon: useRef<HTMLInputElement>(null)
  };

  const handleConfigChange = (field: keyof MobileAppBrandingConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleNestedConfigChange = (parent: string, field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [parent]: {
        ...(prev[parent as keyof MobileAppBrandingConfig] as any),
        [field]: value
      }
    }));
  };

  const handleAssetUpload = async (event: React.ChangeEvent<HTMLInputElement>, assetType: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(prev => ({ ...prev, [assetType]: true }));
    setErrors(prev => ({ ...prev, [assetType]: '' }));

    try {
      const result = await onUploadAsset(file, assetType);
      if (result.success && result.assetUrl) {
        handleConfigChange(assetType as keyof MobileAppBrandingConfig, result.assetUrl);
      } else {
        setErrors(prev => ({
          ...prev,
          [assetType]: result.errors?.[0]?.message || 'Failed to upload asset'
        }));
      }
    } catch (error) {
      setErrors(prev => ({ ...prev, [assetType]: 'Unexpected error uploading asset' }));
    } finally {
      setIsUploading(prev => ({ ...prev, [assetType]: false }));
    }
  };

  const handleSave = async () => {
    setErrors({});
    const result = await onUpdate(config);
    
    if (!result.success && result.errors) {
      const errorMap: Record<string, string> = {};
      result.errors.forEach((error: any) => {
        errorMap[error.field] = error.message;
      });
      setErrors(errorMap);
    }
  };

  const handleGeneratePreview = async () => {
    setIsGeneratingPreview(true);
    try {
      const result = await onGeneratePreview(config);
      if (result.success && result.previewUrl) {
        setPreviewUrl(result.previewUrl);
      }
    } catch (error) {
      setErrors({ preview: 'Failed to generate preview' });
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const getPreviewStyle = () => {
    const colors = previewMode === 'dark' && config.darkModeSupport && config.darkModeColors
      ? config.darkModeColors
      : {
          primaryColor: config.primaryColor,
          secondaryColor: config.secondaryColor,
          accentColor: config.accentColor,
          backgroundColor: '#ffffff'
        };

    return {
      '--primary-color': colors.primaryColor,
      '--secondary-color': colors.secondaryColor,
      '--accent-color': colors.accentColor,
      '--background-color': colors.backgroundColor || '#ffffff',
      '--navigation-bar-color': config.navigationBarColor,
      '--tab-bar-color': config.tabBarColor,
      fontFamily: config.customFonts.primary || 'system-ui, sans-serif'
    } as React.CSSProperties;
  };

  if (!canCustomizeMobileApp) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mobile App Branding</CardTitle>
          <CardDescription>
            Mobile app branding customization is not available on your current plan.
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
          <h2 className="text-2xl font-bold">Mobile App Branding</h2>
          <p className="text-muted-foreground">
            Customize your institution's mobile app appearance and branding
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleGeneratePreview}
            disabled={isGeneratingPreview}
          >
            <Eye className="h-4 w-4 mr-2" />
            {isGeneratingPreview ? 'Generating...' : 'Generate Preview'}
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="colors">Colors</TabsTrigger>
              <TabsTrigger value="assets">Assets</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>App Information</CardTitle>
                  <CardDescription>
                    Basic app configuration and naming
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="appName">App Name</Label>
                    <Input
                      id="appName"
                      value={config.appName}
                      onChange={(e) => handleConfigChange('appName', e.target.value)}
                      placeholder="Your Institution App"
                    />
                    {errors.appName && (
                      <p className="text-sm text-red-500">{errors.appName}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="welcomeMessage">Welcome Message</Label>
                    <Textarea
                      id="welcomeMessage"
                      value={config.welcomeMessage}
                      onChange={(e) => handleConfigChange('welcomeMessage', e.target.value)}
                      placeholder="Welcome to our mobile app..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="statusBarStyle">Status Bar Style</Label>
                    <Select
                      value={config.statusBarStyle}
                      onValueChange={(value) => handleConfigChange('statusBarStyle', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="auto">Auto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="colors" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Color Scheme</CardTitle>
                  <CardDescription>
                    Define your app's color palette
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="primaryColor">Primary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={config.primaryColor}
                          onChange={(e) => handleConfigChange('primaryColor', e.target.value)}
                          className="w-16 h-10 p-1"
                        />
                        <Input
                          value={config.primaryColor}
                          onChange={(e) => handleConfigChange('primaryColor', e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="secondaryColor">Secondary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={config.secondaryColor}
                          onChange={(e) => handleConfigChange('secondaryColor', e.target.value)}
                          className="w-16 h-10 p-1"
                        />
                        <Input
                          value={config.secondaryColor}
                          onChange={(e) => handleConfigChange('secondaryColor', e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="accentColor">Accent Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={config.accentColor}
                          onChange={(e) => handleConfigChange('accentColor', e.target.value)}
                          className="w-16 h-10 p-1"
                        />
                        <Input
                          value={config.accentColor}
                          onChange={(e) => handleConfigChange('accentColor', e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="navigationBarColor">Navigation Bar</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={config.navigationBarColor}
                          onChange={(e) => handleConfigChange('navigationBarColor', e.target.value)}
                          className="w-16 h-10 p-1"
                        />
                        <Input
                          value={config.navigationBarColor}
                          onChange={(e) => handleConfigChange('navigationBarColor', e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="darkModeSupport"
                        checked={config.darkModeSupport}
                        onCheckedChange={(checked) => handleConfigChange('darkModeSupport', checked)}
                      />
                      <Label htmlFor="darkModeSupport">Enable Dark Mode Support</Label>
                    </div>

                    {config.darkModeSupport && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Dark Mode Colors</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Dark Primary Color</Label>
                            <div className="flex gap-2">
                              <Input
                                type="color"
                                value={config.darkModeColors?.primaryColor || config.primaryColor}
                                onChange={(e) => handleNestedConfigChange('darkModeColors', 'primaryColor', e.target.value)}
                                className="w-16 h-10 p-1"
                              />
                              <Input
                                value={config.darkModeColors?.primaryColor || config.primaryColor}
                                onChange={(e) => handleNestedConfigChange('darkModeColors', 'primaryColor', e.target.value)}
                                className="flex-1"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Dark Background Color</Label>
                            <div className="flex gap-2">
                              <Input
                                type="color"
                                value={config.darkModeColors?.backgroundColor || '#1a1a1a'}
                                onChange={(e) => handleNestedConfigChange('darkModeColors', 'backgroundColor', e.target.value)}
                                className="w-16 h-10 p-1"
                              />
                              <Input
                                value={config.darkModeColors?.backgroundColor || '#1a1a1a'}
                                onChange={(e) => handleNestedConfigChange('darkModeColors', 'backgroundColor', e.target.value)}
                                className="flex-1"
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="assets" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>App Assets</CardTitle>
                  <CardDescription>
                    Upload icons and images for your mobile app
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* App Icon */}
                  <div className="space-y-2">
                    <Label>App Icon</Label>
                    <div className="flex items-center gap-4">
                      {config.appIcon && (
                        <img
                          src={config.appIcon}
                          alt="App icon"
                          className="w-16 h-16 rounded-lg border"
                        />
                      )}
                      <div className="flex-1">
                        <input
                          ref={fileInputRefs.appIcon}
                          type="file"
                          accept="image/png"
                          onChange={(e) => handleAssetUpload(e, 'appIcon')}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          onClick={() => fileInputRefs.appIcon.current?.click()}
                          disabled={isUploading.appIcon}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {isUploading.appIcon ? 'Uploading...' : 'Upload Icon'}
                        </Button>
                        <p className="text-sm text-muted-foreground mt-1">
                          PNG format, 1024x1024px recommended
                        </p>
                      </div>
                    </div>
                    {errors.appIcon && (
                      <p className="text-sm text-red-500">{errors.appIcon}</p>
                    )}
                  </div>

                  {/* Splash Screen Logo */}
                  <div className="space-y-2">
                    <Label>Splash Screen Logo</Label>
                    <div className="flex items-center gap-4">
                      {config.splashScreenLogo && (
                        <img
                          src={config.splashScreenLogo}
                          alt="Splash screen logo"
                          className="w-16 h-16 rounded border"
                        />
                      )}
                      <div className="flex-1">
                        <input
                          ref={fileInputRefs.splashScreenLogo}
                          type="file"
                          accept="image/png,image/svg+xml"
                          onChange={(e) => handleAssetUpload(e, 'splashScreenLogo')}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          onClick={() => fileInputRefs.splashScreenLogo.current?.click()}
                          disabled={isUploading.splashScreenLogo}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {isUploading.splashScreenLogo ? 'Uploading...' : 'Upload Logo'}
                        </Button>
                        <p className="text-sm text-muted-foreground mt-1">
                          PNG or SVG format, transparent background recommended
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Push Notification Icon */}
                  <div className="space-y-2">
                    <Label>Push Notification Icon</Label>
                    <div className="flex items-center gap-4">
                      {config.pushNotificationIcon && (
                        <img
                          src={config.pushNotificationIcon}
                          alt="Push notification icon"
                          className="w-8 h-8 rounded border"
                        />
                      )}
                      <div className="flex-1">
                        <input
                          ref={fileInputRefs.pushNotificationIcon}
                          type="file"
                          accept="image/png"
                          onChange={(e) => handleAssetUpload(e, 'pushNotificationIcon')}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          onClick={() => fileInputRefs.pushNotificationIcon.current?.click()}
                          disabled={isUploading.pushNotificationIcon}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {isUploading.pushNotificationIcon ? 'Uploading...' : 'Upload Icon'}
                        </Button>
                        <p className="text-sm text-muted-foreground mt-1">
                          PNG format, 24x24px, monochrome recommended
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Advanced Settings</CardTitle>
                  <CardDescription>
                    Typography and advanced customization options
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="primaryFont">Primary Font</Label>
                    <Input
                      id="primaryFont"
                      value={config.customFonts.primary}
                      onChange={(e) => handleNestedConfigChange('customFonts', 'primary', e.target.value)}
                      placeholder="system-ui, sans-serif"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="secondaryFont">Secondary Font</Label>
                    <Input
                      id="secondaryFont"
                      value={config.customFonts.secondary}
                      onChange={(e) => handleNestedConfigChange('customFonts', 'secondary', e.target.value)}
                      placeholder="system-ui, sans-serif"
                    />
                  </div>

                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Font changes will be applied in the next app update. Custom fonts must be included in the app bundle.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Mobile Preview */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Mobile Preview
              </CardTitle>
              <CardDescription>
                Live preview of your mobile app branding
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Select
                  value={selectedDevice.name}
                  onValueChange={(value) => {
                    const device = DEVICE_PREVIEWS.find(d => d.name === value);
                    if (device) setSelectedDevice(device);
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEVICE_PREVIEWS.map((device) => (
                      <SelectItem key={device.name} value={device.name}>
                        {device.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewMode(previewMode === 'light' ? 'dark' : 'light')}
                >
                  {previewMode === 'light' ? '🌙' : '☀️'}
                </Button>
              </div>

              <div className="flex justify-center">
                <div
                  className="border-8 border-gray-800 rounded-3xl overflow-hidden"
                  style={{
                    width: selectedDevice.width * selectedDevice.scale,
                    height: selectedDevice.height * selectedDevice.scale,
                    transform: `scale(${selectedDevice.scale})`
                  }}
                >
                  <div
                    className="w-full h-full"
                    style={{
                      ...getPreviewStyle(),
                      backgroundColor: 'var(--background-color)',
                      width: selectedDevice.width,
                      height: selectedDevice.height,
                      transform: `scale(${1 / selectedDevice.scale})`
                    }}
                  >
                    {/* Status Bar */}
                    <div
                      className="h-12 flex items-center justify-between px-4 text-sm"
                      style={{
                        backgroundColor: 'var(--navigation-bar-color)',
                        color: config.statusBarStyle === 'dark' ? '#000' : '#fff'
                      }}
                    >
                      <span>9:41</span>
                      <span>100%</span>
                    </div>

                    {/* App Header */}
                    <div
                      className="h-16 flex items-center px-4"
                      style={{ backgroundColor: 'var(--primary-color)', color: 'white' }}
                    >
                      {config.appIcon && (
                        <img src={config.appIcon} alt="App icon" className="w-8 h-8 rounded mr-3" />
                      )}
                      <span className="font-semibold">{config.appName || 'Your App'}</span>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 p-4 space-y-4">
                      {config.welcomeMessage && (
                        <div className="text-center py-8">
                          <p className="text-lg">{config.welcomeMessage}</p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <div
                          className="h-12 rounded-lg flex items-center px-4"
                          style={{ backgroundColor: 'var(--accent-color)', color: 'white' }}
                        >
                          <span>Dashboard</span>
                        </div>
                        <div
                          className="h-12 rounded-lg flex items-center px-4 border"
                          style={{ borderColor: 'var(--secondary-color)' }}
                        >
                          <span>Courses</span>
                        </div>
                        <div
                          className="h-12 rounded-lg flex items-center px-4 border"
                          style={{ borderColor: 'var(--secondary-color)' }}
                        >
                          <span>Grades</span>
                        </div>
                      </div>
                    </div>

                    {/* Tab Bar */}
                    <div
                      className="h-16 flex items-center justify-around border-t"
                      style={{
                        backgroundColor: 'var(--tab-bar-color)',
                        borderColor: 'var(--secondary-color)'
                      }}
                    >
                      {['Home', 'Courses', 'Grades', 'Profile'].map((tab) => (
                        <div key={tab} className="text-center">
                          <div className="w-6 h-6 mx-auto mb-1 rounded" style={{ backgroundColor: 'var(--accent-color)' }} />
                          <span className="text-xs">{tab}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {previewUrl && (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    asChild
                  >
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4 mr-2" />
                      Download Preview
                    </a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}