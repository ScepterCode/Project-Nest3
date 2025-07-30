import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { 
  ErrorMessage, 
  NetworkErrorMessage, 
  AuthErrorMessage, 
  ValidationErrorMessage,
  useErrorState 
} from '@/components/onboarding/error-message';

// Mock the error handling utility
jest.mock('@/lib/utils/error-handling', () => ({
  useErrorHandler: () => ({
    handleError: (error: Error) => {
      if (error.message.includes('network') || error.message.includes('fetch')) {
        return {
          type: 'network',
          message: error.message,
          userMessage: "We're having trouble connecting to our servers. Please check your internet connection.",
          actionable: true,
          retryable: true,
          recoveryActions: [
            { label: 'Check Connection', action: jest.fn() },
            { label: 'Retry', action: jest.fn(), primary: true }
          ]
        };
      }
      if (error.message.includes('unauthorized') || error.message.includes('Authentication')) {
        return {
          type: 'authentication',
          message: error.message,
          userMessage: "Your session has expired. Please sign in again to continue.",
          actionable: true,
          retryable: false,
          recoveryActions: [
            { label: 'Sign In', action: jest.fn(), primary: true }
          ]
        };
      }
      if (error.message.includes('Validation')) {
        return {
          type: 'validation',
          message: error.message,
          userMessage: "Please check your information and try again.",
          actionable: true,
          retryable: true,
          recoveryActions: [
            { label: 'Review Information', action: jest.fn(), primary: true }
          ]
        };
      }
      return {
        type: 'unknown',
        message: error.message,
        userMessage: "Something unexpected happened. We're working to fix this issue.",
        actionable: true,
        retryable: true,
        recoveryActions: [
          { label: 'Reload Page', action: jest.fn(), primary: true },
          { label: 'Go Back', action: jest.fn() }
        ]
      };
    },
    getUserMessage: (error: Error) => "User friendly message",
    isRetryable: (error: Error) => !error.message.includes('unauthorized'),
    getRecoveryActions: (error: Error) => [
      { label: 'Retry', action: jest.fn(), primary: true }
    ]
  }),
  ErrorType: {
    NETWORK: 'network',
    AUTHENTICATION: 'authentication',
    VALIDATION: 'validation',
    PERMISSION: 'permission',
    SERVER: 'server',
    UNKNOWN: 'unknown'
  }
}));

