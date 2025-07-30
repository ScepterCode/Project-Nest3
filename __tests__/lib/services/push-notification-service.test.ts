import { PushNotificationService, pushNotificationService } from '@/lib/services/push-notification-service';

// Mock browser APIs
const mockServiceWorkerRegistration = {
  showNotification: jest.fn(),
  pushManager: {
    subscribe: jest.fn(),
    getSubscription: jest.fn()
  },
  sync: {
    register: jest.fn()
  }
};

const mockPushSubscription = {
  unsubscribe: jest.fn(),
  toJSON: jest.fn(() => ({
    endpoint: 'https://example.com/push',
    keys: {
      p256dh: 'test-key',
      auth: 'test-auth'
    }
  }))
};

// Mock global objects
Object.defineProperty(global, 'navigator', {
  value: {
    serviceWorker: {
      register: jest.fn(),
      ready: Promise.resolve(mockServiceWorkerRegistration)
    },
    onLine: true
  },
  writable: true
});

Object.defineProperty(global, 'Notification', {
  value: {
    permission: 'default',
    requestPermission: jest.fn()
  },
  writable: true
});

Object.defineProperty(global, 'window', {
  value: {
    ServiceWorkerRegistration: {
      prototype: {}
    }
  },
  writable: true
});

// Mock fetch
global.fetch = jest.fn();

