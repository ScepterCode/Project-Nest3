/**
 * Push Notification Service for enrollment alerts
 * Handles web push notifications for mobile devices
 */

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: any;
  actions?: NotificationAction[];
  requireInteraction?: boolean;
}

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

export class PushNotificationService {
  private static instance: PushNotificationService;
  private registration: ServiceWorkerRegistration | null = null;
  private subscription: PushSubscription | null = null;

  private constructor() {}

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  /**
   * Initialize push notifications
   */
  async initialize(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported');
      return false;
    }

    try {
      // Register service worker
      this.registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', this.registration);

      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;

      return true;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return false;
    }
  }

  /**
   * Request notification permission
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      throw new Error('Notifications not supported');
    }

    const permission = await Notification.requestPermission();
    return permission;
  }

  /**
   * Check if notifications are supported and permitted
   */
  isSupported(): boolean {
    return (
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    );
  }

  /**
   * Check current notification permission
   */
  getPermission(): NotificationPermission {
    return Notification.permission;
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe(userId: string): Promise<PushSubscription | null> {
    if (!this.registration) {
      throw new Error('Service Worker not registered');
    }

    if (this.getPermission() !== 'granted') {
      const permission = await this.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }
    }

    try {
      // Get VAPID public key from environment or API
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 
        await this.getVapidPublicKey();

      if (!vapidPublicKey) {
        throw new Error('VAPID public key not available');
      }

      // Subscribe to push notifications
      this.subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey)
      });

      // Send subscription to server
      await this.sendSubscriptionToServer(userId, this.subscription);

      return this.subscription;
    } catch (error) {
      console.error('Push subscription failed:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe(userId: string): Promise<boolean> {
    if (!this.subscription) {
      return true;
    }

    try {
      // Unsubscribe from push manager
      const success = await this.subscription.unsubscribe();
      
      if (success) {
        // Remove subscription from server
        await this.removeSubscriptionFromServer(userId);
        this.subscription = null;
      }

      return success;
    } catch (error) {
      console.error('Push unsubscription failed:', error);
      return false;
    }
  }

  /**
   * Show local notification (for testing or immediate notifications)
   */
  async showNotification(payload: PushNotificationPayload): Promise<void> {
    if (!this.registration) {
      throw new Error('Service Worker not registered');
    }

    if (this.getPermission() !== 'granted') {
      throw new Error('Notification permission not granted');
    }

    await this.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/icons/notification-icon.png',
      badge: payload.badge || '/icons/notification-badge.png',
      tag: payload.tag,
      data: payload.data,
      actions: payload.actions,
      requireInteraction: payload.requireInteraction || false,
      vibrate: [200, 100, 200], // Mobile vibration pattern
      timestamp: Date.now()
    });
  }

  /**
   * Send enrollment-specific notifications
   */
  async sendEnrollmentNotification(type: EnrollmentNotificationType, data: any): Promise<void> {
    const payload = this.createEnrollmentNotificationPayload(type, data);
    await this.showNotification(payload);
  }

  /**
   * Create notification payload for enrollment events
   */
  private createEnrollmentNotificationPayload(
    type: EnrollmentNotificationType, 
    data: any
  ): PushNotificationPayload {
    switch (type) {
      case 'enrollment_approved':
        return {
          title: 'Enrollment Approved! 🎉',
          body: `You've been enrolled in ${data.className}`,
          tag: 'enrollment-approved',
          data: { classId: data.classId, type },
          actions: [
            { action: 'view', title: 'View Class' },
            { action: 'dismiss', title: 'Dismiss' }
          ],
          requireInteraction: true
        };

      case 'enrollment_denied':
        return {
          title: 'Enrollment Request Denied',
          body: `Your request for ${data.className} was not approved`,
          tag: 'enrollment-denied',
          data: { classId: data.classId, type },
          actions: [
            { action: 'view', title: 'View Details' },
            { action: 'dismiss', title: 'Dismiss' }
          ]
        };

      case 'waitlist_advanced':
        return {
          title: 'Waitlist Update 📈',
          body: `You're now #${data.position} in line for ${data.className}`,
          tag: 'waitlist-advanced',
          data: { classId: data.classId, position: data.position, type },
          actions: [
            { action: 'view', title: 'View Status' },
            { action: 'dismiss', title: 'Dismiss' }
          ]
        };

      case 'spot_available':
        return {
          title: 'Spot Available! ⚡',
          body: `A spot opened in ${data.className}. Enroll now!`,
          tag: 'spot-available',
          data: { classId: data.classId, type },
          actions: [
            { action: 'enroll', title: 'Enroll Now' },
            { action: 'view', title: 'View Details' }
          ],
          requireInteraction: true
        };

      case 'deadline_reminder':
        return {
          title: 'Deadline Reminder ⏰',
          body: `${data.deadlineType} deadline for ${data.className} is ${data.timeRemaining}`,
          tag: 'deadline-reminder',
          data: { classId: data.classId, deadlineType: data.deadlineType, type },
          actions: [
            { action: 'view', title: 'View Class' },
            { action: 'dismiss', title: 'Dismiss' }
          ]
        };

      case 'enrollment_period_open':
        return {
          title: 'Enrollment Open! 📚',
          body: `Enrollment is now open for ${data.term || 'new classes'}`,
          tag: 'enrollment-open',
          data: { term: data.term, type },
          actions: [
            { action: 'browse', title: 'Browse Classes' },
            { action: 'dismiss', title: 'Dismiss' }
          ]
        };

      default:
        return {
          title: 'Enrollment Update',
          body: 'You have a new enrollment notification',
          tag: 'enrollment-general',
          data: { type }
        };
    }
  }

  /**
   * Get VAPID public key from server
   */
  private async getVapidPublicKey(): Promise<string> {
    try {
      const response = await fetch('/api/notifications/vapid-key');
      const data = await response.json();
      return data.publicKey;
    } catch (error) {
      console.error('Failed to get VAPID key:', error);
      throw error;
    }
  }

  /**
   * Send subscription to server
   */
  private async sendSubscriptionToServer(userId: string, subscription: PushSubscription): Promise<void> {
    try {
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          subscription: subscription.toJSON()
        })
      });
    } catch (error) {
      console.error('Failed to send subscription to server:', error);
      throw error;
    }
  }

  /**
   * Remove subscription from server
   */
  private async removeSubscriptionFromServer(userId: string): Promise<void> {
    try {
      await fetch('/api/notifications/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId })
      });
    } catch (error) {
      console.error('Failed to remove subscription from server:', error);
      throw error;
    }
  }

  /**
   * Convert VAPID key to Uint8Array
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

export type EnrollmentNotificationType = 
  | 'enrollment_approved'
  | 'enrollment_denied'
  | 'waitlist_advanced'
  | 'spot_available'
  | 'deadline_reminder'
  | 'enrollment_period_open';

// Singleton instance
export const pushNotificationService = PushNotificationService.getInstance();