import { createClient } from '@/lib/supabase/server';
import {
  NotificationTemplate,
  NotificationCampaign,
  DeliveryPreferences,
  BrandingConfig,
  TemplatePreview,
  TestResult,
  NotificationAnalytics,
  CampaignAnalytics,
  ABTestConfig,
  NotificationEngagement,
  EngagementAction,
  CampaignStatus,
  NotificationType
} from '@/lib/types/enhanced-notifications';

export class EnhancedNotificationService {
  private supabase = createClient();

  // Template Management
  async createTemplate(template: Omit<NotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotificationTemplate> {
    const { data, error } = await this.supabase
      .from('notification_templates')
      .insert({
        institution_id: template.institutionId,
        name: template.name,
        type: template.type,
        subject_template: template.subject,
        html_template: template.htmlContent,
        text_template: template.textContent,
        variables: template.variables,
        conditions: template.conditions,
        branding: template.branding || {},
        is_active: template.isActive
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create template: ${error.message}`);
    return this.mapTemplateFromDb(data);
  }

  async updateTemplate(id: string, updates: Partial<NotificationTemplate>): Promise<NotificationTemplate> {
    const updateData: any = {};
    
    if (updates.name) updateData.name = updates.name;
    if (updates.subject) updateData.subject_template = updates.subject;
    if (updates.htmlContent) updateData.html_template = updates.htmlContent;
    if (updates.textContent) updateData.text_template = updates.textContent;
    if (updates.variables) updateData.variables = updates.variables;
    if (updates.conditions) updateData.conditions = updates.conditions;
    if (updates.branding) updateData.branding = updates.branding;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
    
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('notification_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update template: ${error.message}`);
    return this.mapTemplateFromDb(data);
  }

  async getTemplate(id: string): Promise<NotificationTemplate | null> {
    const { data, error } = await this.supabase
      .from('notification_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get template: ${error.message}`);
    }

    return this.mapTemplateFromDb(data);
  }

  async getTemplates(institutionId: string, type?: NotificationType): Promise<NotificationTemplate[]> {
    let query = this.supabase
      .from('notification_templates')
      .select('*')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to get templates: ${error.message}`);
    return data.map(this.mapTemplateFromDb);
  }

  async deleteTemplate(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('notification_templates')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete template: ${error.message}`);
  }

  // Template Preview and Testing
  async previewTemplate(templateId: string, variables: Record<string, any>): Promise<TemplatePreview> {
    const template = await this.getTemplate(templateId);
    if (!template) throw new Error('Template not found');

    const processedSubject = this.processTemplate(template.subject, variables);
    const processedHtml = this.processTemplate(template.htmlContent, variables);
    const processedText = this.processTemplate(template.textContent || '', variables);

    return {
      subject: processedSubject,
      htmlContent: processedHtml,
      textContent: processedText,
      variables
    };
  }

  async testTemplate(templateId: string, recipients: string[], variables: Record<string, any> = {}): Promise<TestResult> {
    const startTime = Date.now();
    const template = await this.getTemplate(templateId);
    
    if (!template) {
      return {
        success: false,
        sentCount: 0,
        failedCount: recipients.length,
        errors: ['Template not found'],
        deliveryTime: Date.now() - startTime
      };
    }

    const preview = await this.previewTemplate(templateId, variables);
    const errors: string[] = [];
    let sentCount = 0;

    // Simulate sending test emails
    for (const recipient of recipients) {
      try {
        // In a real implementation, this would send actual emails
        await this.simulateEmailSend(recipient, preview);
        sentCount++;
      } catch (error) {
        errors.push(`Failed to send to ${recipient}: ${error}`);
      }
    }

    return {
      success: errors.length === 0,
      sentCount,
      failedCount: recipients.length - sentCount,
      errors,
      deliveryTime: Date.now() - startTime
    };
  }

  // Branding Management
  async updateInstitutionBranding(institutionId: string, branding: BrandingConfig): Promise<void> {
    const { error } = await this.supabase
      .from('institution_branding')
      .upsert({
        institution_id: institutionId,
        logo_url: branding.logoUrl,
        primary_color: branding.primaryColor,
        secondary_color: branding.secondaryColor,
        background_color: branding.backgroundColor,
        text_color: branding.textColor,
        font_family: branding.fontFamily,
        font_size: branding.fontSize,
        custom_css: branding.customCss,
        updated_at: new Date().toISOString()
      });

    if (error) throw new Error(`Failed to update branding: ${error.message}`);
  }

  async getInstitutionBranding(institutionId: string): Promise<BrandingConfig | null> {
    const { data, error } = await this.supabase
      .from('institution_branding')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get branding: ${error.message}`);
    }

    return {
      logoUrl: data.logo_url,
      primaryColor: data.primary_color,
      secondaryColor: data.secondary_color,
      backgroundColor: data.background_color,
      textColor: data.text_color,
      fontFamily: data.font_family,
      fontSize: data.font_size,
      customCss: data.custom_css
    };
  }

  // Delivery Preferences
  async updateDeliveryPreferences(userId: string, institutionId: string, preferences: Partial<DeliveryPreferences>): Promise<void> {
    const updateData: any = {
      user_id: userId,
      institution_id: institutionId,
      updated_at: new Date().toISOString()
    };

    if (preferences.emailEnabled !== undefined) updateData.email_enabled = preferences.emailEnabled;
    if (preferences.smsEnabled !== undefined) updateData.sms_enabled = preferences.smsEnabled;
    if (preferences.pushEnabled !== undefined) updateData.push_enabled = preferences.pushEnabled;
    if (preferences.frequency) updateData.frequency = preferences.frequency;
    if (preferences.quietHours) updateData.quiet_hours = preferences.quietHours;
    if (preferences.channels) updateData.channels = preferences.channels;

    const { error } = await this.supabase
      .from('notification_delivery_preferences')
      .upsert(updateData);

    if (error) throw new Error(`Failed to update delivery preferences: ${error.message}`);
  }

  async getDeliveryPreferences(userId: string, institutionId: string): Promise<DeliveryPreferences | null> {
    const { data, error } = await this.supabase
      .from('notification_delivery_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('institution_id', institutionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get delivery preferences: ${error.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      institutionId: data.institution_id,
      emailEnabled: data.email_enabled,
      smsEnabled: data.sms_enabled,
      pushEnabled: data.push_enabled,
      frequency: data.frequency,
      quietHours: data.quiet_hours,
      channels: data.channels,
      updatedAt: new Date(data.updated_at)
    };
  }

  // Campaign Management
  async createCampaign(campaign: Omit<NotificationCampaign, 'id' | 'createdAt' | 'analytics'>): Promise<NotificationCampaign> {
    const { data, error } = await this.supabase
      .from('notification_campaigns')
      .insert({
        institution_id: campaign.institutionId,
        name: campaign.name,
        template_id: campaign.templateId,
        target_audience: campaign.targetAudience,
        scheduled_at: campaign.scheduledAt?.toISOString(),
        status: campaign.status,
        ab_test_config: campaign.abTestConfig || {},
        created_by: campaign.createdBy
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create campaign: ${error.message}`);

    // Initialize analytics
    await this.supabase
      .from('campaign_analytics')
      .insert({ campaign_id: data.id });

    return this.mapCampaignFromDb(data);
  }

