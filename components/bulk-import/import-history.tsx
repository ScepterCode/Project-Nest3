'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  MoreHorizontal,
  Download,
  RotateCcw,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BulkImport } from '@/lib/types/bulk-import';

interface ImportHistoryProps {
  // Add any props if needed in the future
}

export function ImportHistory() {
  const [imports, setImports] = useState<BulkImport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchImportHistory();
  }, []);

  const fetchImportHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/bulk-import');
      
      if (!response.ok) {
        throw new Error('Failed to fetch import history');
      }

      const data = await response.json();
      setImports(data.imports || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'processing':
      case 'validating':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'processing':
        return <Badge variant="secondary">Processing</Badge>;
      case 'validating':
        return <Badge variant="secondary">Validating</Badge>;
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    
    if (duration < 60) {
      return `${duration}s`;
    } else if (duration < 3600) {
      return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    } else {
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  };

  const handleViewDetails = (importId: string) => {
    // Navigate to import details page
    window.open(`/dashboard/institution/bulk-import/${importId}`, '_blank');
  };

  const handleDownloadReport = async (importId: string) => {
    try {
      const response = await fetch(`/api/bulk-import/${importId}/report`);
      
      if (!response.ok) {
        throw new Error('Failed to download report');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `import-report-${importId}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download report error:', error);
    }
  };

  const handleRollback = async (snapshotId: string) => {
    if (!confirm('Are you sure you want to rollback this import? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/bulk-import/rollback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ snapshotId }),
      });

      if (!response.ok) {
        throw new Error('Failed to rollback import');
      }

      const result = await response.json();
      
      if (result.success) {
        alert(`Successfully rolled back ${result.recordsRolledBack} records`);
        fetchImportHistory(); // Refresh the list
      } else {
        alert('Rollback failed: ' + (result.errors?.[0]?.errorMessage || 'Unknown error'));
      }
    } catch (error) {
      console.error('Rollback error:', error);
      alert('Failed to rollback import');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import History</CardTitle>
          <CardDescription>Loading import history...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import History</CardTitle>
          <CardDescription>Failed to load import history</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p>{error}</p>
                <Button variant="outline" size="sm" onClick={fetchImportHistory}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Import History</CardTitle>
            <CardDescription>
              View and manage your previous bulk imports
            </CardDescription>
          </div>
          <Button variant="outline" onClick={fetchImportHistory}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {imports.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No imports found</p>
            <p className="text-sm text-gray-400">Your import history will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((importRecord) => {
                  const successRate = importRecord.totalRecords > 0 
                    ? Math.round((importRecord.successfulRecords / importRecord.totalRecords) * 100)
                    : 0;

                  return (
                    <TableRow key={importRecord.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{importRecord.fileName}</p>
                          <p className="text-sm text-gray-500">
                            {formatFileSize(importRecord.fileSize)} • {importRecord.fileType.toUpperCase()}
                          </p>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(importRecord.status)}
                          {getStatusBadge(importRecord.status)}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="text-sm">
                          <p>{importRecord.totalRecords} total</p>
                          <p className="text-gray-500">
                            {importRecord.successfulRecords} success, {importRecord.failedRecords} failed
                          </p>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${
                            successRate >= 90 ? 'text-green-600' :
                            successRate >= 70 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {successRate}%
                          </span>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        {formatDuration(importRecord.startedAt, importRecord.completedAt)}
                      </TableCell>
                      
                      <TableCell>
                        <div className="text-sm">
                          <p>{new Date(importRecord.startedAt).toLocaleDateString()}</p>
                          <p className="text-gray-500">
                            {new Date(importRecord.startedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewDetails(importRecord.id)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            
                            {importRecord.status === 'completed' && (
                              <DropdownMenuItem onClick={() => handleDownloadReport(importRecord.id)}>
                                <Download className="h-4 w-4 mr-2" />
                                Download Report
                              </DropdownMenuItem>
                            )}
                            
                            {importRecord.metadata?.snapshotId && (
                              <DropdownMenuItem 
                                onClick={() => handleRollback(importRecord.metadata.snapshotId)}
                                className="text-red-600"
                              >
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Rollback Import
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}