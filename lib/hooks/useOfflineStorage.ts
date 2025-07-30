import { useState, useEffect } from 'react';

/**
 * Hook for managing offline storage using IndexedDB
 */
export function useOfflineStorage() {
  const [isOnline, setIsOnline] = useState(true);
  const [db, setDb] = useState<IDBDatabase | null>(null);

  useEffect(() => {
    // Initialize IndexedDB
    initializeDB();
    
    // Set up online/offline listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const initializeDB = async () => {
    try {
      const database = await openDB();
      setDb(database);
    } catch (error) {
      console.error('Failed to initialize IndexedDB:', error);
    }
  };

  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('EnrollmentApp', 2);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Classes store
        if (!db.objectStoreNames.contains('classes')) {
          const classStore = db.createObjectStore('classes', { keyPath: 'id' });
          classStore.createIndex('departmentId', 'departmentId', { unique: false });
          classStore.createIndex('teacherId', 'teacherId', { unique: false });
          classStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
        }
        
        // Search results cache
        if (!db.objectStoreNames.contains('searchCache')) {
          const searchStore = db.createObjectStore('searchCache', { keyPath: 'query' });
          searchStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        // Pending enrollment requests
        if (!db.objectStoreNames.contains('pendingRequests')) {
          db.createObjectStore('pendingRequests', { keyPath: 'id' });
        }
        
        // User preferences
        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'key' });
        }
        
        // Enrollment data
        if (!db.objectStoreNames.contains('enrollments')) {
          const enrollmentStore = db.createObjectStore('enrollments', { keyPath: 'id' });
          enrollmentStore.createIndex('studentId', 'studentId', { unique: false });
          enrollmentStore.createIndex('classId', 'classId', { unique: false });
        }
      };
    });
  };

  // Generic storage methods
  const storeData = async (storeName: string, data: any): Promise<void> => {
    if (!db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  };

  const getData = async (storeName: string, key: string): Promise<any> => {
    if (!db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  const getAllData = async (storeName: string): Promise<any[]> => {
    if (!db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  const deleteData = async (storeName: string, key: string): Promise<void> => {
    if (!db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  };

  const clearStore = async (storeName: string): Promise<void> => {
    if (!db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  };

  // Class-specific methods
  const cacheClasses = async (classes: any[]): Promise<void> => {
    if (!db) return;
    
    const transaction = db.transaction(['classes'], 'readwrite');
    const store = transaction.objectStore('classes');
    
    for (const classData of classes) {
      const classWithTimestamp = {
        ...classData,
        lastUpdated: Date.now()
      };
      store.put(classWithTimestamp);
    }
  };

  const getCachedClasses = async (maxAge = 24 * 60 * 60 * 1000): Promise<any[]> => {
    if (!db) return [];
    
    const classes = await getAllData('classes');
    const now = Date.now();
    
    return classes.filter(cls => (now - cls.lastUpdated) < maxAge);
  };

  const cacheSearchResults = async (query: string, results: any): Promise<void> => {
    const cacheEntry = {
      query: JSON.stringify(query),
      results,
      timestamp: Date.now()
    };
    
    await storeData('searchCache', cacheEntry);
  };

  const getCachedSearchResults = async (query: string, maxAge = 10 * 60 * 1000): Promise<any | null> => {
    try {
      const cacheEntry = await getData('searchCache', JSON.stringify(query));
      
      if (cacheEntry && (Date.now() - cacheEntry.timestamp) < maxAge) {
        return cacheEntry.results;
      }
      
      return null;
    } catch {
      return null;
    }
  };

  const storePendingEnrollmentRequest = async (request: any): Promise<void> => {
    const requestWithId = {
      ...request,
      id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };
    
    await storeData('pendingRequests', requestWithId);
    
    // Register for background sync if available
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('enrollment-request');
      } catch (error) {
        console.error('Background sync registration failed:', error);
      }
    }
  };

  const getPendingEnrollmentRequests = async (): Promise<any[]> => {
    return await getAllData('pendingRequests');
  };

  const removePendingEnrollmentRequest = async (id: string): Promise<void> => {
    await deleteData('pendingRequests', id);
  };

  const storeUserPreferences = async (preferences: any): Promise<void> => {
    await storeData('preferences', { key: 'userPreferences', ...preferences });
  };

  const getUserPreferences = async (): Promise<any | null> => {
    try {
      const prefs = await getData('preferences', 'userPreferences');
      return prefs || null;
    } catch {
      return null;
    }
  };

  const cacheEnrollmentData = async (enrollmentData: any): Promise<void> => {
    const dataWithTimestamp = {
      ...enrollmentData,
      lastUpdated: Date.now()
    };
    
    await storeData('enrollments', dataWithTimestamp);
  };

  const getCachedEnrollmentData = async (studentId: string, maxAge = 30 * 60 * 1000): Promise<any | null> => {
    try {
      const enrollments = await getAllData('enrollments');
      const studentEnrollments = enrollments.filter(e => e.studentId === studentId);
      
      if (studentEnrollments.length > 0) {
        const latest = studentEnrollments.reduce((prev, current) => 
          (prev.lastUpdated > current.lastUpdated) ? prev : current
        );
        
        if ((Date.now() - latest.lastUpdated) < maxAge) {
          return latest;
        }
      }
      
      return null;
    } catch {
      return null;
    }
  };

  const cleanupOldData = async (): Promise<void> => {
    if (!db) return;
    
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    const now = Date.now();
    
    // Clean up old search cache
    const searchCache = await getAllData('searchCache');
    for (const entry of searchCache) {
      if ((now - entry.timestamp) > maxAge) {
        await deleteData('searchCache', entry.query);
      }
    }
    
    // Clean up old class data
    const classes = await getAllData('classes');
    for (const cls of classes) {
      if ((now - cls.lastUpdated) > maxAge) {
        await deleteData('classes', cls.id);
      }
    }
  };

  return {
    isOnline,
    db,
    storeData,
    getData,
    getAllData,
    deleteData,
    clearStore,
    cacheClasses,
    getCachedClasses,
    cacheSearchResults,
    getCachedSearchResults,
    storePendingEnrollmentRequest,
    getPendingEnrollmentRequests,
    removePendingEnrollmentRequest,
    storeUserPreferences,
    getUserPreferences,
    cacheEnrollmentData,
    getCachedEnrollmentData,
    cleanupOldData
  };
}