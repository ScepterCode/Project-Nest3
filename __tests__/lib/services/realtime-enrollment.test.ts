/**
 * Basic unit tests for real-time enrollment service
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { RealtimeEnrollmentService } from '@/lib/services/realtime-enrollment';
import { createServer } from 'http';

describe('RealtimeEnrollmentService', () => {
  let service: RealtimeEnrollmentService;
  let server: any;

  beforeEach(() => {
    service = new RealtimeEnrollmentService();
    server = createServer();
  });

  afterEach(async () => {
    await service.cleanup();
    if (server) {
      server.close();
    }
  });

  test('should initialize without errors', () => {
    expect(() => {
      service.initialize(server);
    }).not.toThrow();
  });

  test('should return zero connected clients initially', () => {
    service.initialize(server);
    const clientCount = service.getConnectedClientsCount();
    expect(clientCount).toBe(0);
  });

  test('should return empty room info initially', () => {
    service.initialize(server);
    const roomInfo = service.getRoomInfo();
    expect(roomInfo).toEqual({});
  });

  test('should cleanup gracefully', async () => {
    service.initialize(server);
    await expect(service.cleanup()).resolves.not.toThrow();
  });

  test('should get realtime stats for a class', async () => {
    service.initialize(server);
    const classId = 'test-class-123';
    
    // This would normally require database setup, so we expect it to handle gracefully
    const stats = await service.getRealtimeStats(classId);
    expect(stats).toBeDefined();
    expect(stats.enrollment).toBeDefined();
    expect(stats.waitlist).toBeDefined();
    expect(stats.activity).toBeDefined();
  });
});