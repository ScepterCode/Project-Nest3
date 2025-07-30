const { POST: startOnboarding } = require('../../../app/api/onboarding/start/route');
const { PUT: updateOnboarding } = require('../../../app/api/onboarding/update/route');
const { GET: getOnboardingStatus } = require('../../../app/api/onboarding/status/route');
const { POST: completeOnboarding } = require('../../../app/api/onboarding/complete/route');

// Mock NextRequest
class MockNextRequest {
  constructor(url, options = {}) {
    this.url = url;
    this.method = options.method || 'GET';
    this.body = options.body;
  }

  async json() {
    return JSON.parse(this.body || '{}');
  }
}

describe('Onboarding API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('API Validation', () => {
    it('should validate request body in update endpoint', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/onboarding/update', {
        method: 'PUT',
        body: JSON.stringify({ currentStep: -1 })
      });

      const response = await updateOnboarding(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Current step must be an integer between 0 and 10');
    });

    it('should validate onboarding data in update endpoint', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/onboarding/update', {
        method: 'PUT',
        body: JSON.stringify({
          data: {
            role: 'invalid_role',
            classCode: '123'
          }
        })
      });

      const response = await updateOnboarding(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid onboarding data');
      expect(data.details).toContain('Invalid role specified');
      expect(data.details).toContain('Class code must be at least 6 characters');
    });

    it('should handle invalid JSON in update endpoint', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/onboarding/update', {
        method: 'PUT',
        body: 'invalid json'
      });

      // Mock json() to throw an error
      request.json = jest.fn().mockRejectedValue(new Error('Invalid JSON'));

      const response = await updateOnboarding(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Internal server error');
    });
  });

  describe('API Error Handling', () => {
    it('should handle authentication errors gracefully', async () => {
      // This test verifies that our error handling structure is in place
      // The actual authentication will be mocked by the Supabase mock
      const request = new MockNextRequest('http://localhost:3000/api/onboarding/start', {
        method: 'POST'
      });

      const response = await startOnboarding(request);
      const data = await response.json();

      // Should return 401 due to mocked unauthenticated user
      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('User not found');
    });
  });
});