/**
 * Department Role Management Interface Tests
 * 
 * Tests for the department admin interface for managing department users,
 * role assignments, and department boundary validation.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DepartmentRoleManagementInterface } from '@/components/role-management/department-role-management-interface';
import { UserRole, RoleStatus } from '@/lib/types/role-management';

// Mock fetch globally
global.fetch = jest.fn();

const mockUsers = [
  {
    id: 'user1',
    name: 'John Doe',
    email: 'john@example.com',
    role: UserRole.TEACHER,
    status: RoleStatus.ACTIVE,
    assignedAt: new Date('2024-01-01'),
    assignedBy: 'admin',
    lastActivity: new Date('2024-01-15')
  },
  {
    id: 'user2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    role: UserRole.STUDENT,
    status: RoleStatus.ACTIVE,
    assignedAt: new Date('2024-01-02'),
    assignedBy: 'admin',
    lastActivity: new Date('2024-01-14')
  },
  {
    id: 'user3',
    name: 'Bob Johnson',
    email: 'bob@example.com',
    role: UserRole.DEPARTMENT_ADMIN,
    status: RoleStatus.ACTIVE,
    assignedAt: new Date('2024-01-03'),
    assignedBy: 'system',
    lastActivity: new Date('2024-01-16')
  }
];

const mockRestrictions = {
  allowedRoles: [UserRole.STUDENT, UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN],
  maxUsersPerRole: {
    [UserRole.STUDENT]: 1000,
    [UserRole.TEACHER]: 50,
    [UserRole.DEPARTMENT_ADMIN]: 5,
    [UserRole.INSTITUTION_ADMIN]: 0,
    [UserRole.SYSTEM_ADMIN]: 0
  },
  requiresInstitutionApproval: [UserRole.DEPARTMENT_ADMIN],
  canManageRoles: [UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN, UserRole.SYSTEM_ADMIN],
  currentCounts: {
    [UserRole.STUDENT]: 1,
    [UserRole.TEACHER]: 1,
    [UserRole.DEPARTMENT_ADMIN]: 1,
    [UserRole.INSTITUTION_ADMIN]: 0,
    [UserRole.SYSTEM_ADMIN]: 0
  }
};

describe('DepartmentRoleManagementInterface', () => {
  const defaultProps = {
    departmentId: 'dept-123',
    departmentName: 'Computer Science',
    currentUserRole: UserRole.DEPARTMENT_ADMIN
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful API responses
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/users')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: { users: mockUsers }
          })
        });
      }
      
      if (url.includes('/role-restrictions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: mockRestrictions
          })
        });
      }
      
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });
    });
  });

  it('should render department role management interface', async () => {
    render(<DepartmentRoleManagementInterface {...defaultProps} />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('Role Management')).toBeInTheDocument();
    });

    expect(screen.getByText('Computer Science Department')).toBeInTheDocument();
    expect(screen.getByText('Assign Role')).toBeInTheDocument();
  });

  it('should display department users in table', async () => {
    render(<DepartmentRoleManagementInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('should display role restrictions overview', async () => {
    render(<DepartmentRoleManagementInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Department Role Limits')).toBeInTheDocument();
    });

    expect(screen.getByText('Student')).toBeInTheDocument();
    expect(screen.getByText('Teacher')).toBeInTheDocument();
    expect(screen.getByText('Department Admin')).toBeInTheDocument();
    expect(screen.getByText('1 / 1000')).toBeInTheDocument(); // Student count
    expect(screen.getByText('1 / 50')).toBeInTheDocument(); // Teacher count
    expect(screen.getByText('1 / 5')).toBeInTheDocument(); // Department Admin count
  });

  it('should filter users by search term', async () => {
    render(<DepartmentRoleManagementInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search users...');
    fireEvent.change(searchInput, { target: { value: 'john' } });

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob Johnson')).not.toBeInTheDocument();
  });

  it('should filter users by role', async () => {
    render(<DepartmentRoleManagementInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Find and click the role filter dropdown
    const roleFilter = screen.getByDisplayValue('All Roles');
    fireEvent.click(roleFilter);

    // Select Teacher role
    const teacherOption = screen.getByText('Teacher');
    fireEvent.click(teacherOption);

    // Should only show teachers
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob Johnson')).not.toBeInTheDocument();
  });

  it('should open assign role dialog', async () => {
    render(<DepartmentRoleManagementInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Assign Role')).toBeInTheDocument();
    });

    const assignButton = screen.getByText('Assign Role');
    fireEvent.click(assignButton);

    expect(screen.getByText('Assign Department Role')).toBeInTheDocument();
    expect(screen.getByText('Assign a role to a user within your department')).toBeInTheDocument();
  });

  it('should handle role assignment submission', async () => {
    render(<DepartmentRoleManagementInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Assign Role')).toBeInTheDocument();
    });

    // Open assign dialog
    const assignButton = screen.getByText('Assign Role');
    fireEvent.click(assignButton);

    // Fill in the form
    const userInput = screen.getByPlaceholderText('Search for user by name or email...');
    fireEvent.change(userInput, { target: { value: 'new-user-id' } });

    const justificationInput = screen.getByPlaceholderText('Provide a reason for this role assignment...');
    fireEvent.change(justificationInput, { target: { value: 'Promoting to teacher' } });

    // Submit the form
    const submitButton = screen.getByRole('button', { name: 'Assign Role' });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/departments/dept-123/roles/assign',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'new-user-id',
            role: UserRole.STUDENT, // Default role
            justification: 'Promoting to teacher'
          })
        })
      );
    });
  });

  it('should open remove role dialog', async () => {
    render(<DepartmentRoleManagementInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Find the remove button for John Doe (first user minus button)
    const removeButtons = screen.getAllByRole('button');
    const removeButton = removeButtons.find(button => {
      const icon = button.querySelector('svg');
      return icon && icon.classList.contains('lucide-user-minus');
    });

    if (removeButton) {
      fireEvent.click(removeButton);
      expect(screen.getByText('Remove Role')).toBeInTheDocument();
    }
  });

  it('should handle role removal submission', async () => {
    render(<DepartmentRoleManagementInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Find and click remove button
    const removeButtons = screen.getAllByRole('button');
    const removeButton = removeButtons.find(button => {
      const icon = button.querySelector('svg');
      return icon && icon.classList.contains('lucide-user-minus');
    });

    if (removeButton) {
      fireEvent.click(removeButton);

      // Fill in removal reason
      const reasonInput = screen.getByPlaceholderText('Provide a reason for removing this role...');
      fireEvent.change(reasonInput, { target: { value: 'No longer teaching' } });

      // Submit removal
      const confirmButton = screen.getByRole('button', { name: 'Remove Role' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/departments/dept-123/roles/remove',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: 'user1',
              role: UserRole.TEACHER,
              reason: 'No longer teaching'
            })
          })
        );
      });
    }
  });

  it('should display role badges with correct variants', async () => {
    render(<DepartmentRoleManagementInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Teacher')).toBeInTheDocument();
    });

    // Check that role badges are displayed
    expect(screen.getByText('Teacher')).toBeInTheDocument();
    expect(screen.getByText('Student')).toBeInTheDocument();
    expect(screen.getByText('Department Admin')).toBeInTheDocument();
  });

  it('should show availability status for roles', async () => {
    render(<DepartmentRoleManagementInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Department Role Limits')).toBeInTheDocument();
    });

    // Should show "Available" for roles under limit
    const availableBadges = screen.getAllByText('Available');
    expect(availableBadges.length).toBeGreaterThan(0);
  });

  it('should handle API errors gracefully', async () => {
    // Mock API error
    (global.fetch as jest.Mock).mockImplementation(() => 
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'API Error' })
      })
    );

    render(<DepartmentRoleManagementInterface {...defaultProps} />);

    // Should still render the interface even with API errors
    expect(screen.getByText('Role Management')).toBeInTheDocument();
    expect(screen.getByText('Computer Science Department')).toBeInTheDocument();
  });

  it('should refresh data when refresh button is clicked', async () => {
    render(<DepartmentRoleManagementInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    // Should make new API calls
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(4); // Initial 2 calls + 2 refresh calls
    });
  });

  it('should display user count in header', async () => {
    render(<DepartmentRoleManagementInterface {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Department Users (3)')).toBeInTheDocument();
    });
  });

  it('should show loading state initially', () => {
    render(<DepartmentRoleManagementInterface {...defaultProps} />);

    expect(screen.getByText('Loading department role management...')).toBeInTheDocument();
  });
});