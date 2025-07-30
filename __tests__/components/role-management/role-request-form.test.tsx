import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoleRequestForm } from '@/components/role-management/role-request-form'
import { UserRole } from '@/lib/types/role-management'

// Mock the session provider
const mockInsert = jest.fn()
const mockSupabase = {
  from: jest.fn(() => ({
    insert: mockInsert
  }))
}

jest.mock('@/components/session-provider', () => ({
  useSupabase: () => mockSupabase
}))

describe('RoleRequestForm', () => {
  const defaultProps = {
    userId: 'user-1',
    institutionId: 'inst-1',
    currentRole: UserRole.STUDENT
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockInsert.mockResolvedValue({ error: null })
  })

  it('renders form with all required fields', () => {
    render(<RoleRequestForm {...defaultProps} />)
    
    expect(screen.getByText('Request Role Change')).toBeInTheDocument()
    expect(screen.getByText('Current Role')).toBeInTheDocument()
    expect(screen.getByText('Student')).toBeInTheDocument()
    expect(screen.getByLabelText(/Requested Role/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Justification/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit Request' })).toBeInTheDocument()
  })

  it('shows role requirements when a role is selected', async () => {
    const user = userEvent.setup()
    render(<RoleRequestForm {...defaultProps} />)
    
    // Open role selector
    await user.click(screen.getByRole('combobox'))
    
    // Select teacher role
    await user.click(screen.getByText('Teacher'))
    
    await waitFor(() => {
      expect(screen.getByText('Requirements for Teacher:')).toBeInTheDocument()
      expect(screen.getByText('Valid institutional email address')).toBeInTheDocument()
      expect(screen.getByText('Email domain verification or manual review')).toBeInTheDocument()
    })
  })

  it('validates required fields before submission', async () => {
    const user = userEvent.setup()
    render(<RoleRequestForm {...defaultProps} />)
    
    // Try to submit without filling required fields
    await user.click(screen.getByRole('button', { name: 'Submit Request' }))
    
    // Button should be disabled
    expect(screen.getByRole('button', { name: 'Submit Request' })).toBeDisabled()
  })

  it('prevents requesting the same role as current role', async () => {
    const user = userEvent.setup()
    render(<RoleRequestForm {...defaultProps} currentRole={UserRole.TEACHER} />)
    
    // Select teacher role (same as current)
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByText('Teacher'))
    
    // Fill justification
    await user.type(screen.getByLabelText(/Justification/), 'Test justification')
    
    // Try to submit
    await user.click(screen.getByRole('button', { name: 'Submit Request' }))
    
    await waitFor(() => {
      expect(screen.getByText('You already have this role')).toBeInTheDocument()
    })
  })

  it('submits form successfully with valid data', async () => {
    const user = userEvent.setup()
    const onSuccess = jest.fn()
    
    render(<RoleRequestForm {...defaultProps} onSuccess={onSuccess} />)
    
    // Select role
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByText('Teacher'))
    
    // Fill justification
    await user.type(
      screen.getByLabelText(/Justification/), 
      'I need teacher permissions to manage my classes'
    )
    
    // Submit form
    await user.click(screen.getByRole('button', { name: 'Submit Request' }))
    
    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith({
        user_id: 'user-1',
        requested_role: 'teacher',
        current_role: 'student',
        justification: 'I need teacher permissions to manage my classes',
        status: 'pending',
        verification_method: 'email_domain',
        institution_id: 'inst-1',
        department_id: undefined,
        expires_at: expect.any(String)
      })
    })
    
    // Should show success message
    expect(screen.getByText('Request Submitted Successfully')).toBeInTheDocument()
  })

  it('handles submission errors gracefully', async () => {
    const user = userEvent.setup()
    mockInsert.mockResolvedValue({ error: { message: 'Database error' } })
    
    render(<RoleRequestForm {...defaultProps} />)
    
    // Fill form
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByText('Teacher'))
    await user.type(screen.getByLabelText(/Justification/), 'Test justification')
    
    // Submit form
    await user.click(screen.getByRole('button', { name: 'Submit Request' }))
    
    await waitFor(() => {
      expect(screen.getByText('Database error')).toBeInTheDocument()
    })
  })

  it('shows loading state during submission', async () => {
    const user = userEvent.setup()
    let resolvePromise: (value: any) => void
    const promise = new Promise(resolve => { resolvePromise = resolve })
    mockInsert.mockReturnValue(promise)
    
    render(<RoleRequestForm {...defaultProps} />)
    
    // Fill form
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByText('Teacher'))
    await user.type(screen.getByLabelText(/Justification/), 'Test justification')
    
    // Submit form
    await user.click(screen.getByRole('button', { name: 'Submit Request' }))
    
    // Should show loading state
    expect(screen.getByText('Submitting...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled()
    
    // Resolve promise
    resolvePromise!({ error: null })
  })

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = jest.fn()
    
    render(<RoleRequestForm {...defaultProps} onCancel={onCancel} />)
    
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    
    expect(onCancel).toHaveBeenCalled()
  })

  it('is accessible with proper form labels and ARIA attributes', () => {
    render(<RoleRequestForm {...defaultProps} />)
    
    // Check form accessibility
    expect(screen.getByLabelText(/Requested Role/)).toBeRequired()
    expect(screen.getByLabelText(/Justification/)).toBeRequired()
    
    // Check heading structure
    expect(screen.getByRole('heading', { name: 'Request Role Change' })).toBeInTheDocument()
    
    // Check alert regions
    expect(screen.getByRole('alert')).toBeInTheDocument() // Info alert
  })

  it('provides helpful placeholder text and descriptions', () => {
    render(<RoleRequestForm {...defaultProps} />)
    
    expect(screen.getByPlaceholderText('Select a role to request')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Please explain why you need this role/)).toBeInTheDocument()
    expect(screen.getByText(/Provide specific details about your responsibilities/)).toBeInTheDocument()
  })

  it('shows different verification methods for different roles', async () => {
    const user = userEvent.setup()
    render(<RoleRequestForm {...defaultProps} />)
    
    // Test teacher role
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByText('Teacher'))
    
    await waitFor(() => {
      expect(screen.getByText('Email domain verification or manual review')).toBeInTheDocument()
    })
    
    // Test admin role
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByText('Institution Admin'))
    
    await waitFor(() => {
      expect(screen.getByText('Admin approval required')).toBeInTheDocument()
    })
  })

  it('includes department ID when provided', async () => {
    const user = userEvent.setup()
    
    render(<RoleRequestForm {...defaultProps} departmentId="dept-1" />)
    
    // Fill and submit form
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByText('Teacher'))
    await user.type(screen.getByLabelText(/Justification/), 'Test justification')
    await user.click(screen.getByRole('button', { name: 'Submit Request' }))
    
    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          department_id: 'dept-1'
        })
      )
    })
  })
})