// Service Worker for Push Notifications
const CACHE_NAME = 'enrollment-app-v1';
const urlsToCache = [
  '/',
  '/dashboard',
  '/dashboard/student',
  '/icons/notification-icon.png',
  '/icons/notification-badge.png'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      }
    )
  );
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('Push event received:', event);

  let notificationData = {
    title: 'Enrollment Update',
    body: 'You have a new enrollment notification',
    icon: '/icons/notification-icon.png',
    badge: '/icons/notification-badge.png',
    tag: 'enrollment-notification',
    data: {}
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (error) {
      console.error('Error parsing push data:', error);
      notificationData.body = event.data.text() || notificationData.body;
    }
  }

  const notificationOptions = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    tag: notificationData.tag,
    data: notificationData.data,
    actions: notificationData.actions || [],
    requireInteraction: notificationData.requireInteraction || false,
    vibrate: [200, 100, 200],
    timestamp: Date.now()
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationOptions)
  );
});

// Notification click event - handle user interactions
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);

  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  let url = '/dashboard/student';

  // Handle different actions
  switch (action) {
    case 'view':
      if (data.classId) {
        url = `/dashboard/student/classes/${data.classId}`;
      }
      break;
    case 'enroll':
      if (data.classId) {
        url = `/dashboard/student/classes/join?classId=${data.classId}`;
      }
      break;
    case 'browse':
      url = '/dashboard/student/classes/join';
      break;
    case 'dismiss':
      return; // Don't open any URL
    default:
      // Default click behavior
      if (data.classId) {
        url = `/dashboard/student/classes/${data.classId}`;
      }
      break;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window/tab open with the target URL
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        
        // If no existing window, open a new one
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Background sync for offline enrollment requests
self.addEventListener('sync', (event) => {
  if (event.tag === 'enrollment-request') {
    event.waitUntil(
      // Handle offline enrollment requests when connection is restored
      handleOfflineEnrollmentRequests()
    );
  }
});

async function handleOfflineEnrollmentRequests() {
  try {
    // Get pending enrollment requests from IndexedDB
    const pendingRequests = await getPendingEnrollmentRequests();
    
    for (const request of pendingRequests) {
      try {
        const response = await fetch('/api/enrollments/request', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request.data)
        });

        if (response.ok) {
          // Remove from pending requests
          await removePendingEnrollmentRequest(request.id);
          
          // Show success notification
          await self.registration.showNotification('Enrollment Request Sent', {
            body: `Your enrollment request for ${request.data.className} has been submitted`,
            icon: '/icons/notification-icon.png',
            tag: 'enrollment-sync-success'
          });
        }
      } catch (error) {
        console.error('Failed to sync enrollment request:', error);
      }
    }
  } catch (error) {
    console.error('Error handling offline enrollment requests:', error);
  }
}

// IndexedDB helpers for offline functionality
async function getPendingEnrollmentRequests() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('EnrollmentApp', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['pendingRequests'], 'readonly');
      const store = transaction.objectStore('pendingRequests');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => resolve(getAllRequest.result);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('pendingRequests')) {
        db.createObjectStore('pendingRequests', { keyPath: 'id' });
      }
    };
  });
}

async function removePendingEnrollmentRequest(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('EnrollmentApp', 1);
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['pendingRequests'], 'readwrite');
      const store = transaction.objectStore('pendingRequests');
      const deleteRequest = store.delete(id);
      
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
}