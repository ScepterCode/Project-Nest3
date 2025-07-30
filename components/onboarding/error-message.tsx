'use client';

import React from 'react';
import { AlertTriangle, Wifi, RefreshCw, ArrowLeft, Home, Mail } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useErrorHandler, ErrorType } from '@/lib/utils/error-handling';

interface ErrorMessageProps {
  error: Error | string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  variant?: 'inline' | 'card' | 'banner';
  showDetails?: boolean;
  className?: string;
}

export function ErrorMessage({
  error,
  onRetry,
  onDismiss,
  variant = 'inline',
  showDetails = false,
  className = ''
}: ErrorMessageProps) {
  const { handleError, getUserMessage, isRetryable, getRecoveryActions } = useErrorHandler();

  if (!error) return null;

  const errorObj = typeof error === 'string' ? new Error(error) : error;
  const errorInfo = handleError(errorObj);
  const recoveryActions = getRecoveryActions(errorObj);

  const getErrorIcon = () => {
    switch (errorInfo.type) {
      case ErrorType.NETWORK:
        return <Wifi className="h-4 w-4" />;
      case ErrorType.AUTHENTICATION:
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getErrorColor = () => {
    switch (errorInfo.type) {
      case ErrorType.NETWORK:
        return 'border-orange-200 bg-orange-50 text-orange-800';
      case ErrorType.AUTHENTICATION:
        return 'border-red-200 bg-red-50 text-red-800';
      case ErrorType.VALIDATION:
        return 'border-yellow-200 bg-yellow-50 text-yellow-800';
      default:
        return 'border-red-200 bg-red-50 text-red-800';
    }
  };

  if (variant === 'banner') {
    return (
      <div className={`${getErrorColor()} border-l-4 p-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {getErrorIcon()}
            <div className="ml-3">
              <p className="text-sm font-medium">{errorInfo.userMessage}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {isRetryable(errorObj) && onRetry && (
              <Button
                size="sm"
                variant="outline"
                onClick={onRetry}
                className="text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            )}
            {onDismiss && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDismiss}
                className="text-xs"
              >
                Dismiss
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <Card className={`border-red-200 ${className}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-red-100 rounded-full">
              {getErrorIcon()}
            </div>
            <div>
              <CardTitle className="text-lg text-red-900">
                {errorInfo.type === ErrorType.NETWORK ? 'Connection Problem' : 'Something went wrong'}
              </CardTitle>
              <CardDescription className="text-red-700">
                {errorInfo.userMessage}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {recoveryActions.map((action, index) => (
              <Button
                key={index}
                size="sm"
                variant={action.primary ? "default" : "outline"}
                onClick={action.action}
                className={action.primary ? "" : "text-red-700 border-red-300 hover:bg-red-50"}
              >
                {action.label === 'Retry' && <RefreshCw className="h-3 w-3 mr-1" />}
                {action.label === 'Go Back' && <ArrowLeft className="h-3 w-3 mr-1" />}
                {action.label === 'Go to Dashboard' && <Home className="h-3 w-3 mr-1" />}
                {action.label === 'Contact Support' && <Mail className="h-3 w-3 mr-1" />}
                {action.label}
              </Button>
            ))}
          </div>
          
          {showDetails && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-red-600 hover:text-red-800">
                Technical Details
              </summary>
              <div className="mt-2 p-3 bg-red-100 rounded text-xs font-mono text-red-700 overflow-auto max-h-32">
                <div className="mb-2">
                  <strong>Error Type:</strong> {errorInfo.type}
                </div>
                <div className="mb-2">
                  <strong>Message:</strong> {errorInfo.message}
                </div>
                {errorObj.stack && (
                  <div>
                    <strong>Stack:</strong>
                    <pre className="whitespace-pre-wrap mt-1 text-xs">
                      {errorObj.stack}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          )}
        </CardContent>
      </Card>
    );
  }

  // Default inline variant
  return (
    <Alert className={`${getErrorColor()} ${className}`}>
      {getErrorIcon()}
      <AlertDescription className="flex items-center justify-between">
        <span>{errorInfo.userMessage}</span>
        <div className="flex items-center space-x-2 ml-4">
          {isRetryable(errorObj) && onRetry && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRetry}
              className="h-6 px-2 text-xs hover:bg-white/20"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          )}
          {onDismiss && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              className="h-6 px-2 text-xs hover:bg-white/20"
            >
              ×
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

// Specialized error components for common scenarios
export function NetworkErrorMessage({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  return (
    <ErrorMessage
      error={new Error('Network connection failed')}
      onRetry={onRetry}
      variant="card"
      className={className}
    />
  );
}

export function AuthErrorMessage({ className }: { className?: string }) {
  return (
    <ErrorMessage
      error={new Error('Authentication failed - unauthorized')}
      variant="card"
      className={className}
    />
  );
}

export function ValidationErrorMessage({ 
  message, 
  onDismiss, 
  className 
}: { 
  message: string; 
  onDismiss?: () => void; 
  className?: string;
}) {
  return (
    <ErrorMessage
      error={new Error(`Validation failed: ${message}`)}
      onDismiss={onDismiss}
      variant="inline"
      className={className}
    />
  );
}

// Hook for managing error state in components
export function useErrorState() {
  const [error, setError] = React.useState<Error | null>(null);
  const [isRetrying, setIsRetrying] = React.useState(false);

  const handleError = (err: Error | unknown) => {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    setError(errorObj);
  };

  const clearError = () => {
    setError(null);
    setIsRetrying(false);
  };

  const retry = async (retryFn: () => Promise<void>) => {
    setIsRetrying(true);
    try {
      await retryFn();
      clearError();
    } catch (err) {
      handleError(err);
    } finally {
      setIsRetrying(false);
    }
  };

  return {
    error,
    isRetrying,
    handleError,
    clearError,
    retry
  };
}