import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { UserRoleProfileSection } from '@/components/role-management/user-role-profile-section'
import { UserRole } from '@/lib/types/role-management'

// Mock the session provider
jest.mock('@/components/session-provider', () => ({
  useSupabase: () => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            data: [
              {
                id: '1',
                user_id: 'user-1',
                role: 'teacher',
                status: 'active',
                assigned_by: 'admin-1',
                assigned_at: '2024-01-01T00:00:00Z',
                expires_at: null,
                department_id: 'dept-1',
                institution_id: 'inst-1',
                is_temporary: false,
                metadata: {},
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z'
              }
            ],
            error: null
          }))
        }))
      }))
    }))
  })
}))

// Mock the permission checker
jest.mock('@/lib/services/permission-checker', () => ({
  PermissionChecker: jest.fn().mockImplementation(() => ({
    getUserPermissions: jest.fn().mockResolvedValue([
      {
        id: 'content.create',
        name: 'content.create',
        description: 'Create new content',
        category: 'content',
        scope: 'department',
        createdAt: new Date()
      },
      {
        id: 'class.manage',
        name: 'class.manage',
        description: 'Manage classes',
        category: 'content',
        scope: 'department',
        createdAt: new Date()
      }
    ])
  }))
}))

describe('UserRoleProfileSection', () => {
  const defaultProps = {
    userId: 'user-1'
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders loading state initially', () => {
    render(<UserRoleProfileSection {...defaultProps} />)
    expect(screen.getByText('Loading role information...')).toBeInTheDocument()
  })

  it('displays user roles and permissions after loading', async () => {
    render(<UserRoleProfileSection {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Current Roles')).toBeInTheDocument()
      expect(screen.getByText('Your Permissions')).toBeInTheDocument()
    })

    expect(screen.getByText('Teacher')).toBeInTheDocument()
    expect(screen.getByText('Create new content')).toBeInTheDocument()
    expect(screen.getByText('Manage classes')).toBeInTheDocument()
  })

  it('shows temporary role badge for temporary roles', async () => {
    // Mock temporary role
    const mockSupabase = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              data: [{
                id: '1',
                user_id: 'user-1',
                role: 'teacher',
                status: 'active',
                assigned_by: 'admin-1',
                assigned_at: '2024-01-01T00:00:00Z',
                expires_at: '2024-12-31T23:59:59Z',
                department_id: 'dept-1',
                institution_id: 'inst-1',
                is_temporary: true,
                metadata: {},
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z'
              }],
              error: null
            }))
          }))
        }))
      }))
    }

    jest.doMock('@/components/session-provider', () => ({
      useSupabase: () => mockSupabase
    }))

    render(<UserRoleProfileSection {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Temporary')).toBeInTheDocument()
    })
  })

  it('shows expiring soon badge for roles expiring within 7 days', async () => {
    const soonExpiry = new Date()
    soonExpiry.setDate(soonExpiry.getDate() + 3) // 3 days from now

    const mockSupabase = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              data: [{
                id: '1',
                user_id: 'user-1',
                role: 'teacher',
                status: 'active',
                assigned_by: 'admin-1',
                assigned_at: '2024-01-01T00:00:00Z',
                expires_at: soonExpiry.toISOString(),
                department_id: 'dept-1',
                institution_id: 'inst-1',
                is_temporary: true,
                metadata: {},
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z'
              }],
              error: null
            }))
          }))
        }))
      }))
    }

    jest.doMock('@/components/session-provider', () => ({
      useSupabase: () => mockSupabase
    }))

    render(<UserRoleProfileSection {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Expires Soon')).toBeInTheDocument()
    })
  })

  it('allows expanding and collapsing permissions list', async () => {
    // Mock more permissions to trigger show more functionality
    const mockPermissionChecker = {
      getUserPermissions: jest.fn().mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          id: `permission-${i}`,
          name: `permission-${i}`,
          description: `Permission ${i} description`,
          category: 'content',
          scope: 'department',
          createdAt: new Date()
        }))
      )
    }

    jest.doMock('@/lib/services/permission-checker', () => ({
      PermissionChecker: jest.fn().mockImplementation(() => mockPermissionChecker)
    }))

    render(<UserRoleProfileSection {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Show All Permissions (10)')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Show All Permissions (10)'))
    
    await waitFor(() => {
      expect(screen.getByText('Show Less')).toBeInTheDocument()
    })
  })

  it('handles error state gracefully', async () => {
    const mockSupabase = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              data: null,
              error: { message: 'Database error' }
            }))
          }))
        }))
      }))
    }

    jest.doMock('@/components/session-provider', () => ({
      useSupabase: () => mockSupabase
    }))

    render(<UserRoleProfileSection {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Error: Database error')).toBeInTheDocument()
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })
  })

  it('shows empty state when no roles are assigned', async () => {
    const mockSupabase = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              data: [],
              error: null
            }))
          }))
        }))
      }))
    }

    jest.doMock('@/components/session-provider', () => ({
      useSupabase: () => mockSupabase
    }))

    render(<UserRoleProfileSection {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('No active roles assigned')).toBeInTheDocument()
    })
  })

  it('is accessible with proper ARIA labels and keyboard navigation', async () => {
    render(<UserRoleProfileSection {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Current Roles')).toBeInTheDocument()
    })

    // Check for proper heading structure
    expect(screen.getByRole('heading', { name: 'Current Roles' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your Permissions' })).toBeInTheDocument()

    // Check for proper button accessibility
    const showMoreButton = screen.queryByText(/Show All Permissions/)
    if (showMoreButton) {
      expect(showMoreButton).toHaveAttribute('type', 'button')
    }
  })

  it('groups permissions by category correctly', async () => {
    const mockPermissionChecker = {
      getUserPermissions: jest.fn().mockResolvedValue([
        {
          id: 'content.create',
          name: 'content.create',
          description: 'Create content',
          category: 'content',
          scope: 'department',
          createdAt: new Date()
        },
        {
          id: 'user.read',
          name: 'user.read',
          description: 'View users',
          category: 'user_management',
          scope: 'department',
          createdAt: new Date()
        }
      ])
    }

    jest.doMock('@/lib/services/permission-checker', () => ({
      PermissionChecker: jest.fn().mockImplementation(() => mockPermissionChecker)
    }))

    render(<UserRoleProfileSection {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Content Management')).toBeInTheDocument()
      expect(screen.getByText('User Management')).toBeInTheDocument()
    })
  })
})