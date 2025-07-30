import { OnboardingErrorHandler, ErrorType, GracefulDegradation } from '@/lib/utils/error-handling';

describe('OnboardingErrorHandler', () => {
  describe('handleError', () => {
    it('should classify network errors correctly', () => {
      const networkErrors = [
        new Error('fetch failed'),
        new Error('Network connection lost'),
        new Error('ERR_NETWORK'),
        new Error('Failed to load resource'),
        new Error('Connection timeout')
      ];

      networkErrors.forEach(error => {
        const result = OnboardingErrorHandler.handleError(error);
        expect(result.type).toBe(ErrorType.NETWORK);
        expect(result.retryable).toBe(true);
        expect(result.userMessage).toContain('connection');
        expect(result.recoveryActions).toHaveLength(2);
        expect(result.recoveryActions.some(action => action.label === 'Retry')).toBe(true);
      });
    });

    it('should classify authentication errors correctly', () => {
      const authErrors = [
        new Error('Unauthorized access'),
        new Error('Authentication failed'),
        new Error('Session expired'),
        new Error('Invalid token'),
        new Error('401 Unauthorized')
      ];

      authErrors.forEach(error => {
        const result = OnboardingErrorHandler.handleError(error);
        expect(result.type).toBe(ErrorType.AUTHENTICATION);
        expect(result.retryable).toBe(false);
        expect(result.userMessage).toContain('session');
        expect(result.recoveryActions.some(action => action.label === 'Sign In')).toBe(true);
      });
    });

    it('should classify validation errors correctly', () => {
      const validationErrors = [
        new Error('Validation failed: email is required'),
        new Error('Invalid format'),
        new Error('Field must be provided'),
        new Error('400 Bad Request')
      ];

      validationErrors.forEach(error => {
        const result = OnboardingErrorHandler.handleError(error);
        expect(result.type).toBe(ErrorType.VALIDATION);
        expect(result.retryable).toBe(true);
        expect(result.userMessage).toContain('information');
      });
    });

    it('should classify permission errors correctly', () => {
      const permissionErrors = [
        new Error('Permission denied'),
        new Error('403 Forbidden'),
        new Error('Access denied'),
        new Error('Not allowed to perform this action')
      ];

      permissionErrors.forEach(error => {
        const result = OnboardingErrorHandler.handleError(error);
        expect(result.type).toBe(ErrorType.PERMISSION);
        expect(result.retryable).toBe(false);
        expect(result.userMessage).toContain('permission');
        expect(result.recoveryActions.some(action => action.label === 'Contact Support')).toBe(true);
      });
    });

    it('should classify server errors correctly', () => {
      const serverErrors = [
        new Error('Internal server error'),
        new Error('500 Server Error'),
        new Error('Service unavailable'),
        new Error('502 Bad Gateway')
      ];

      serverErrors.forEach(error => {
        const result = OnboardingErrorHandler.handleError(error);
        expect(result.type).toBe(ErrorType.SERVER);
        expect(result.retryable).toBe(true);
        expect(result.userMessage).toContain('technical difficulties');
        expect(result.recoveryActions.some(action => action.label === 'Try Again')).toBe(true);
      });
    });

    it('should handle unknown errors', () => {
      const unknownErrors = [
        new Error('Something weird happened'),
        new Error('Unexpected error'),
        'String error',
        null,
        undefined
      ];

      unknownErrors.forEach(error => {
        const result = OnboardingErrorHandler.handleError(error);
        expect(result.type).toBe(ErrorType.UNKNOWN);
        expect(result.retryable).toBe(true);
        expect(result.userMessage).toContain('unexpected');
        expect(result.recoveryActions.some(action => action.label === 'Reload Page')).toBe(true);
      });
    });
  });

  describe('getUserFriendlyMessage', () => {
    it('should return user-friendly messages', () => {
      const networkError = new Error('fetch failed');
      const message = OnboardingErrorHandler.getUserFriendlyMessage(networkError);
      expect(message).not.toContain('fetch');
      expect(message).toContain('connection');
    });
  });

  describe('isRetryable', () => {
    it('should correctly identify retryable errors', () => {
      expect(OnboardingErrorHandler.isRetryable(new Error('fetch failed'))).toBe(true);
      expect(OnboardingErrorHandler.isRetryable(new Error('500 error'))).toBe(true);
      expect(OnboardingErrorHandler.isRetryable(new Error('validation failed'))).toBe(true);
      expect(OnboardingErrorHandler.isRetryable(new Error('unauthorized'))).toBe(false);
      expect(OnboardingErrorHandler.isRetryable(new Error('permission denied'))).toBe(false);
    });
  });

  describe('getRecoveryActions', () => {
    it('should provide appropriate recovery actions', () => {
      const networkError = new Error('network failed');
      const actions = OnboardingErrorHandler.getRecoveryActions(networkError);
      
      expect(actions).toHaveLength(2);
      expect(actions.some(action => action.label === 'Retry')).toBe(true);
      expect(actions.some(action => action.primary)).toBe(true);
    });
  });
});