describe('PushNotificationService', () => {
  let service: PushNotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = PushNotificationService.getInstance();
    
    // Reset notification permission
    Object.defineProperty(Notification, 'permission', {
      value: 'default',
      writable: true
    });
  });

  describe('Initialization', () => {
    it('should be a singleton', () => {
      const instance1 = PushNotificationService.getInstance();
      const instance2 = PushNotificationService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should initialize service worker successfully', async () => {
      (navigator.serviceWorker.register as jest.Mock).mockResolvedValue(mockServiceWorkerRegistration);

      const result = await service.initialize();

      expect(result).toBe(true);
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
    });

    it('should handle service worker registration failure', async () => {
      (navigator.serviceWorker.register as jest.Mock).mockRejectedValue(new Error('Registration failed'));

      const result = await service.initialize();

      expect(result).toBe(false);
    });

    it('should detect unsupported browsers', () => {
      // Mock unsupported browser
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true
      });

      const supported = service.isSupported();
      expect(supported).toBe(false);
    });
  });

  describe('Permission Management', () => {
    it('should request notification permission', async () => {
      (Notification.requestPermission as jest.Mock).mockResolvedValue('granted');

      const permission = await service.requestPermission();

      expect(permission).toBe('granted');
      expect(Notification.requestPermission).toHaveBeenCalled();
    });

    it('should get current permission status', () => {
      Object.defineProperty(Notification, 'permission', {
        value: 'granted',
        writable: true
      });

      const permission = service.getPermission();
      expect(permission).toBe('granted');
    });

    it('should handle permission denial', async () => {
      (Notification.requestPermission as jest.Mock).mockResolvedValue('denied');

      const permission = await service.requestPermission();
      expect(permission).toBe('denied');
    });
  });

  describe('Subscription Management', () => {
    beforeEach(() => {
      Object.defineProperty(Notification, 'permission', {
        value: 'granted',
        writable: true
      });
      
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ publicKey: 'test-vapid-key' })
      });

      mockServiceWorkerRegistration.pushManager.subscribe.mockResolvedValue(mockPushSubscription);
    });

    it('should subscribe to push notifications', async () => {
      // Mock successful initialization
      (navigator.serviceWorker.register as jest.Mock).mockResolvedValue(mockServiceWorkerRegistration);
      await service.initialize();

      const subscription = await service.subscribe('user-123');

      expect(subscription).toBe(mockPushSubscription);
      expect(mockServiceWorkerRegistration.pushManager.subscribe).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith('/api/notifications/subscribe', expect.any(Object));
    });

    it('should handle subscription failure', async () => {
      await service.initialize();
      mockServiceWorkerRegistration.pushManager.subscribe.mockRejectedValue(new Error('Subscription failed'));

      await expect(service.subscribe('user-123')).rejects.toThrow('Subscription failed');
    });

    it('should unsubscribe from push notifications', async () => {
      await service.initialize();
      
      // First subscribe
      await service.subscribe('user-123');
      mockPushSubscription.unsubscribe.mockResolvedValue(true);

      const result = await service.unsubscribe('user-123');

      expect(result).toBe(true);
      expect(mockPushSubscription.unsubscribe).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith('/api/notifications/unsubscribe', expect.any(Object));
    });

    it('should handle permission denied during subscription', async () => {
      Object.defineProperty(Notification, 'permission', {
        value: 'denied',
        writable: true
      });

      await service.initialize();

      await expect(service.subscribe('user-123')).rejects.toThrow('Notification permission denied');
    });
  });

  describe('Notification Display', () => {
    beforeEach(async () => {
      Object.defineProperty(Notification, 'permission', {
        value: 'granted',
        writable: true
      });
      
      (navigator.serviceWorker.register as jest.Mock).mockResolvedValue(mockServiceWorkerRegistration);
      await service.initialize();
    });

    it('should show basic notification', async () => {
      const payload = {
        title: 'Test Notification',
        body: 'This is a test notification'
      };

      await service.showNotification(payload);

      expect(mockServiceWorkerRegistration.showNotification).toHaveBeenCalledWith(
        'Test Notification',
        expect.objectContaining({
          body: 'This is a test notification',
          icon: '/icons/notification-icon.png',
          badge: '/icons/notification-badge.png'
        })
      );
    });

    it('should show notification with actions', async () => {
      const payload = {
        title: 'Enrollment Available',
        body: 'A spot opened in your waitlisted class',
        actions: [
          { action: 'enroll', title: 'Enroll Now' },
          { action: 'dismiss', title: 'Dismiss' }
        ]
      };

      await service.showNotification(payload);

      expect(mockServiceWorkerRegistration.showNotification).toHaveBeenCalledWith(
        'Enrollment Available',
        expect.objectContaining({
          actions: payload.actions
        })
      );
    });

    it('should handle notification permission denied', async () => {
      Object.defineProperty(Notification, 'permission', {
        value: 'denied',
        writable: true
      });

      const payload = {
        title: 'Test',
        body: 'Test notification'
      };

      await expect(service.showNotification(payload)).rejects.toThrow('Notification permission not granted');
    });
  });

  describe('Enrollment Notifications', () => {
    beforeEach(async () => {
      Object.defineProperty(Notification, 'permission', {
        value: 'granted',
        writable: true
      });
      
      (navigator.serviceWorker.register as jest.Mock).mockResolvedValue(mockServiceWorkerRegistration);
      await service.initialize();
    });

    it('should send enrollment approved notification', async () => {
      const data = {
        className: 'Computer Science 101',
        classId: 'cs-101'
      };

      await service.sendEnrollmentNotification('enrollment_approved', data);

      expect(mockServiceWorkerRegistration.showNotification).toHaveBeenCalledWith(
        'Enrollment Approved! 🎉',
        expect.objectContaining({
          body: "You've been enrolled in Computer Science 101",
          tag: 'enrollment-approved',
          requireInteraction: true
        })
      );
    });

    it('should send waitlist advanced notification', async () => {
      const data = {
        className: 'Data Structures',
        classId: 'cs-201',
        position: 2
      };

      await service.sendEnrollmentNotification('waitlist_advanced', data);

      expect(mockServiceWorkerRegistration.showNotification).toHaveBeenCalledWith(
        'Waitlist Update 📈',
        expect.objectContaining({
          body: "You're now #2 in line for Data Structures",
          tag: 'waitlist-advanced'
        })
      );
    });

    it('should send spot available notification', async () => {
      const data = {
        className: 'Algorithms',
        classId: 'cs-301'
      };

      await service.sendEnrollmentNotification('spot_available', data);

      expect(mockServiceWorkerRegistration.showNotification).toHaveBeenCalledWith(
        'Spot Available! ⚡',
        expect.objectContaining({
          body: 'A spot opened in Algorithms. Enroll now!',
          tag: 'spot-available',
          requireInteraction: true,
          actions: [
            { action: 'enroll', title: 'Enroll Now' },
            { action: 'view', title: 'View Details' }
          ]
        })
      );
    });

    it('should send deadline reminder notification', async () => {
      const data = {
        className: 'Web Development',
        classId: 'cs-250',
        deadlineType: 'Drop',
        timeRemaining: 'in 2 days'
      };

      await service.sendEnrollmentNotification('deadline_reminder', data);

      expect(mockServiceWorkerRegistration.showNotification).toHaveBeenCalledWith(
        'Deadline Reminder ⏰',
        expect.objectContaining({
          body: 'Drop deadline for Web Development is in 2 days',
          tag: 'deadline-reminder'
        })
      );
    });

    it('should send enrollment period open notification', async () => {
      const data = {
        term: 'Spring 2024'
      };

      await service.sendEnrollmentNotification('enrollment_period_open', data);

      expect(mockServiceWorkerRegistration.showNotification).toHaveBeenCalledWith(
        'Enrollment Open! 📚',
        expect.objectContaining({
          body: 'Enrollment is now open for Spring 2024',
          tag: 'enrollment-open'
        })
      );
    });
  });

  describe('Mobile-Specific Features', () => {
    beforeEach(async () => {
      Object.defineProperty(Notification, 'permission', {
        value: 'granted',
        writable: true
      });
      
      (navigator.serviceWorker.register as jest.Mock).mockResolvedValue(mockServiceWorkerRegistration);
      await service.initialize();
    });

    it('should include vibration pattern for mobile devices', async () => {
      const payload = {
        title: 'Mobile Notification',
        body: 'This should vibrate on mobile'
      };

      await service.showNotification(payload);

      expect(mockServiceWorkerRegistration.showNotification).toHaveBeenCalledWith(
        'Mobile Notification',
        expect.objectContaining({
          vibrate: [200, 100, 200]
        })
      );
    });

    it('should set appropriate badge for mobile notifications', async () => {
      const payload = {
        title: 'Badge Test',
        body: 'Testing badge display'
      };

      await service.showNotification(payload);

      expect(mockServiceWorkerRegistration.showNotification).toHaveBeenCalledWith(
        'Badge Test',
        expect.objectContaining({
          badge: '/icons/notification-badge.png'
        })
      );
    });

    it('should handle touch-friendly action buttons', async () => {
      const data = {
        className: 'Mobile Class',
        classId: 'mobile-101'
      };

      await service.sendEnrollmentNotification('spot_available', data);

      const call = mockServiceWorkerRegistration.showNotification.mock.calls[0];
      const options = call[1];

      expect(options.actions).toHaveLength(2);
      expect(options.actions[0]).toEqual({ action: 'enroll', title: 'Enroll Now' });
      expect(options.actions[1]).toEqual({ action: 'view', title: 'View Details' });
    });
  });

  describe('Error Handling', () => {
    it('should handle VAPID key fetch failure', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      
      await service.initialize();

      await expect(service.subscribe('user-123')).rejects.toThrow();
    });

    it('should handle service worker not ready', async () => {
      Object.defineProperty(navigator.serviceWorker, 'ready', {
        value: Promise.reject(new Error('Service worker not ready')),
        writable: true
      });

      await expect(service.initialize()).resolves.toBe(false);
    });

    it('should handle notification display failure', async () => {
      await service.initialize();
      mockServiceWorkerRegistration.showNotification.mockRejectedValue(new Error('Display failed'));

      const payload = {
        title: 'Test',
        body: 'Test notification'
      };

      await expect(service.showNotification(payload)).rejects.toThrow('Display failed');
    });
  });

  describe('Accessibility Features', () => {
    beforeEach(async () => {
      Object.defineProperty(Notification, 'permission', {
        value: 'granted',
        writable: true
      });
      
      (navigator.serviceWorker.register as jest.Mock).mockResolvedValue(mockServiceWorkerRegistration);
      await service.initialize();
    });

    it('should include timestamp for screen readers', async () => {
      const payload = {
        title: 'Accessible Notification',
        body: 'This notification includes timestamp'
      };

      await service.showNotification(payload);

      expect(mockServiceWorkerRegistration.showNotification).toHaveBeenCalledWith(
        'Accessible Notification',
        expect.objectContaining({
          timestamp: expect.any(Number)
        })
      );
    });

    it('should use descriptive action labels', async () => {
      const data = {
        className: 'Accessible Class',
        classId: 'accessible-101'
      };

      await service.sendEnrollmentNotification('spot_available', data);

      const call = mockServiceWorkerRegistration.showNotification.mock.calls[0];
      const options = call[1];

      expect(options.actions[0].title).toBe('Enroll Now');
      expect(options.actions[1].title).toBe('View Details');
    });

    it('should provide clear notification content', async () => {
      const data = {
        className: 'Clear Communication 101',
        classId: 'comm-101'
      };

      await service.sendEnrollmentNotification('enrollment_approved', data);

      expect(mockServiceWorkerRegistration.showNotification).toHaveBeenCalledWith(
        'Enrollment Approved! 🎉',
        expect.objectContaining({
          body: "You've been enrolled in Clear Communication 101"
        })
      );
    });
  });
});