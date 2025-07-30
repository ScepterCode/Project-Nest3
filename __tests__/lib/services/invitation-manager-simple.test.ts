import { InvitationManager } from '@/lib/services/invitation-manager';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  eq: jest.fn(),
  single: jest.fn(),
  rpc: jest.fn()
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

jest.mock('@/lib/services/notification-service', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    sendNotification: jest.fn(),
    sendEnrollmentConfirmation: jest.fn()
  }))
}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('mock-token-123')
  })
}));

describe('InvitationManager', () => {
  let invitationManager: InvitationManager;

  beforeEach(() => {
    invitationManager = new InvitationManager();
    jest.clearAllMocks();
    
    // Setup mock chains
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.delete.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.single.mockReturnValue(mockSupabase);
  });

  it('should create an invitation manager instance', () => {
    expect(invitationManager).toBeInstanceOf(InvitationManager);
  });

  it('should validate invitation token format', async () => {
    // Mock invalid token response
    mockSupabase.single.mockResolvedValue({
      data: null,
      error: { message: 'No rows returned' }
    });

    const result = await invitationManager.validateInvitation('invalid-token');
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid invitation token');
  });
});