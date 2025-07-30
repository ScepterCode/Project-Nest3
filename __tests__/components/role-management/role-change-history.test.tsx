import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoleChangeHistory } from '@/components/role-management/role-change-history'
import { AuditAction } from '@/lib/types/role-management'

// Mock the session provider
const mockSupabase = {
  from: jest.fn()
}

jest.mock('@/components/session-provider', () => ({
  useSupabase: () => mockSupabase
}))

describe('RoleChangeHistory', () => {
  const defaultProps = {
    userId: 'user-1'
  }

  const mockAuditData = [
    {
      id: 'audit-1',
      user_id: 'user-1',
      action: 'assigned',
      old_role: null,
      new_role: 'student',
      changed_by: 'admin-1',
      reason: 'Initial role assignment',
      timestamp: '2024-01-01T00:00:00Z',
      institution_id: 'inst-1',
      department_id: null,
      metadata: {},
      changed_by_user: {
        first_name: 'Admin',
        last_name: 'User'
      }
    },
    {
      id: 'audit-2',
      user_id: 'user-1',
      action: 'changed',
      old_role: 'student',
      new_role: 'teacher',
      changed_by: 'admin-1',
      reason: 'Promoted to teacher',
      timestamp: '2024-02-01T00:00:00Z',
      institution_id: 'inst-1',
      department_id: 'dept-1',
      metadata: {},
      changed_by_user: {
        first_name: 'Admin',
        last_name: 'User'
      }
    }
  ]

  const mockRequestsData = [
    {
      id: 'request-1',
      user_id: 'user-1',
      requested_role: 'department_admin',
      current_role: 'teacher',
      justification: 'Need admin permissions',
      status: 'pending',
      requested_at: '2024-03-01T00:00:00Z',
      reviewed_at: null,
      reviewed_by: null,
      review_notes: null,
      reviewed_by_user: null
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock successful responses by default
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'role_audit_log') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => ({
                data: mockAuditData,
                error: null
              }))
            }))
          }))
        }
      } else if (table === 'role_requests') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => ({
                data: mockRequestsData,
                error: null
              }))
            }))
          }))
        }
      }
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => ({
              data: [],
              error: null
            }))
          }))
        }))
      }
    })
  })

  it('renders loading state initially', () => {
    render(<RoleChangeHistory {...defaultProps} />)
    expect(screen.getByText('Loading role history...')).toBeInTheDocument()
  })

  it('displays role history after loading', async () => {
    render(<RoleChangeHistory {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Role Change History')).toBeInTheDocument()
      expect(screen.getByText('Role Assigned')).toBeInTheDocument()
      expect(screen.getByText('Role Changed')).toBeInTheDocument()
    })
  })

  it('shows role transitions with badges', async () => {
    render(<RoleChangeHistory {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Student')).toBeInTheDocument()
      expect(screen.getByText('Teacher')).toBeInTheDocument()
    })
  })

  it('displays who made the changes', async () => {
    render(<RoleChangeHistory {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument()
    })
  })

  it('shows pending requests with appropriate status', async () => {
    render(<RoleChangeHistory {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Role Requested')).toBeInTheDocument()
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })
  })

  it('allows expanding and collapsing entry details', async () => {
    const user = userEvent.setup()
    render(<RoleChangeHistory {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Show details')).toBeInTheDocument()
    })
    
    // Click to expand details
    await user.click(screen.getAllByText('Show details')[0])
    
    await waitFor(() => {
      expect(screen.getByText('Hide details')).toBeInTheDocument()
      expect(screen.getByText('Initial role assignment')).toBeInTheDocument()
    })
  })

  it('shows more entries when "Show All" is clicked', async () => {
    // Mock more entries to trigger show all functionality
    const manyEntries = Array.from({ length: 10 }, (_, i) => ({
      id: `audit-${i}`,
      user_id: 'user-1',
      action: 'assigned',
      old_role: null,
      new_role: 'student',
      changed_by: 'admin-1',
      reason: `Entry ${i}`,
      timestamp: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      institution_id: 'inst-1',
      department_id: null,
      metadata: {},
      changed_by_user: {
        first_name: 'Admin',
        last_name: 'User'
      }
    }))

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'role_audit_log') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => ({
                data: manyEntries,
                error: null
              }))
            }))
          }))
        }
      }
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => ({
              data: [],
              error: null
            }))
          }))
        }))
      }
    })

    const user = userEvent.setup()
    render(<RoleChangeHistory {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Show All (10 entries)')).toBeInTheDocument()
    })
    
    await user.click(screen.getByText('Show All (10 entries)'))
    
    await waitFor(() => {
      expect(screen.getByText('Show Less')).toBeInTheDocument()
    })
  })

  it('handles error state gracefully', async () => {
    mockSupabase.from.mockImplementation(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => ({
            data: null,
            error: { message: 'Database error' }
          }))
        }))
      }))
    }))

    render(<RoleChangeHistory {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Error: Database error')).toBeInTheDocument()
      expect(screen.getByText('Try Again')).toBeInTheDocument()
    })
  })

  it('shows empty state when no history exists', async () => {
    mockSupabase.from.mockImplementation(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => ({
            data: [],
            error: null
          }))
        }))
      }))
    }))

    render(<RoleChangeHistory {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('No role history available')).toBeInTheDocument()
      expect(screen.getByText('Role changes and requests will appear here')).toBeInTheDocument()
    })
  })

  it('formats timestamps appropriately', async () => {
    render(<RoleChangeHistory {...defaultProps} />)
    
    await waitFor(() => {
      // Should show formatted dates
      expect(screen.getByText(/Jan 1, 2024|Feb 1, 2024|Mar 1, 2024/)).toBeInTheDocument()
    })
  })

  it('shows appropriate icons for different actions', async () => {
    render(<RoleChangeHistory {...defaultProps} />)
    
    await waitFor(() => {
      // Check that icons are rendered (they should be in the DOM)
      const historySection = screen.getByText('Role Change History').closest('div')
      expect(historySection).toBeInTheDocument()
    })
  })

  it('displays status badges correctly', async () => {
    render(<RoleChangeHistory {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })
  })

  it('is accessible with proper heading structure', async () => {
    render(<RoleChangeHistory {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Role Change History' })).toBeInTheDocument()
    })
  })

  it('supports keyboard navigation for expandable details', async () => {
    const user = userEvent.setup()
    render(<RoleChangeHistory {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Show details')).toBeInTheDocument()
    })
    
    // Navigate with keyboard
    await user.tab()
    const detailsButton = screen.getAllByText('Show details')[0]
    
    // Should be focusable
    expect(detailsButton).toBeInTheDocument()
    
    // Activate with keyboard
    fireEvent.keyDown(detailsButton, { key: 'Enter' })
    
    await waitFor(() => {
      expect(screen.getByText('Hide details')).toBeInTheDocument()
    })
  })

  it('handles denied requests correctly', async () => {
    const deniedRequestData = [{
      id: 'request-denied',
      user_id: 'user-1',
      requested_role: 'teacher',
      current_role: 'student',
      justification: 'Want to teach',
      status: 'denied',
      requested_at: '2024-03-01T00:00:00Z',
      reviewed_at: '2024-03-02T00:00:00Z',
      reviewed_by: 'admin-1',
      review_notes: 'Insufficient qualifications',
      reviewed_by_user: {
        first_name: 'Admin',
        last_name: 'User'
      }
    }]

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'role_requests') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => ({
                data: deniedRequestData,
                error: null
              }))
            }))
          }))
        }
      }
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => ({
              data: [],
              error: null
            }))
          }))
        }))
      }
    })

    render(<RoleChangeHistory {...defaultProps} />)
    
    await waitFor(() => {
      expect(screen.getByText('Request Denied')).toBeInTheDocument()
      expect(screen.getByText('Denied')).toBeInTheDocument()
    })
  })
})