  async getCampaign(id: string): Promise<NotificationCampaign | null> {
    const { data, error } = await this.supabase
      .from('notification_campaigns')
      .select(`
        *,
        campaign_analytics (*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get campaign: ${error.message}`);
    }

    return this.mapCampaignFromDb(data);
  }

  async getCampaigns(institutionId: string, status?: CampaignStatus): Promise<NotificationCampaign[]> {
    let query = this.supabase
      .from('notification_campaigns')
      .select(`
        *,
        campaign_analytics (*)
      `)
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to get campaigns: ${error.message}`);
    return data.map(this.mapCampaignFromDb);
  }

  async updateCampaignStatus(id: string, status: CampaignStatus): Promise<void> {
    const { error } = await this.supabase
      .from('notification_campaigns')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw new Error(`Failed to update campaign status: ${error.message}`);
  }

  // Analytics and Engagement
  async recordEngagement(campaignId: string, userId: string, action: EngagementAction, metadata?: Record<string, any>): Promise<void> {
    const { error } = await this.supabase
      .from('notification_engagements')
      .insert({
        campaign_id: campaignId,
        user_id: userId,
        action,
        metadata: metadata || {}
      });

    if (error) throw new Error(`Failed to record engagement: ${error.message}`);
  }

  async getCampaignAnalytics(campaignId: string): Promise<CampaignAnalytics> {
    const { data, error } = await this.supabase
      .from('campaign_analytics')
      .select('*')
      .eq('campaign_id', campaignId)
      .single();

    if (error) throw new Error(`Failed to get campaign analytics: ${error.message}`);

    return {
      sent: data.sent,
      delivered: data.delivered,
      opened: data.opened,
      clicked: data.clicked,
      bounced: data.bounced,
      unsubscribed: data.unsubscribed,
      deliveryRate: parseFloat(data.delivery_rate),
      openRate: parseFloat(data.open_rate),
      clickRate: parseFloat(data.click_rate),
      engagementScore: parseFloat(data.engagement_score)
    };
  }

  async getNotificationAnalytics(institutionId: string, days: number = 30): Promise<NotificationAnalytics> {
    // Get overall analytics
    const { data: overallData, error: overallError } = await this.supabase
      .from('campaign_analytics')
      .select(`
        *,
        notification_campaigns!inner (institution_id)
      `)
      .eq('notification_campaigns.institution_id', institutionId);

    if (overallError) throw new Error(`Failed to get analytics: ${overallError.message}`);

    // Calculate totals
    const totals = overallData.reduce((acc, item) => ({
      totalSent: acc.totalSent + item.sent,
      totalDelivered: acc.totalDelivered + item.delivered,
      totalOpened: acc.totalOpened + item.opened,
      totalClicked: acc.totalClicked + item.clicked
    }), { totalSent: 0, totalDelivered: 0, totalOpened: 0, totalClicked: 0 });

    // Get template performance
    const { data: templateData, error: templateError } = await this.supabase
      .rpc('get_template_performance', { 
        p_institution_id: institutionId, 
        p_days: days 
      });

    if (templateError) throw new Error(`Failed to get template performance: ${templateError.message}`);

    return {
      totalSent: totals.totalSent,
      totalDelivered: totals.totalDelivered,
      totalOpened: totals.totalOpened,
      totalClicked: totals.totalClicked,
      averageDeliveryRate: totals.totalSent > 0 ? totals.totalDelivered / totals.totalSent : 0,
      averageOpenRate: totals.totalDelivered > 0 ? totals.totalOpened / totals.totalDelivered : 0,
      averageClickRate: totals.totalOpened > 0 ? totals.totalClicked / totals.totalOpened : 0,
      topPerformingTemplates: templateData.map((t: any) => ({
        templateId: t.template_id,
        templateName: t.template_name,
        sent: parseInt(t.sent),
        openRate: parseFloat(t.open_rate),
        clickRate: parseFloat(t.click_rate),
        engagementScore: parseFloat(t.engagement_score)
      })),
      engagementTrends: [] // Would be implemented with time-series data
    };
  }

  // Private helper methods
  private mapTemplateFromDb(data: any): NotificationTemplate {
    return {
      id: data.id,
      institutionId: data.institution_id,
      name: data.name,
      type: data.type,
      subject: data.subject_template,
      htmlContent: data.html_template,
      textContent: data.text_template,
      variables: data.variables || [],
      conditions: data.conditions || [],
      branding: data.branding || {},
      isActive: data.is_active,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }

  private mapCampaignFromDb(data: any): NotificationCampaign {
    const analytics = data.campaign_analytics?.[0] || {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      unsubscribed: 0,
      delivery_rate: 0,
      open_rate: 0,
      click_rate: 0,
      engagement_score: 0
    };

    return {
      id: data.id,
      institutionId: data.institution_id,
      name: data.name,
      templateId: data.template_id,
      targetAudience: data.target_audience,
      scheduledAt: data.scheduled_at ? new Date(data.scheduled_at) : undefined,
      status: data.status,
      abTestConfig: data.ab_test_config,
      createdBy: data.created_by,
      createdAt: new Date(data.created_at),
      analytics: {
        sent: analytics.sent,
        delivered: analytics.delivered,
        opened: analytics.opened,
        clicked: analytics.clicked,
        bounced: analytics.bounced,
        unsubscribed: analytics.unsubscribed,
        deliveryRate: parseFloat(analytics.delivery_rate),
        openRate: parseFloat(analytics.open_rate),
        clickRate: parseFloat(analytics.click_rate),
        engagementScore: parseFloat(analytics.engagement_score)
      }
    };
  }

  private processTemplate(template: string, variables: Record<string, any>): string {
    let processed = template;
    
    // Replace variables in the format {{variable_name}}
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      processed = processed.replace(regex, String(value));
    });

    return processed;
  }

  private async simulateEmailSend(recipient: string, preview: TemplatePreview): Promise<void> {
    // Simulate email sending delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // In a real implementation, this would integrate with an email service
    console.log(`Test email sent to ${recipient}:`, {
      subject: preview.subject,
      htmlContent: preview.htmlContent.substring(0, 100) + '...'
    });
  }
}