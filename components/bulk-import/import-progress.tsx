'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  RefreshCw,
  Pause,
  Play
} from 'lucide-react';
import { ImportStatus as ImportStatusType } from '@/lib/types/bulk-import';

interface ImportProgressProps {
  importId: string;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
  refreshInterval?: number;
}

export function ImportProgress({
  importId,
  onComplete,
  onError,
  refreshInterval = 2000
}: ImportProgressProps) {
  const [status, setStatus] = useState<ImportStatusType | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPolling) return;

    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/bulk-import/status/${importId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch import status');
        }

        const statusData = await response.json();
        setStatus(statusData);

        // Stop polling if import is complete or failed
        if (['completed', 'failed', 'cancelled'].includes(statusData.status)) {
          setIsPolling(false);
          
          if (statusData.status === 'completed' && onComplete) {
            onComplete(statusData);
          } else if (statusData.status === 'failed' && onError) {
            onError('Import failed');
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        setIsPolling(false);
        
        if (onError) {
          onError(errorMessage);
        }
      }
    };

    // Initial fetch
    pollStatus();

    // Set up polling interval
    const interval = setInterval(pollStatus, refreshInterval);

    return () => clearInterval(interval);
  }, [importId, isPolling, refreshInterval, onComplete, onError]);

  const getStatusIcon = () => {
    if (!status) return <Clock className="h-5 w-5 text-gray-500" />;
    
    switch (status.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-gray-500" />;
      case 'processing':
      case 'validating':
      default:
        return <Clock className="h-5 w-5 text-blue-500" />;
    }
  };

  const getStatusColor = () => {
    if (!status) return 'text-gray-600';
    
    switch (status.status) {
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'cancelled':
        return 'text-gray-600';
      case 'processing':
      case 'validating':
      default:
        return 'text-blue-600';
    }
  };

  const getStatusText = () => {
    if (!status) return 'Loading...';
    
    switch (status.status) {
      case 'completed':
        return 'Import completed successfully';
      case 'failed':
        return 'Import failed';
      case 'cancelled':
        return 'Import was cancelled';
      case 'processing':
        return 'Processing import...';
      case 'validating':
        return 'Validating data...';
      default:
        return status.currentStage || 'Processing...';
    }
  };

  const formatDuration = (startTime: Date, endTime?: Date) => {
    const end = endTime || new Date();
    const duration = Math.floor((end.getTime() - startTime.getTime()) / 1000);
    
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

  const estimateTimeRemaining = () => {
    if (!status || !status.progress) return null;
    
    const { progressPercentage } = status.progress;
    if (progressPercentage <= 0) return null;
    
    const elapsed = Date.now() - status.startedAt.getTime();
    const totalEstimated = (elapsed / progressPercentage) * 100;
    const remaining = totalEstimated - elapsed;
    
    if (remaining <= 0) return null;
    
    const remainingSeconds = Math.floor(remaining / 1000);
    if (remainingSeconds < 60) {
      return `~${remainingSeconds}s remaining`;
    } else {
      return `~${Math.floor(remainingSeconds / 60)}m remaining`;
    }
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertDescription>
          <div className="space-y-2">
            <p>Failed to load import status: {error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                setIsPolling(true);
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            Import Progress
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={status?.status === 'completed' ? 'default' : 'secondary'}>
              {status?.status || 'Loading'}
            </Badge>
            {isPolling && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPolling(false)}
              >
                <Pause className="h-4 w-4" />
              </Button>
            )}
            {!isPolling && status?.status === 'processing' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPolling(true)}
              >
                <Play className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardTitle>
        <CardDescription className={getStatusColor()}>
          {getStatusText()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status && (
          <div className="space-y-4">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{status.progress?.statusMessage || 'Processing...'}</span>
                <span>{Math.round(status.progress?.progressPercentage || 0)}%</span>
              </div>
              <Progress 
                value={status.progress?.progressPercentage || 0} 
                className="h-2"
              />
            </div>

            {/* Time Information */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Started</p>
                <p className="font-medium">
                  {status.startedAt.toLocaleString()}
                </p>
              </div>
              
              <div>
                <p className="text-gray-600">Duration</p>
                <p className="font-medium">
                  {formatDuration(status.startedAt, status.completedAt)}
                </p>
              </div>
              
              <div>
                <p className="text-gray-600">Estimated Time</p>
                <p className="font-medium">
                  {estimateTimeRemaining() || 'Calculating...'}
                </p>
              </div>
            </div>

            {/* Stage Information */}
            {status.progress && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Stage: {status.progress.stage}
                  </span>
                  <span className="text-sm text-gray-600">
                    Step {status.progress.currentStep} of {status.progress.totalSteps}
                  </span>
                </div>
              </div>
            )}

            {/* Completion Status */}
            {status.status === 'completed' && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Import completed successfully! Check the results tab for detailed information.
                </AlertDescription>
              </Alert>
            )}

            {status.status === 'failed' && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  Import failed. Please check the error logs and try again.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}