describe('GracefulDegradation', () => {
  describe('withFallback', () => {
    it('should execute primary action when successful', async () => {
      const primaryAction = jest.fn().mockResolvedValue('success');
      const fallbackAction = jest.fn().mockReturnValue('fallback');

      const result = await GracefulDegradation.withFallback(primaryAction, fallbackAction);

      expect(result).toBe('success');
      expect(primaryAction).toHaveBeenCalledTimes(1);
      expect(fallbackAction).not.toHaveBeenCalled();
    });

    it('should use fallback when primary action fails', async () => {
      const primaryAction = jest.fn().mockRejectedValue(new Error('failed'));
      const fallbackAction = jest.fn().mockReturnValue('fallback');

      const result = await GracefulDegradation.withFallback(primaryAction, fallbackAction);

      expect(result).toBe('fallback');
      expect(primaryAction).toHaveBeenCalledTimes(3); // Default 2 retries + initial attempt
      expect(fallbackAction).toHaveBeenCalledTimes(1);
    });

    it('should retry with exponential backoff', async () => {
      const primaryAction = jest.fn().mockRejectedValue(new Error('failed'));
      const fallbackAction = jest.fn().mockReturnValue('fallback');
      const onError = jest.fn();

      const startTime = Date.now();
      await GracefulDegradation.withFallback(primaryAction, fallbackAction, {
        retries: 2,
        retryDelay: 100,
        onError
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThan(300); // Should have delays
      expect(onError).toHaveBeenCalledTimes(3); // Called for each failure
      expect(primaryAction).toHaveBeenCalledTimes(3);
    });

    it('should handle async fallback actions', async () => {
      const primaryAction = jest.fn().mockRejectedValue(new Error('failed'));
      const fallbackAction = jest.fn().mockResolvedValue('async fallback');

      const result = await GracefulDegradation.withFallback(primaryAction, fallbackAction);

      expect(result).toBe('async fallback');
      expect(fallbackAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('withOfflineFallback', () => {
    const originalOnLine = navigator.onLine;

    afterEach(() => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: originalOnLine
      });
    });

    it('should use offline action when offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false
      });

      const onlineAction = jest.fn().mockResolvedValue('online');
      const offlineAction = jest.fn().mockReturnValue('offline');

      const result = await GracefulDegradation.withOfflineFallback(onlineAction, offlineAction);

      expect(result).toBe('offline');
      expect(onlineAction).not.toHaveBeenCalled();
      expect(offlineAction).toHaveBeenCalledTimes(1);
    });

    it('should use online action when online and successful', async () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      });

      const onlineAction = jest.fn().mockResolvedValue('online');
      const offlineAction = jest.fn().mockReturnValue('offline');

      const result = await GracefulDegradation.withOfflineFallback(onlineAction, offlineAction);

      expect(result).toBe('online');
      expect(onlineAction).toHaveBeenCalledTimes(1);
      expect(offlineAction).not.toHaveBeenCalled();
    });

    it('should use offline action when online but network error occurs', async () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      });

      const onlineAction = jest.fn().mockRejectedValue(new Error('network failed'));
      const offlineAction = jest.fn().mockReturnValue('offline fallback');

      const result = await GracefulDegradation.withOfflineFallback(onlineAction, offlineAction);

      expect(result).toBe('offline fallback');
      expect(onlineAction).toHaveBeenCalledTimes(1);
      expect(offlineAction).toHaveBeenCalledTimes(1);
    });

    it('should throw non-network errors', async () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      });

      const onlineAction = jest.fn().mockRejectedValue(new Error('validation failed'));
      const offlineAction = jest.fn().mockReturnValue('offline');

      await expect(
        GracefulDegradation.withOfflineFallback(onlineAction, offlineAction)
      ).rejects.toThrow('validation failed');

      expect(offlineAction).not.toHaveBeenCalled();
    });
  });
});