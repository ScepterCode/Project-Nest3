import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  RealtimeEnrollmentEvent,
  RealtimeWaitlistEvent,
  RealtimeConnectionStatus,
  EnrollmentStatus,
  RealtimeEnrollmentStats
} from '@/lib/types/enrollment';

interface UseRealtimeEnrollmentOptions {
  classId?: string;
  studentId?: string;
  teacherId?: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

interface RealtimeEnrollmentState {
  connected: boolean;
  enrollmentCount: number;
  availableSpots: number;
  waitlistCount: number;
  waitlistPosition?: number;
  enrollmentStatus?: EnrollmentStatus;
  lastUpdate?: Date;
  error?: string;
  stats?: RealtimeEnrollmentStats;
}

export function useRealtimeEnrollment(options: UseRealtimeEnrollmentOptions = {}) {
  const {
    classId,
    studentId,
    teacherId,
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectDelay = 1000
  } = options;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>({
    connected: false,
    reconnectAttempts: 0,
    rooms: []
  });

  const [enrollmentState, setEnrollmentState] = useState<RealtimeEnrollmentState>({
    connected: false,
    enrollmentCount: 0,
    availableSpots: 0,
    waitlistCount: 0,
    waitlistPosition: undefined,
    enrollmentStatus: undefined,
    lastUpdate: undefined,
    error: undefined,
    stats: undefined
  });

  const [events, setEvents] = useState<(RealtimeEnrollmentEvent | RealtimeWaitlistEvent)[]>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const reconnectAttemptsRef = useRef<number>(0);

  // Initialize socket connection
  const connect = useCallback(() => {
    if (socket?.connected) return;

    try {
      const newSocket = io(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000', {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        forceNew: true
      });

      // Connection event handlers
      newSocket.on('connect', () => {
        console.log('Real-time enrollment connected');
        setConnectionStatus(prev => ({
          ...prev,
          connected: true,
          lastConnected: new Date(),
          reconnectAttempts: 0
        }));
        setEnrollmentState(prev => ({ ...prev, connected: true, error: undefined }));
        reconnectAttemptsRef.current = 0;

        // Join relevant rooms
        if (classId) {
          newSocket.emit('join-class', classId);
          setConnectionStatus(prev => ({
            ...prev,
            rooms: [...prev.rooms.filter(r => !r.startsWith('class-')), `class-${classId}`]
          }));
        }

        if (studentId) {
          newSocket.emit('join-student', studentId);
          setConnectionStatus(prev => ({
            ...prev,
            rooms: [...prev.rooms.filter(r => !r.startsWith('student-')), `student-${studentId}`]
          }));
        }

        if (teacherId) {
          newSocket.emit('join-teacher', teacherId);
          setConnectionStatus(prev => ({
            ...prev,
            rooms: [...prev.rooms.filter(r => !r.startsWith('teacher-')), `teacher-${teacherId}`]
          }));
        }
      });

      newSocket.on('disconnect', (reason) => {
        console.log('Real-time enrollment disconnected:', reason);
        setConnectionStatus(prev => ({
          ...prev,
          connected: false,
          rooms: []
        }));
        setEnrollmentState(prev => ({ ...prev, connected: false }));

        // Attempt reconnection if not manually disconnected
        if (reason !== 'io client disconnect' && reconnectAttemptsRef.current < reconnectAttempts) {
          const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            setConnectionStatus(prev => ({
              ...prev,
              reconnectAttempts: reconnectAttemptsRef.current
            }));
            connect();
          }, delay);
        }
      });

      newSocket.on('connect_error', (error) => {
        console.error('Real-time enrollment connection error:', error);
        setEnrollmentState(prev => ({
          ...prev,
          error: `Connection error: ${error.message}`
        }));
      });

      // Enrollment event handlers
      newSocket.on('enrollment-count-update', (event: RealtimeEnrollmentEvent) => {
        if (event.classId === classId) {
          setEnrollmentState(prev => ({
            ...prev,
            enrollmentCount: typeof event.data.currentEnrollment === 'number' ? event.data.currentEnrollment : prev.enrollmentCount,
            availableSpots: typeof event.data.availableSpots === 'number' ? event.data.availableSpots : prev.availableSpots,
            waitlistCount: typeof event.data.waitlistCount === 'number' ? event.data.waitlistCount : prev.waitlistCount,
            lastUpdate: event.timestamp
          }));
          setEvents(prev => [event, ...prev.slice(0, 49)]); // Keep last 50 events
        }
      });

      newSocket.on('enrollment-update', (event: RealtimeEnrollmentEvent) => {
        if (event.classId === classId) {
          setEvents(prev => [event, ...prev.slice(0, 49)]);

          // Update enrollment status if it's for the current student
          if (event.studentId === studentId) {
            setEnrollmentState(prev => ({
              ...prev,
              enrollmentStatus: event.data.status,
              lastUpdate: event.timestamp
            }));
          }
        }
      });

      newSocket.on('personal-enrollment-update', (event: RealtimeEnrollmentEvent) => {
        if (event.studentId === studentId) {
          setEnrollmentState(prev => ({
            ...prev,
            enrollmentStatus: event.data.status,
            lastUpdate: event.timestamp
          }));
          setEvents(prev => [event, ...prev.slice(0, 49)]);
        }
      });

      // Waitlist event handlers
      newSocket.on('waitlist-update', (event: RealtimeWaitlistEvent) => {
        if (event.classId === classId) {
          setEnrollmentState(prev => ({
            ...prev,
            waitlistCount: typeof event.data.totalWaitlisted === 'number' ? event.data.totalWaitlisted : prev.waitlistCount,
            lastUpdate: event.timestamp
          }));
          setEvents(prev => [event, ...prev.slice(0, 49)]);
        }
      });

      newSocket.on('waitlist-position-change', (event: RealtimeWaitlistEvent) => {
        if (event.studentId === studentId) {
          setEnrollmentState(prev => ({
            ...prev,
            waitlistPosition: typeof event.data.newPosition === 'number' ? event.data.newPosition : prev.waitlistPosition,
            lastUpdate: event.timestamp
          }));
          setEvents(prev => [event, ...prev.slice(0, 49)]);
        }
      });

      newSocket.on('waitlist-advancement', (event: RealtimeWaitlistEvent) => {
        if (event.studentId === studentId) {
          setEvents(prev => [event, ...prev.slice(0, 49)]);
          // This is a high-priority notification that should trigger UI updates
        }
      });

      newSocket.on('waitlist-joined', (event: RealtimeWaitlistEvent) => {
        if (event.studentId === studentId) {
          setEnrollmentState(prev => ({
            ...prev,
            waitlistPosition: typeof event.data.position === 'number' ? event.data.position : prev.waitlistPosition,
            enrollmentStatus: EnrollmentStatus.WAITLISTED,
            lastUpdate: event.timestamp
          }));
          setEvents(prev => [event, ...prev.slice(0, 49)]);
        }
      });

      newSocket.on('waitlist-removed', (event: RealtimeWaitlistEvent) => {
        if (event.studentId === studentId) {
          setEnrollmentState(prev => ({
            ...prev,
            waitlistPosition: undefined,
            lastUpdate: event.timestamp
          }));
          setEvents(prev => [event, ...prev.slice(0, 49)]);
        }
      });

      // Capacity and system events
      newSocket.on('capacity-update', (event: RealtimeEnrollmentEvent) => {
        if (event.classId === classId) {
          setEvents(prev => [event, ...prev.slice(0, 49)]);
        }
      });

      // Error handling
      newSocket.on('enrollment-error', (error: { message: string; error?: string }) => {
        setEnrollmentState(prev => ({
          ...prev,
          error: error.message
        }));
      });

      newSocket.on('waitlist-response-error', (error: { message: string; error?: string }) => {
        setEnrollmentState(prev => ({
          ...prev,
          error: error.message
        }));
      });

      setSocket(newSocket);
    } catch (error) {
      console.error('Failed to initialize socket connection:', error);
      setEnrollmentState(prev => ({
        ...prev,
        error: `Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`
      }));
    }
  }, [classId, studentId, teacherId, reconnectAttempts, reconnectDelay]);

  // Disconnect socket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (socket) {
      socket.disconnect();
      setSocket(null);
    }

    setConnectionStatus({
      connected: false,
      reconnectAttempts: 0,
      rooms: []
    });
    setEnrollmentState(prev => ({ ...prev, connected: false }));
  }, [socket]);

  // Request enrollment with real-time feedback
  const requestEnrollment = useCallback(async (
    requestStudentId: string,
    requestClassId: string,
    justification?: string
  ): Promise<void> => {
    if (!socket?.connected) {
      throw new Error('Not connected to real-time service');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Enrollment request timeout'));
      }, 30000); // 30 second timeout

      socket.once('enrollment-result', (result) => {
        clearTimeout(timeout);
        if (result.success) {
          resolve();
        } else {
          reject(new Error(result.message || 'Enrollment request failed'));
        }
      });

      socket.once('enrollment-error', (error) => {
        clearTimeout(timeout);
        reject(new Error(error.message || 'Enrollment request failed'));
      });

      socket.emit('request-enrollment', {
        studentId: requestStudentId,
        classId: requestClassId,
        justification
      });
    });
  }, [socket]);

  // Respond to waitlist advancement
  const respondToWaitlist = useCallback(async (
    responseStudentId: string,
    responseClassId: string,
    response: 'accept' | 'decline'
  ): Promise<void> => {
    if (!socket?.connected) {
      throw new Error('Not connected to real-time service');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Waitlist response timeout'));
      }, 10000); // 10 second timeout

      socket.once('waitlist-response-confirmed', (result) => {
        clearTimeout(timeout);
        if (result.success) {
          resolve();
        } else {
          reject(new Error('Waitlist response failed'));
        }
      });

      socket.once('waitlist-response-error', (error) => {
        clearTimeout(timeout);
        reject(new Error(error.message || 'Waitlist response failed'));
      });

      socket.emit('waitlist-response', {
        studentId: responseStudentId,
        classId: responseClassId,
        response
      });
    });
  }, [socket]);

  // Get real-time statistics
  const getRealtimeStats = useCallback(async (statsClassId: string): Promise<RealtimeEnrollmentStats | null> => {
    if (!socket?.connected) {
      return null;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, 5000); // 5 second timeout

      socket.once('realtime-stats', (stats: RealtimeEnrollmentStats) => {
        clearTimeout(timeout);
        setEnrollmentState(prev => ({ ...prev, stats }));
        resolve(stats);
      });

      socket.emit('get-realtime-stats', statsClassId);
    });
  }, [socket]);

  // Clear error
  const clearError = useCallback(() => {
    setEnrollmentState(prev => ({ ...prev, error: undefined }));
  }, []);

  // Clear events
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Update rooms when IDs change
  useEffect(() => {
    if (socket?.connected) {
      if (classId) {
        socket.emit('join-class', classId);
      }
      if (studentId) {
        socket.emit('join-student', studentId);
      }
      if (teacherId) {
        socket.emit('join-teacher', teacherId);
      }
    }
  }, [socket, classId, studentId, teacherId]);

  return {
    // Connection state
    connected: connectionStatus.connected,
    connectionStatus,

    // Enrollment state
    enrollmentState,

    // Events
    events,
    recentEvents: events.slice(0, 10),

    // Actions
    connect,
    disconnect,
    requestEnrollment,
    respondToWaitlist,
    getRealtimeStats,
    clearError,
    clearEvents,

    // Utilities
    isConnecting: socket?.connected === false && socket?.disconnected === false,
    hasError: !!enrollmentState.error,
    lastUpdate: enrollmentState.lastUpdate
  };
}

