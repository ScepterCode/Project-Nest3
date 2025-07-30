'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  CreditCard, 
  Download, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Users, 
  HardDrive, 
  Building,
  Zap
} from 'lucide-react';
import { 
  Subscription, 
  SubscriptionPlan, 
  Invoice, 
  UsageMetrics, 
  BillingAlert, 
  PaymentIssue 
} from '@/lib/types/billing';

interface BillingDashboardProps {
  institutionId: string;
}

export function BillingDashboard({ institutionId }: BillingDashboardProps) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [usage, setUsage] = useState<UsageMetrics | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [alerts, setAlerts] = useState<BillingAlert[]>([]);
  const [paymentIssues, setPaymentIssues] = useState<PaymentIssue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBillingData();
  }, [institutionId]);

  const loadBillingData = async () => {
    try {
      setLoading(true);
      
      // Load subscription and plan data
      const subResponse = await fetch(`/api/institutions/${institutionId}/subscription`);
      if (subResponse.ok) {
        const subData = await subResponse.json();
        setSubscription(subData.subscription);
        setPlan(subData.plan);
      }

      // Load usage metrics
      const usageResponse = await fetch(`/api/institutions/${institutionId}/usage`);
      if (usageResponse.ok) {
        const usageData = await usageResponse.json();
        setUsage(usageData);
      }

      // Load invoices
      const invoicesResponse = await fetch(`/api/institutions/${institutionId}/invoices`);
      if (invoicesResponse.ok) {
        const invoicesData = await invoicesResponse.json();
        setInvoices(invoicesData);
      }

      // Load alerts and issues
      const alertsResponse = await fetch(`/api/institutions/${institutionId}/billing-alerts`);
      if (alertsResponse.ok) {
        const alertsData = await alertsResponse.json();
        setAlerts(alertsData.alerts);
        setPaymentIssues(alertsData.paymentIssues);
      }
    } catch (error) {
      console.error('Failed to load billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      active: 'default',
      trial: 'secondary',
      past_due: 'destructive',
      cancelled: 'outline',
      suspended: 'destructive'
    };
    return <Badge variant={variants[status] || 'outline'}>{status.replace('_', ' ')}</Badge>;
  };

  const getUsagePercentage = (current: number, limit: number) => {
    if (limit === -1) return 0; // Unlimited
    return Math.min((current / limit) * 100, 100);
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 90) return 'bg-orange-500';
    if (percentage >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(new Date(date));
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading billing information...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Alerts Section */}
      {(alerts.length > 0 || paymentIssues.length > 0) && (
        <div className="space-y-4">
          {paymentIssues.map((issue) => (
            <Alert key={issue.id} variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Payment Issue</AlertTitle>
              <AlertDescription>
                {issue.description}
                <div className="mt-2 space-x-2">
                  {issue.actions.map((action) => (
                    <Button
                      key={action.id}
                      size="sm"
                      variant={action.completed ? "outline" : "default"}
                      disabled={action.completed}
                    >
                      {action.completed && <CheckCircle className="h-3 w-3 mr-1" />}
                      {action.description}
                    </Button>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          ))}
          
          {alerts.map((alert) => (
            <Alert key={alert.id} variant={alert.severity === 'critical' ? 'destructive' : 'default'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Usage Alert</AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Subscription Status */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{plan?.name || 'No Plan'}</div>
                <div className="flex items-center space-x-2 mt-2">
                  {subscription && getStatusBadge(subscription.status)}
                  {subscription && (
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(plan?.price || 0)}/{plan?.billingCycle}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Next Billing Date */}
            {subscription && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Next Billing</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatDate(subscription.currentPeriodEnd)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {subscription.cancelAtPeriodEnd ? 'Subscription will cancel' : 'Auto-renewal'}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Outstanding Balance */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(
                    invoices
                      .filter(inv => inv.status === 'open')
                      .reduce((sum, inv) => sum + inv.amount, 0)
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {invoices.filter(inv => inv.status === 'open').length} unpaid invoice(s)
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          {usage && plan && (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Users Usage */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {usage.metrics.activeUsers}
                    {plan.limits.users !== -1 && ` / ${plan.limits.users}`}
                  </div>
                  {plan.limits.users !== -1 && (
                    <Progress 
                      value={getUsagePercentage(usage.metrics.activeUsers, plan.limits.users)}
                      className="mt-2"
                    />
                  )}
                </CardContent>
              </Card>

              {/* Storage Usage */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Storage</CardTitle>
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {usage.metrics.storageUsed}GB / {plan.limits.storage}GB
                  </div>
                  <Progress 
                    value={getUsagePercentage(usage.metrics.storageUsed, plan.limits.storage)}
                    className="mt-2"
                  />
                </CardContent>
              </Card>

              {/* Departments Usage */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Departments</CardTitle>
                  <Building className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {usage.metrics.departmentCount}
                    {plan.limits.departments !== -1 && ` / ${plan.limits.departments}`}
                  </div>
                  {plan.limits.departments !== -1 && (
                    <Progress 
                      value={getUsagePercentage(usage.metrics.departmentCount, plan.limits.departments)}
                      className="mt-2"
                    />
                  )}
                </CardContent>
              </Card>

              {/* API Calls Usage */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">API Calls</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {usage.metrics.apiCallCount.toLocaleString()}
                    {plan.limits.apiCalls !== -1 && ` / ${plan.limits.apiCalls.toLocaleString()}`}
                  </div>
                  {plan.limits.apiCalls !== -1 && (
                    <Progress 
                      value={getUsagePercentage(usage.metrics.apiCallCount, plan.limits.apiCalls)}
                      className="mt-2"
                    />
                  )}
                  <p className="text-xs text-muted-foreground mt-1">This month</p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>View and download your billing history</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.number}</TableCell>
                      <TableCell>{formatDate(invoice.createdAt)}</TableCell>
                      <TableCell>{formatCurrency(invoice.amount, invoice.currency)}</TableCell>
                      <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline">
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Billing Settings</CardTitle>
              <CardDescription>Manage your billing preferences and payment methods</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button>Update Payment Method</Button>
              <Button variant="outline">Change Plan</Button>
              {subscription && !subscription.cancelAtPeriodEnd && (
                <Button variant="destructive">Cancel Subscription</Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}