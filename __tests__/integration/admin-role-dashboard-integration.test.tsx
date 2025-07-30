/**
 * Integration tests for Admin Role Dashboard
 * Tests the complete workflow of role management admin functionality
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { jest } from '@jest/globals'
import { AdminRoleDashboard } from '@/components/role-management/admin-role-dashboard'
import { UserRole, RoleRequestStatus } from '@/lib/types/role-management'

// Mock the session provider
const mockSupabase = {
  auth: {
    getUser: jest.fn()
  },
  from: jest.fn()
}

jest.mock('@/components/session-provider', () => ({
  useSupabase: () => mockSupabase
}))

// Mock fetch globally
global.fetch = jest.fn()

const mockPendingRequests = [
  {
    id: 'req-1',
    user_id: 'user-1',
    requested_role: UserRole.TEACHER,
    current_role: UserRole.STUDENT,
    justification: 'I need teacher access to create classes',
    status: RoleRequestStatus.PENDING,
    requested_at: '2024-01-15T10:00:00Z',
    expires_at: '2024-01-22T10:00:00Z',
    institution_id: 'inst-1',
    users: {
      id: 'user-1',
      email: 'john.doe@university.edu',
      full_name: 'John Doe',
      created_at: '2024-01-01T00:00:00Z'
    },
    canApprove: true,
    daysUntilExpiration: 5,
    isUrgent: false
  },
  {
    id: 'req-2',
    user_id: 'user-2',
    requested_role: UserRole.DEPARTMENT_ADMIN,
    current_role: UserRole.TEACHER,
    justification: 'Promoted to department head position',
    status: RoleRequestStatus.PENDING,
    requested_at: '2024-01-16T14:30:00Z',
    expires_at: '2024-01-18T14:30:00Z',
    institution_id: 'inst-1',
    users: {
      id: 'user-2',
      email: 'jane.smith@university.edu',
      full_name: 'Jane Smith',
      created_at: '2024-01-02T00:00:00Z'
    },
    canApprove: true,
    daysUntilExpiration: 1,
    isUrgent: true
  }
]

const mockStatistics = {
  totalUsers: 150,
  totalRequests: 25,
  pendingRequests: 8,
  approvedToday: 3,
  deniedToday: 1,
  urgentRequests: 2,
  roleDistribution: {
    [UserRole.STUDENT]: 100,
    [UserRole.TEACHER]: 35,
    [UserRole.DEPARTMENT_ADMIN]: 10,
    [UserRole.INSTITUTION_ADMIN]: 4,
    [UserRole.SYSTEM_ADMIN]: 1
  },
  requestsByRole: {
    [UserRole.TEACHER]: 15,
    [UserRole.DEPARTMENT_ADMIN]: 8,
    [UserRole.INSTITUTION_ADMIN]: 2
  },
  averageProcessingTime: 48
}

describe('AdminRoleDashboard Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock successful API responses
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/roles/requests/pending')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              requests: mockPendingRequests,
              summary: {
                totalPending: mockPendingRequests.length,
                urgent: mockPendingRequests.filter(r => r.isUrgent).length
              }
            }
          })
        })
      }
      
      if (url.includes('/api/roles/statistics')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: mockStatistics
          })
        })
      }
      
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })
    })
  })

  describe('Dashboard Loading and Display', () => {
    it('should load and display pending requests correctly', async () => {
      render(<AdminRoleDashboard />)

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.queryByText('Loading admin dashboard...')).not.toBeInTheDocument()
      })

      // Check that requests are displayed
      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('Jane Smith')).toBeInTheDocument()
      expect(screen.getByText('john.doe@university.edu')).toBeInTheDocument()
      expect(screen.getByText('jane.smith@university.edu')).toBeInTheDocument()
    })

    it('should display statistics cards correctly', async () => {
      render(<AdminRoleDashboard />)

      await waitFor(() => {
        expect(screen.getByText('8')).toBeInTheDocument() // Pending requests
        expect(screen.getByText('2')).toBeInTheDocument() // Urgent requests
        expect(screen.getByText('3')).toBeInTheDocument() // Approved today
        expect(screen.getByText('150')).toBeInTheDocument() // Total users
      })
    })

    it('should show urgent badge for urgent requests', async () => {
      render(<AdminRoleDashboard />)

      await waitFor(() => {
        const urgentBadges = screen.getAllByText('Urgent')
        expect(urgentBadges).toHaveLength(1)
      })
    })
  })

  describe('Request Filtering', () => {
    it('should filter requests by search term', async () => {
      render(<AdminRoleDashboard />)

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
        expect(screen.getByText('Jane Smith')).toBeInTheDocument()
      })

      // Search for John
      const searchInput = screen.getByPlaceholderText('Search by name or email...')
      fireEvent.change(searchInput, { target: { value: 'John' } })

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
        expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument()
      })
    })

    it('should filter requests by role', async () => {
      render(<AdminRoleDashboard />)

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
        expect(screen.getByText('Jane Smith')).toBeInTheDocument()
      })

      // Filter by Teacher role
      const roleFilter = screen.getByDisplayValue('All Roles')
      fireEvent.click(roleFilter)
      
      const teacherOption = screen.getByText('Teacher')
      fireEvent.click(teacherOption)

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
        expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument()
      })
    })

    it('should filter urgent requests only', async () => {
      render(<AdminRoleDashboard />)

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
        expect(screen.getByText('Jane Smith')).toBeInTheDocument()
      })

      // Enable urgent only filter
      const urgentCheckbox = screen.getByLabelText('Urgent only')
      fireEvent.click(urgentCheckbox)

      await waitFor(() => {
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument()
        expect(screen.getByText('Jane Smith')).toBeInTheDocument()
      })
    })
  })

  describe('Request Selection', () => {
    it('should allow selecting individual requests', async () => {
      render(<AdminRoleDashboard />)

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      // Find and click the checkbox for John Doe's request
      const checkboxes = screen.getAllByRole('checkbox')
      const johnCheckbox = checkboxes.find(cb => 
        cb.closest('.border')?.textContent?.includes('John Doe')
      )
      
      expect(johnCheckbox).toBeDefined()
      fireEvent.click(johnCheckbox!)

      // Should show bulk actions
      await waitFor(() => {
        expect(screen.getByText('1 selected')).toBeInTheDocument()
        expect(screen.getByText('Approve Selected')).toBeInTheDocument()
        expect(screen.getByText('Deny Selected')).toBeInTheDocument()
      })
    })

    it('should allow selecting all requests', async () => {
      render(<AdminRoleDashboard />)

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      // Click select all
      const selectAllCheckbox = screen.getByLabelText('Select All')
      fireEvent.click(selectAllCheckbox)

      await waitFor(() => {
        expect(screen.getByText('2 selected')).toBeInTheDocument()
      })
    })
  })

  describe('Request Approval', () => {
    it('should approve individual request', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockImplementation((url: string, options?: any) => {
        if (url.includes('/api/roles/requests/req-1/approve') && options?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true })
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { requests: mockPendingRequests.filter(r => r.id !== 'req-1') }
          })
        })
      })

      render(<AdminRoleDashboard />)

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      // Find and click approve button for John's request
      const approveButtons = screen.getAllByText('Approve')
      const johnApproveButton = approveButtons.find(btn => 
        btn.closest('.border')?.textContent?.includes('John Doe')
      )
      
      expect(johnApproveButton).toBeDefined()
      fireEvent.click(johnApproveButton!)

      // Verify API call was made
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/roles/requests/req-1/approve',
          expect.objectContaining({
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: 'Approved by admin' })
          })
        )
      })
    })

    it('should handle bulk approval', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockImplementation((url: string, options?: any) => {
        if (url.includes('/approve') && options?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true })
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { requests: [] }
          })
        })
      })

      render(<AdminRoleDashboard />)

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      // Select all requests
      const selectAllCheckbox = screen.getByLabelText('Select All')
      fireEvent.click(selectAllCheckbox)

      await waitFor(() => {
        expect(screen.getByText('2 selected')).toBeInTheDocument()
      })

      // Click bulk approve
      const bulkApproveButton = screen.getByText('Approve Selected')
      fireEvent.click(bulkApproveButton)

      // Verify API calls were made for both requests
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/roles/requests/req-1/approve',
          expect.objectContaining({ method: 'PUT' })
        )
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/roles/requests/req-2/approve',
          expect.objectContaining({ method: 'PUT' })
        )
      })
    })
  })

  describe('Request Denial', () => {
    it('should deny individual request', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockImplementation((url: string, options?: any) => {
        if (url.includes('/api/roles/requests/req-1/deny') && options?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true })
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { requests: mockPendingRequests.filter(r => r.id !== 'req-1') }
          })
        })
      })

      render(<AdminRoleDashboard />)

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      // Find and click deny button for John's request
      const denyButtons = screen.getAllByText('Deny')
      const johnDenyButton = denyButtons.find(btn => 
        btn.closest('.border')?.textContent?.includes('John Doe')
      )
      
      expect(johnDenyButton).toBeDefined()
      fireEvent.click(johnDenyButton!)

      // Verify API call was made
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/roles/requests/req-1/deny',
          expect.objectContaining({
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Denied by admin' })
          })
        )
      })
    })

    it('should handle bulk denial', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockImplementation((url: string, options?: any) => {
        if (url.includes('/deny') && options?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true })
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { requests: [] }
          })
        })
      })

      render(<AdminRoleDashboard />)

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      // Select all requests
      const selectAllCheckbox = screen.getByLabelText('Select All')
      fireEvent.click(selectAllCheckbox)

      await waitFor(() => {
        expect(screen.getByText('2 selected')).toBeInTheDocument()
      })

      // Click bulk deny
      const bulkDenyButton = screen.getByText('Deny Selected')
      fireEvent.click(bulkDenyButton)

      // Verify API calls were made for both requests
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/roles/requests/req-1/deny',
          expect.objectContaining({ method: 'PUT' })
        )
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/roles/requests/req-2/deny',
          expect.objectContaining({ method: 'PUT' })
        )
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockImplementation(() => {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Internal server error' })
        })
      })

      render(<AdminRoleDashboard />)

      await waitFor(() => {
        expect(screen.getByText(/Failed to load dashboard data/)).toBeInTheDocument()
      })
    })

    it('should handle approval failures', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockImplementation((url: string, options?: any) => {
        if (url.includes('/approve') && options?.method === 'PUT') {
          return Promise.resolve({
            ok: false,
            status: 403,
            json: () => Promise.resolve({ error: 'Insufficient permissions' })
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { requests: mockPendingRequests }
          })
        })
      })

      render(<AdminRoleDashboard />)

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      // Try to approve a request
      const approveButtons = screen.getAllByText('Approve')
      fireEvent.click(approveButtons[0])

      await waitFor(() => {
        expect(screen.getByText(/Failed to approve request/)).toBeInTheDocument()
      })
    })
  })

  describe('Tab Navigation', () => {
    it('should switch between tabs correctly', async () => {
      render(<AdminRoleDashboard />)

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      // Switch to Statistics tab
      const statisticsTab = screen.getByText('Statistics')
      fireEvent.click(statisticsTab)

      // Should show statistics content (mocked components)
      await waitFor(() => {
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument()
      })

      // Switch to User Management tab
      const usersTab = screen.getByText('User Management')
      fireEvent.click(usersTab)

      // Should show user management content
      await waitFor(() => {
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument()
      })

      // Switch back to Pending Requests
      const requestsTab = screen.getByText('Pending Requests')
      fireEvent.click(requestsTab)

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })
    })
  })

  describe('Refresh Functionality', () => {
    it('should refresh data when refresh button is clicked', async () => {
      render(<AdminRoleDashboard />)

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      // Clear previous fetch calls
      jest.clearAllMocks()

      // Click refresh button
      const refreshButton = screen.getByText('Refresh')
      fireEvent.click(refreshButton)

      // Verify API calls were made again
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/roles/requests/pending')
        expect(global.fetch).toHaveBeenCalledWith('/api/roles/statistics')
      })
    })
  })
})