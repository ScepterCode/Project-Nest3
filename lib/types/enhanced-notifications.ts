export interface NotificationTemplate {
  id: string;
  institutionId: string;
  name: string;
  type: NotificationType;
  subject: string;
  htmlContent: string;
  textContent: string;
  variables: TemplateVariable[];
  conditions: TemplateCondition[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  branding?: BrandingConfig;
}

export interface TemplateVariable {
  name: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'object';
  description: string;
  required: boolean;
  defaultValue?: any;
}

export interface TemplateCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than';
  value: any;
  action: 'show' | 'hide' | 'modify';
}

export interface BrandingConfig {
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  fontSize: string;
  customCss?: string;
}

export interface DeliveryPreferences {
  id: string;
  userId: string;
  institutionId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  frequency: DeliveryFrequency;
  quietHours: QuietHours;
  channels: NotificationChannel[];
  updatedAt: Date;
}

export interface QuietHours {
  enabled: boolean;
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  timezone: string;
}

export interface NotificationChannel {
  type: 'email' | 'sms' | 'push' | 'in_app';
  enabled: boolean;
  priority: number;
}

export interface NotificationCampaign {
  id: string;
  institutionId: string;
  name: string;
  templateId: string;
  targetAudience: TargetAudience;
  scheduledAt?: Date;
  status: CampaignStatus;
  abTestConfig?: ABTestConfig;
  createdBy: string;
  createdAt: Date;
  analytics: CampaignAnalytics;
}

export interface TargetAudience {
  roles: string[];
  departments?: string[];
  classes?: string[];
  customFilters?: Record<string, any>;
}

export interface ABTestConfig {
  enabled: boolean;
  variants: ABTestVariant[];
  splitPercentage: number;
  testDuration: number; // in hours
  successMetric: 'open_rate' | 'click_rate' | 'conversion_rate';
}

export interface ABTestVariant {
  id: string;
  name: string;
  templateId: string;
  percentage: number;
}

export interface CampaignAnalytics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  engagementScore: number;
}

export interface NotificationEngagement {
  id: string;
  campaignId: string;
  userId: string;
  action: EngagementAction;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface TemplatePreview {
  subject: string;
  htmlContent: string;
  textContent: string;
  variables: Record<string, any>;
}

export interface TestResult {
  success: boolean;
  sentCount: number;
  failedCount: number;
  errors: string[];
  deliveryTime: number;
}

export enum NotificationType {
  WELCOME = 'welcome',
  ROLE_ASSIGNMENT = 'role_assignment',
  CLASS_ENROLLMENT = 'class_enrollment',
  ASSIGNMENT_DUE = 'assignment_due',
  GRADE_POSTED = 'grade_posted',
  SYSTEM_ALERT = 'system_alert',
  CUSTOM = 'custom'
}

export enum DeliveryFrequency {
  IMMEDIATE = 'immediate',
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  NEVER = 'never'
}

export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENDING = 'sending',
  SENT = 'sent',
  PAUSED = 'paused',
  CANCELLED = 'cancelled'
}

export enum EngagementAction {
  SENT = 'sent',
  DELIVERED = 'delivered',
  OPENED = 'opened',
  CLICKED = 'clicked',
  BOUNCED = 'bounced',
  UNSUBSCRIBED = 'unsubscribed'
}

export interface NotificationAnalytics {
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  averageDeliveryRate: number;
  averageOpenRate: number;
  averageClickRate: number;
  topPerformingTemplates: TemplatePerformance[];
  engagementTrends: EngagementTrend[];
}

export interface TemplatePerformance {
  templateId: string;
  templateName: string;
  sent: number;
  openRate: number;
  clickRate: number;
  engagementScore: number;
}

export interface EngagementTrend {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
}