// Hook for monitoring multiple classes (useful for teachers/admins)
export function useRealtimeEnrollmentMultiple(classIds: string[], teacherId?: string) {
  const [connections, setConnections] = useState<Map<string, RealtimeEnrollmentState>>(new Map());
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (socket?.connected) return;

    const newSocket = io(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000', {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      setConnected(true);

      // Join all class rooms
      classIds.forEach(classId => {
        newSocket.emit('join-class', classId);
      });

      if (teacherId) {
        newSocket.emit('join-teacher', teacherId);
      }
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
    });

    newSocket.on('enrollment-count-update', (event: RealtimeEnrollmentEvent) => {
      if (classIds.includes(event.classId)) {
        setConnections(prev => {
          const newMap = new Map(prev);
          const existing = newMap.get(event.classId) || {
            connected: true,
            enrollmentCount: 0,
            availableSpots: 0,
            waitlistCount: 0
          };

          newMap.set(event.classId, {
            ...existing,
            enrollmentCount: event.data.currentEnrollment || existing.enrollmentCount,
            availableSpots: event.data.availableSpots || existing.availableSpots,
            waitlistCount: event.data.waitlistCount || existing.waitlistCount,
            lastUpdate: event.timestamp
          });

          return newMap;
        });
      }
    });

    setSocket(newSocket);
  }, [classIds, teacherId]);

  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setConnected(false);
  }, [socket]);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    connected,
    connections: Object.fromEntries(connections),
    connect,
    disconnect
  };
}