/**
 * Comprehensive error handling utilities for onboarding flow
 */

export enum ErrorType {
  NETWORK = 'network',
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  PERMISSION = 'permission',
  SERVER = 'server',
  UNKNOWN = 'unknown'
}

export interface ErrorInfo {
  type: ErrorType;
  message: string;
  userMessage: string;
  actionable: boolean;
  retryable: boolean;
  recoveryActions: RecoveryAction[];
}

export interface RecoveryAction {
  label: string;
  action: () => void | Promise<void>;
  primary?: boolean;
}

export class OnboardingErrorHandler {
  /**
   * Classify and handle different types of errors
   */
  static handleError(error: Error | unknown): ErrorInfo {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Network errors
    if (this.isNetworkError(errorMessage)) {
      return {
        type: ErrorType.NETWORK,
        message: errorMessage,
        userMessage: "We're having trouble connecting to our servers. Please check your internet connection.",
        actionable: true,
        retryable: true,
        recoveryActions: [
          {
            label: 'Check Connection',
            action: () => window.open('https://www.google.com', '_blank'),
          },
          {
            label: 'Retry',
            action: () => window.location.reload(),
            primary: true
          }
        ]
      };
    }

    // Authentication errors
    if (this.isAuthError(errorMessage)) {
      return {
        type: ErrorType.AUTHENTICATION,
        message: errorMessage,
        userMessage: "Your session has expired. Please sign in again to continue.",
        actionable: true,
        retryable: false,
        recoveryActions: [
          {
            label: 'Sign In',
            action: () => window.location.href = '/auth/login',
            primary: true
          }
        ]
      };
    }

    // Validation errors
    if (this.isValidationError(errorMessage)) {
      return {
        type: ErrorType.VALIDATION,
        message: errorMessage,
        userMessage: "Please check your information and try again.",
        actionable: true,
        retryable: true,
        recoveryActions: [
          {
            label: 'Review Information',
            action: () => {}, // Will be handled by the component
            primary: true
          }
        ]
      };
    }

    // Permission errors
    if (this.isPermissionError(errorMessage)) {
      return {
        type: ErrorType.PERMISSION,
        message: errorMessage,
        userMessage: "You don't have permission to perform this action.",
        actionable: true,
        retryable: false,
        recoveryActions: [
          {
            label: 'Contact Support',
            action: () => window.location.href = 'mailto:support@example.com'
          },
          {
            label: 'Go to Dashboard',
            action: () => window.location.href = '/dashboard',
            primary: true
          }
        ]
      };
    }

    // Server errors
    if (this.isServerError(errorMessage)) {
      return {
        type: ErrorType.SERVER,
        message: errorMessage,
        userMessage: "We're experiencing technical difficulties. Please try again in a few moments.",
        actionable: true,
        retryable: true,
        recoveryActions: [
          {
            label: 'Try Again',
            action: () => window.location.reload(),
            primary: true
          },
          {
            label: 'Contact Support',
            action: () => window.location.href = 'mailto:support@example.com'
          }
        ]
      };
    }

    // Unknown errors
    return {
      type: ErrorType.UNKNOWN,
      message: errorMessage,
      userMessage: "Something unexpected happened. We're working to fix this issue.",
      actionable: true,
      retryable: true,
      recoveryActions: [
        {
          label: 'Reload Page',
          action: () => window.location.reload(),
          primary: true
        },
        {
          label: 'Go Back',
          action: () => window.history.back()
        }
      ]
    };
  }

  private static isNetworkError(message: string): boolean {
    const networkKeywords = [
      'fetch',
      'network',
      'connection',
      'timeout',
      'offline',
      'ERR_NETWORK',
      'ERR_INTERNET_DISCONNECTED',
      'Failed to load'
    ];
    return networkKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private static isAuthError(message: string): boolean {
    const authKeywords = [
      'unauthorized',
      'authentication',
      'session expired',
      'invalid token',
      'access denied',
      '401'
    ];
    return authKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private static isValidationError(message: string): boolean {
    const validationKeywords = [
      'validation',
      'invalid',
      'required',
      'format',
      'must be',
      'should be',
      '400'
    ];
    return validationKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private static isPermissionError(message: string): boolean {
    const permissionKeywords = [
      'permission',
      'forbidden',
      'access denied',
      'not allowed',
      '403'
    ];
    return permissionKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private static isServerError(message: string): boolean {
    const serverKeywords = [
      'internal server error',
      'server error',
      'service unavailable',
      'bad gateway',
      '500',
      '502',
      '503',
      '504'
    ];
    return serverKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Get user-friendly error message based on error type
   */
  static getUserFriendlyMessage(error: Error | unknown): string {
    const errorInfo = this.handleError(error);
    return errorInfo.userMessage;
  }

  /**
   * Check if an error is retryable
   */
  static isRetryable(error: Error | unknown): boolean {
    const errorInfo = this.handleError(error);
    return errorInfo.retryable;
  }

  /**
   * Get recovery actions for an error
   */
  static getRecoveryActions(error: Error | unknown): RecoveryAction[] {
    const errorInfo = this.handleError(error);
    return errorInfo.recoveryActions;
  }
}

/**
 * Hook for error handling in components
 */
export function useErrorHandler() {
  const handleError = (error: Error | unknown) => {
    return OnboardingErrorHandler.handleError(error);
  };

  const getUserMessage = (error: Error | unknown) => {
    return OnboardingErrorHandler.getUserFriendlyMessage(error);
  };

  const isRetryable = (error: Error | unknown) => {
    return OnboardingErrorHandler.isRetryable(error);
  };

  const getRecoveryActions = (error: Error | unknown) => {
    return OnboardingErrorHandler.getRecoveryActions(error);
  };

  return {
    handleError,
    getUserMessage,
    isRetryable,
    getRecoveryActions
  };
}

/**
 * Utility for graceful degradation
 */
export class GracefulDegradation {
  /**
   * Execute a function with fallback behavior
   */
  static async withFallback<T>(
    primaryAction: () => Promise<T>,
    fallbackAction: () => T | Promise<T>,
    options: {
      retries?: number;
      retryDelay?: number;
      onError?: (error: Error) => void;
    } = {}
  ): Promise<T> {
    const { retries = 2, retryDelay = 1000, onError } = options;
    
    let lastError: Error;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await primaryAction();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (onError) {
          onError(lastError);
        }
        
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
        }
      }
    }
    
    // All retries failed, use fallback
    console.warn('Primary action failed after retries, using fallback:', lastError);
    return await fallbackAction();
  }

  /**
   * Execute with offline fallback
   */
  static async withOfflineFallback<T>(
    onlineAction: () => Promise<T>,
    offlineAction: () => T | Promise<T>
  ): Promise<T> {
    if (!navigator.onLine) {
      return await offlineAction();
    }

    try {
      return await onlineAction();
    } catch (error) {
      if (OnboardingErrorHandler.handleError(error).type === ErrorType.NETWORK) {
        return await offlineAction();
      }
      throw error;
    }
  }
}