describe('ErrorMessage', () => {
  it('should not render when no error is provided', () => {
    const { container } = render(<ErrorMessage error={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render inline error message by default', () => {
    const error = new Error('Test error');
    render(<ErrorMessage error={error} />);
    
    expect(screen.getByText(/Something unexpected happened/)).toBeInTheDocument();
  });

  it('should render card variant when specified', () => {
    const error = new Error('Test error');
    render(<ErrorMessage error={error} variant="card" />);
    
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/Something unexpected happened/)).toBeInTheDocument();
  });

  it('should render banner variant when specified', () => {
    const error = new Error('Test error');
    render(<ErrorMessage error={error} variant="banner" />);
    
    expect(screen.getByText(/Something unexpected happened/)).toBeInTheDocument();
  });

  it('should show retry button for retryable errors', () => {
    const error = new Error('Network failed');
    const onRetry = jest.fn();
    
    render(<ErrorMessage error={error} onRetry={onRetry} />);
    
    const retryButton = screen.getByText('Retry');
    expect(retryButton).toBeInTheDocument();
    
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('should show dismiss button when onDismiss is provided', () => {
    const error = new Error('Test error');
    const onDismiss = jest.fn();
    
    render(<ErrorMessage error={error} onDismiss={onDismiss} />);
    
    const dismissButton = screen.getByText('×');
    expect(dismissButton).toBeInTheDocument();
    
    fireEvent.click(dismissButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('should handle string errors', () => {
    render(<ErrorMessage error="String error message" />);
    
    expect(screen.getByText(/Something unexpected happened/)).toBeInTheDocument();
  });

  it('should show technical details when showDetails is true', () => {
    const error = new Error('Test error with stack');
    error.stack = 'Error stack trace';
    
    render(<ErrorMessage error={error} variant="card" showDetails={true} />);
    
    expect(screen.getByText('Technical Details')).toBeInTheDocument();
  });

  it('should render recovery actions in card variant', () => {
    const error = new Error('Test error');
    render(<ErrorMessage error={error} variant="card" />);
    
    expect(screen.getByText('Reload Page')).toBeInTheDocument();
    expect(screen.getByText('Go Back')).toBeInTheDocument();
  });
});

describe('NetworkErrorMessage', () => {
  it('should render network-specific error message', () => {
    render(<NetworkErrorMessage />);
    
    expect(screen.getByText(/trouble connecting/)).toBeInTheDocument();
    expect(screen.getByText('Connection Problem')).toBeInTheDocument();
  });

  it('should call onRetry when retry button is clicked', () => {
    const onRetry = jest.fn();
    render(<NetworkErrorMessage onRetry={onRetry} />);
    
    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);
    
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('AuthErrorMessage', () => {
  it('should render authentication-specific error message', () => {
    render(<AuthErrorMessage />);
    
    expect(screen.getByText(/session has expired/)).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });
});

describe('ValidationErrorMessage', () => {
  it('should render validation-specific error message', () => {
    const message = 'Email is required';
    render(<ValidationErrorMessage message={message} />);
    
    expect(screen.getByText(/check your information/)).toBeInTheDocument();
  });

  it('should call onDismiss when dismiss button is clicked', () => {
    const onDismiss = jest.fn();
    render(<ValidationErrorMessage message="Test validation" onDismiss={onDismiss} />);
    
    const dismissButton = screen.getByText('×');
    fireEvent.click(dismissButton);
    
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('useErrorState', () => {
  function TestComponent() {
    const { error, isRetrying, handleError, clearError, retry } = useErrorState();
    
    return (
      <div>
        <div data-testid="error">{error?.message || 'No error'}</div>
        <div data-testid="retrying">{isRetrying ? 'Retrying' : 'Not retrying'}</div>
        <button onClick={() => handleError(new Error('Test error'))}>
          Set Error
        </button>
        <button onClick={clearError}>Clear Error</button>
        <button onClick={() => retry(async () => {
          throw new Error('Retry failed');
        })}>
          Retry and Fail
        </button>
        <button onClick={() => retry(async () => {
          // Success
        })}>
          Retry and Succeed
        </button>
      </div>
    );
  }

  it('should manage error state correctly', () => {
    render(<TestComponent />);
    
    expect(screen.getByTestId('error')).toHaveTextContent('No error');
    expect(screen.getByTestId('retrying')).toHaveTextContent('Not retrying');
    
    // Set error
    fireEvent.click(screen.getByText('Set Error'));
    expect(screen.getByTestId('error')).toHaveTextContent('Test error');
    
    // Clear error
    fireEvent.click(screen.getByText('Clear Error'));
    expect(screen.getByTestId('error')).toHaveTextContent('No error');
  });

  it('should handle retry success', async () => {
    render(<TestComponent />);
    
    // Set initial error
    fireEvent.click(screen.getByText('Set Error'));
    expect(screen.getByTestId('error')).toHaveTextContent('Test error');
    
    // Retry successfully
    fireEvent.click(screen.getByText('Retry and Succeed'));
    
    // Wait for async operation
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(screen.getByTestId('error')).toHaveTextContent('No error');
    expect(screen.getByTestId('retrying')).toHaveTextContent('Not retrying');
  });

  it('should handle retry failure', async () => {
    render(<TestComponent />);
    
    // Retry and fail
    fireEvent.click(screen.getByText('Retry and Fail'));
    
    // Wait for async operation
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(screen.getByTestId('error')).toHaveTextContent('Retry failed');
    expect(screen.getByTestId('retrying')).toHaveTextContent('Not retrying');
  });
});