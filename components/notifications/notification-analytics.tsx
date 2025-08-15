'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Mail, 
  Eye, 
  MousePointer, 
  Users,
  Calendar,
  Download,
  RefreshCw
} from 'lucide-react';
import { NotificationAnalytics } from '@/lib/types/enhanced-notifications';

interface NotificationAnalyticsProps {
  campaignId?: string;
  institutionId?: string;
  timeRange?: 'day' | 'week' | 'month' | 'quarter' | 'year';
}

interface AnalyticsData {
  analytics: NotificationAnalytics;
  engagement_by_hour: Record<string, any>;
  engagement_by_day: Record<string, any>;
  recent_events: any[];
}

export function NotificationAnalyticsDashboard({ 
  campaignId, 
  institutionId, 
  timeRange = 'week' 
}: NotificationAnalyticsProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchAnalytics();
  }, [campaignId, selectedTimeRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const endpoint = campaignId 
        ? `/api/notifications/campaigns/${campaignId}/analytics`
        : `/api/notifications/analytics?timeRange=${selectedTimeRange}`;
      
      const response = await fetch(endpoint);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPercentage = (value: number) => `${value.toFixed(1)}%`;
  const formatNumber = (value: number) => value.toLocaleString();

  const getStatusColor = (rate: number, type: 'good' | 'bad' = 'good') => {
    if (type === 'good') {
      if (rate >= 25) return 'text-green-600';
      if (rate >= 15) return 'text-yellow-600';
      return 'text-red-600';
    } else {
      if (rate <= 2) return 'text-green-600';
      if (rate <= 5) return 'text-yellow-600';
      return 'text-red-600';
    }
  };

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) {
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    } else if (current < previous) {
      return <TrendingDown className="w-4 h-4 text-red-500" />;
    }
    return null;
  };

  const pieChartColors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No analytics data available</p>
      </div>
    );
  }

  const { analytics } = data;

  // Prepare chart data
  const hourlyData = Object.entries(data.engagement_by_hour).map(([hour, events]) => ({
    hour: `${hour}:00`,
    sent: events.sent || 0,
    opened: events.opened || 0,
    clicked: events.clicked || 0
  }));

  const dailyData = Object.entries(data.engagement_by_day).map(([day, events]) => ({
    day,
    sent: events.sent || 0,
    opened: events.opened || 0,
    clicked: events.clicked || 0
  }));

  const engagementPieData = [
    { name: 'Opened', value: analytics.opened, color: '#00C49F' },
    { name: 'Clicked', value: analytics.clicked, color: '#0088FE' },
    { name: 'Bounced', value: analytics.bounced, color: '#FF8042' },
    { name: 'Unsubscribed', value: analytics.unsubscribed, color: '#FFBB28' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Notification Analytics</h2>
          <p className="text-gray-600">
            Track engagement and performance metrics
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchAnalytics}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Sent</p>
                    <p className="text-2xl font-bold">{formatNumber(analytics.total_sent)}</p>
                  </div>
                  <Mail className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Delivery Rate</p>
                    <p className={`text-2xl font-bold ${getStatusColor(analytics.delivery_rate)}`}>
                      {formatPercentage(analytics.delivery_rate)}
                    </p>
                  </div>
                  <Users className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Open Rate</p>
                    <p className={`text-2xl font-bold ${getStatusColor(analytics.open_rate)}`}>
                      {formatPercentage(analytics.open_rate)}
                    </p>
                  </div>
                  <Eye className="w-8 h-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Click Rate</p>
                    <p className={`text-2xl font-bold ${getStatusColor(analytics.click_rate)}`}>
                      {formatPercentage(analytics.click_rate)}
                    </p>
                  </div>
                  <MousePointer className="w-8 h-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Bounce Rate</p>
                    <p className={`text-xl font-bold ${getStatusColor(analytics.bounce_rate, 'bad')}`}>
                      {formatPercentage(analytics.bounce_rate)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatNumber(analytics.bounced)} bounced
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Unsubscribe Rate</p>
                    <p className={`text-xl font-bold ${getStatusColor(analytics.unsubscribe_rate, 'bad')}`}>
                      {formatPercentage(analytics.unsubscribe_rate)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatNumber(analytics.unsubscribed)} unsubscribed
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Engagement Score</p>
                    <p className={`text-xl font-bold ${getStatusColor(analytics.engagement_score)}`}>
                      {formatPercentage(analytics.engagement_score)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Overall engagement
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Engagement Tab */}
        <TabsContent value="engagement" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Engagement Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Engagement Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={engagementPieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {engagementPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Engagement by Hour */}
            <Card>
              <CardHeader>
                <CardTitle>Engagement by Hour</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="opened" fill="#00C49F" name="Opened" />
                    <Bar dataKey="clicked" fill="#0088FE" name="Clicked" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Engagement Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="sent" 
                    stroke="#8884d8" 
                    name="Sent"
                    strokeWidth={2}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="opened" 
                    stroke="#00C49F" 
                    name="Opened"
                    strokeWidth={2}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="clicked" 
                    stroke="#0088FE" 
                    name="Clicked"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.recent_events.map((event, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge variant={
                        event.event_type === 'opened' ? 'default' :
                        event.event_type === 'clicked' ? 'secondary' :
                        event.event_type === 'bounced' ? 'destructive' :
                        'outline'
                      }>
                        {event.event_type}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium">
                          User {event.event_type} notification
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(event.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {event.event_data && Object.keys(event.event_data).length > 0 && (
                      <div className="text-xs text-gray-500">
                        {JSON.stringify(event.event_data)}
                      </div>
                    )}
                  </div>
                ))}
                
                {data.recent_events.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No recent events
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}