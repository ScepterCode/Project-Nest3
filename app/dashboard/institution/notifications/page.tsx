'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Plus, 
  Search, 
  Settings, 
  BarChart3, 
  Mail, 
  Palette,
  Bell,
  Eye,
  Edit,
  Trash2,
  Send
} from 'lucide-react';
import { TemplateEditor } from '@/components/notifications/template-editor';
import { BrandingConfiguration } from '@/components/notifications/branding-config';
import { NotificationAnalyticsDashboard } from '@/components/notifications/notification-analytics';
import { 
  NotificationTemplate, 
  BrandingConfig,
  NotificationCampaign 
} from '@/lib/types/enhanced-notifications';
import { useAuth } from '@/contexts/auth-context';

export default function NotificationManagementPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('templates');
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<NotificationCampaign[]>([]);
  const [branding, setBranding] = useState<BrandingConfig | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchTemplates(),
        fetchCampaigns(),
        fetchBranding()
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/notifications/templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const response = await fetch('/api/notifications/campaigns');
      if (response.ok) {
        const data = await response.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    }
  };

  const fetchBranding = async () => {
    try {
      const response = await fetch('/api/notifications/branding');
      if (response.ok) {
        const data = await response.json();
        setBranding(data.branding);
      }
    } catch (error) {
      console.error('Error fetching branding:', error);
    }
  };

  const handleSaveTemplate = async (template: Partial<NotificationTemplate>) => {
    try {
      const url = selectedTemplate 
        ? `/api/notifications/templates/${selectedTemplate.id}`
        : '/api/notifications/templates';
      
      const method = selectedTemplate ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template)
      });

      if (response.ok) {
        await fetchTemplates();
        setShowTemplateEditor(false);
        setSelectedTemplate(null);
      } else {
        const error = await response.json();
        alert(`Error saving template: ${error.error}`);
      }
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Error saving template');
    }
  };

  const handlePreviewTemplate = async (
    template: Partial<NotificationTemplate>, 
    variables: Record<string, any>
  ) => {
    try {
      const templateId = selectedTemplate?.id;
      if (!templateId) {
        alert('Please save the template first to preview');
        return;
      }

      const response = await fetch(`/api/notifications/templates/${templateId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables })
      });

      if (response.ok) {
        const data = await response.json();
        // Open preview in new window
        const previewWindow = window.open('', '_blank');
        if (previewWindow) {
          previewWindow.document.write(`
            <html>
              <head><title>Template Preview</title></head>
              <body>
                <h3>Subject: ${data.preview.subject}</h3>
                <hr>
                ${data.preview.html_content}
              </body>
            </html>
          `);
        }
      } else {
        const error = await response.json();
        alert(`Error previewing template: ${error.error}`);
      }
    } catch (error) {
      console.error('Error previewing template:', error);
      alert('Error previewing template');
    }
  };

  const handleTestTemplate = async (
    template: Partial<NotificationTemplate>,
    recipients: string[],
    variables: Record<string, any>
  ) => {
    try {
      const templateId = selectedTemplate?.id;
      if (!templateId) {
        alert('Please save the template first to test');
        return;
      }

      const response = await fetch(`/api/notifications/templates/${templateId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients, variables })
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Test sent successfully! ${data.result.sent_count} notifications sent.`);
      } else {
        const error = await response.json();
        alert(`Error testing template: ${error.error}`);
      }
    } catch (error) {
      console.error('Error testing template:', error);
      alert('Error testing template');
    }
  };

  const handleSaveBranding = async (brandingConfig: BrandingConfig) => {
    try {
      const response = await fetch('/api/notifications/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brandingConfig)
      });

      if (response.ok) {
        setBranding(brandingConfig);
        alert('Branding configuration saved successfully!');
      } else {
        const error = await response.json();
        alert(`Error saving branding: ${error.error}`);
      }
    } catch (error) {
      console.error('Error saving branding:', error);
      alert('Error saving branding');
    }
  };

  const handlePreviewBranding = (brandingConfig: BrandingConfig) => {
    // Create a sample email with the branding
    const sampleHtml = `
      <div style="font-family: ${brandingConfig.font_family}; background-color: ${brandingConfig.background_color || '#ffffff'}; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="background: ${brandingConfig.primary_color}; color: white; padding: 20px; text-align: center;">
            ${brandingConfig.logo_url ? `<img src="${brandingConfig.logo_url}" alt="Logo" style="max-height: 60px; margin-bottom: 10px;">` : ''}
            <h1>${brandingConfig.header_text || 'Your Institution'}</h1>
          </div>
          <div style="padding: 30px; line-height: 1.6; color: ${brandingConfig.text_color || '#333333'};">
            <h2>Sample Notification</h2>
            <p>This is how your notifications will look with the current branding configuration.</p>
            <a href="#" style="display: inline-block; background: ${brandingConfig.button_color || brandingConfig.primary_color}; color: ${brandingConfig.button_text_color || 'white'}; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0;">
              Sample Button
            </a>
          </div>
          <div style="background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #6c757d;">
            <p>${brandingConfig.footer_text || 'This is an automated message.'}</p>
          </div>
        </div>
      </div>
    `;

    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.document.write(`
        <html>
          <head><title>Branding Preview</title></head>
          <body style="margin: 0; padding: 20px; background: #f5f5f5;">
            ${sampleHtml}
          </body>
        </html>
      `);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      const response = await fetch(`/api/notifications/templates/${templateId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchTemplates();
      } else {
        const error = await response.json();
        alert(`Error deleting template: ${error.error}`);
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Error deleting template');
    }
  };

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const variants = {
      'draft': 'outline',
      'scheduled': 'secondary',
      'sending': 'default',
      'sent': 'default',
      'paused': 'secondary',
      'cancelled': 'destructive'
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || 'outline'}>
        {status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notification Management</h1>
          <p className="text-gray-600">
            Manage templates, branding, and analytics for your notifications
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-2">
            <Palette className="w-4 h-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="flex items-center gap-2">
            <Send className="w-4 h-4" />
            Campaigns
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          {showTemplateEditor ? (
            <div>
              <div className="flex items-center justify-between mb-6">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowTemplateEditor(false);
                    setSelectedTemplate(null);
                  }}
                >
                  ← Back to Templates
                </Button>
              </div>
              <TemplateEditor
                template={selectedTemplate || undefined}
                onSave={handleSaveTemplate}
                onPreview={handlePreviewTemplate}
                onTest={handleTestTemplate}
                branding={branding || undefined}
              />
            </div>
          ) : (
            <>
              {/* Templates Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="Search templates..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 w-64"
                    />
                  </div>
                </div>
                <Button onClick={() => setShowTemplateEditor(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Template
                </Button>
              </div>

              {/* Templates Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTemplates.map((template) => (
                  <Card key={template.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <Badge variant="outline">{template.type}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {template.subject_template}
                        </p>
                        
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>Version {template.version}</span>
                          <span>{template.is_active ? 'Active' : 'Inactive'}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedTemplate(template);
                              setShowTemplateEditor(true);
                            }}
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePreviewTemplate(template, {})}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            Preview
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteTemplate(template.id)}
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {filteredTemplates.length === 0 && (
                <div className="text-center py-12">
                  <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No templates found
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {searchTerm ? 'No templates match your search.' : 'Get started by creating your first notification template.'}
                  </p>
                  <Button onClick={() => setShowTemplateEditor(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Template
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Branding Tab */}
        <TabsContent value="branding">
          <BrandingConfiguration
            branding={branding || undefined}
            onSave={handleSaveBranding}
            onPreview={handlePreviewBranding}
          />
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Notification Campaigns</h3>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Campaign
            </Button>
          </div>

          <div className="grid gap-4">
            {campaigns.map((campaign) => (
              <Card key={campaign.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">{campaign.name}</h4>
                      <p className="text-sm text-gray-600">
                        Created {new Date(campaign.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(campaign.status)}
                      <Button size="sm" variant="outline">
                        <BarChart3 className="w-3 h-3 mr-1" />
                        Analytics
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {campaigns.length === 0 && (
            <div className="text-center py-12">
              <Send className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No campaigns yet
              </h3>
              <p className="text-gray-600 mb-4">
                Create your first notification campaign to reach your users.
              </p>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Campaign
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <NotificationAnalyticsDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}