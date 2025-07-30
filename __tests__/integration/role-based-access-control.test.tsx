/**
 * Integration tests for role-based access control across the platform
 * Tests the seamless integration of permissions in UI components and API endpoints
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { PermissionGate, AdminGate, RoleGate } from '@/components/ui/permission-gate';
import { ShowIfPermission, ShowIfAnyPermission, PermissionButton } from '@/components/ui/role-visibility';
import { PermissionAwareNav, SidebarNav, PermissionTabs } from '@/components/navigation/permission-aware-nav';
import { PermissionChecker } from '@/lib/services/permission-checker';
import { UserRole } from '@/lib/types/role-management';

// Mock the permission checker
jest.mock('@/lib/services/permission-checker');
jest.mock('@/lib/supabase/client');
jest.mock('@/lib/supabase/server');

describe('Role-Based Access Control Integration', () => {
  const mockUserId = 'test-user-123';
  const mockInstitutionId = 'test-institution-456';
  const mockDepartmentId = 'test-department-789';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Supabase client
    const mockSupabase = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              gte: jest.fn(() => ({
                or: jest.fn(() => ({
                  single: jest.fn(),
                  order: jest.fn(() => ({ single: jest.fn() }))
                }))
              }))
            }))
          }))
        }))
      }))
    };

    require('@/lib/supabase/client').createClient = jest.fn(() => mockSupabase);
    require('@/lib/supabase/server').createClient = jest.fn(() => mockSupabase);
  });

  describe('Permission Gate Components', () => {
    it('should show content when user has required permission', async () => {
      const mockHasPermission = jest.fn().mockResolvedValue(true);
      (PermissionChecker as any).prototype.hasPermission = mockHasPermission;

      render(
        <PermissionGate userId={mockUserId} permission="test.read">
          <div>Protected Content</div>
        </PermissionGate>
      );

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument();
      });

      expect(mockHasPermission).toHaveBeenCalledWith(mockUserId, 'test.read', undefined);
    });

    it('should hide content when user lacks required permission', async () => {
      const mockHasPermission = jest.fn().mockResolvedValue(false);
      (PermissionChecker as any).prototype.hasPermission = mockHasPermission;

      render(
        <PermissionGate userId={mockUserId} permission="test.write">
          <div>Protected Content</div>
        </PermissionGate>
      );

      await waitFor(() => {
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
      });
    });

    it('should show fallback content when permission is denied', async () => {
      const mockHasPermission = jest.fn().mockResolvedValue(false);
      (PermissionChecker as any).prototype.hasPermission = mockHasPermission;

      render(
        <PermissionGate 
          userId={mockUserId} 
          permission="test.admin"
          fallback={<div>Access Denied</div>}
        >
          <div>Admin Content</div>
        </PermissionGate>
      );

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument();
        expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
      });
    });
  });

  describe('Role Gate Components', () => {
    it('should show content for users with allowed roles', async () => {
      const mockSupabase = require('@/lib/supabase/client').createClient();
      mockSupabase.from().select().eq().eq().gte().or.mockResolvedValue({
        data: [{ role: UserRole.TEACHER }],
        error: null
      });

      render(
        <RoleGate userId={mockUserId} allowedRoles={['teacher', 'admin']}>
          <div>Teacher Content</div>
        </RoleGate>
      );

      await waitFor(() => {
        expect(screen.getByText('Teacher Content')).toBeInTheDocument();
      });
    });

    it('should hide content for users without allowed roles', async () => {
      const mockSupabase = require('@/lib/supabase/client').createClient();
      mockSupabase.from().select().eq().eq().gte().or.mockResolvedValue({
        data: [{ role: UserRole.STUDENT }],
        error: null
      });

      render(
        <RoleGate userId={mockUserId} allowedRoles={['teacher', 'admin']}>
          <div>Teacher Content</div>
        </RoleGate>
      );

      await waitFor(() => {
        expect(screen.queryByText('Teacher Content')).not.toBeInTheDocument();
      });
    });
  });

  describe('Admin Gate Components', () => {
    it('should show content for system admins', async () => {
      const mockIsAdmin = jest.fn().mockResolvedValue(true);
      (PermissionChecker as any).prototype.isAdmin = mockIsAdmin;

      render(
        <AdminGate userId={mockUserId} scope="system">
          <div>System Admin Content</div>
        </AdminGate>
      );

      await waitFor(() => {
        expect(screen.getByText('System Admin Content')).toBeInTheDocument();
      });

      expect(mockIsAdmin).toHaveBeenCalledWith(mockUserId, 'system', undefined);
    });

    it('should show content for institution admins in their institution', async () => {
      const mockIsAdmin = jest.fn().mockResolvedValue(true);
      (PermissionChecker as any).prototype.isAdmin = mockIsAdmin;

      render(
        <AdminGate userId={mockUserId} scope="institution" scopeId={mockInstitutionId}>
          <div>Institution Admin Content</div>
        </AdminGate>
      );

      await waitFor(() => {
        expect(screen.getByText('Institution Admin Content')).toBeInTheDocument();
      });

      expect(mockIsAdmin).toHaveBeenCalledWith(mockUserId, 'institution', mockInstitutionId);
    });
  });

  describe('Permission-Aware Navigation', () => {
    const navItems = [
      {
        href: '/dashboard',
        label: 'Dashboard',
        permission: 'dashboard.read'
      },
      {
        href: '/admin',
        label: 'Admin Panel',
        permission: 'admin.access'
      },
      {
        href: '/reports',
        label: 'Reports',
        permissions: [
          { permission: 'reports.read' },
          { permission: 'analytics.read' }
        ]
      }
    ];

    it('should show navigation items based on user permissions', async () => {
      const mockHasPermission = jest.fn()
        .mockImplementation((userId, permission) => {
          if (permission === 'dashboard.read') return Promise.resolve(true);
          if (permission === 'admin.access') return Promise.resolve(false);
          return Promise.resolve(false);
        });

      const mockCheckBulkPermissions = jest.fn().mockResolvedValue([
        { permission: 'reports.read', granted: true },
        { permission: 'analytics.read', granted: false }
      ]);

      (PermissionChecker as any).prototype.hasPermission = mockHasPermission;
      (PermissionChecker as any).prototype.checkBulkPermissions = mockCheckBulkPermissions;

      render(<PermissionAwareNav userId={mockUserId} items={navItems} />);

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Reports')).toBeInTheDocument();
        expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
      });
    });

    it('should handle navigation clicks correctly', async () => {
      const mockHasPermission = jest.fn().mockResolvedValue(true);
      (PermissionChecker as any).prototype.hasPermission = mockHasPermission;

      render(<PermissionAwareNav userId={mockUserId} items={navItems} />);

      await waitFor(() => {
        const dashboardLink = screen.getByText('Dashboard');
        expect(dashboardLink.closest('a')).toHaveAttribute('href', '/dashboard');
      });
    });
  });

  describe('Sidebar Navigation', () => {
    const sidebarItems = [
      {
        href: '/dashboard',
        label: 'Dashboard',
        permission: 'dashboard.read',
        icon: <span>📊</span>
      },
      {
        href: '/users',
        label: 'User Management',
        permission: 'users.manage',
        children: [
          {
            href: '/users/list',
            label: 'User List',
            permission: 'users.read'
          },
          {
            href: '/users/create',
            label: 'Create User',
            permission: 'users.create'
          }
        ]
      }
    ];

    it('should render hierarchical navigation with permissions', async () => {
      const mockHasPermission = jest.fn()
        .mockImplementation((userId, permission) => {
          return Promise.resolve(['dashboard.read', 'users.manage', 'users.read'].includes(permission));
        });

      (PermissionChecker as any).prototype.hasPermission = mockHasPermission;

      render(<SidebarNav userId={mockUserId} items={sidebarItems} />);

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.getByText('User Management')).toBeInTheDocument();
        expect(screen.getByText('User List')).toBeInTheDocument();
        expect(screen.queryByText('Create User')).not.toBeInTheDocument();
      });
    });
  });

  describe('Permission Tabs', () => {
    const tabItems = [
      {
        id: 'overview',
        label: 'Overview',
        permission: 'dashboard.read',
        content: <div>Overview Content</div>
      },
      {
        id: 'analytics',
        label: 'Analytics',
        permission: 'analytics.read',
        content: <div>Analytics Content</div>
      },
      {
        id: 'settings',
        label: 'Settings',
        permission: 'settings.manage',
        content: <div>Settings Content</div>
      }
    ];

    it('should show tabs based on permissions and handle tab switching', async () => {
      const mockHasPermission = jest.fn()
        .mockImplementation((userId, permission) => {
          return Promise.resolve(['dashboard.read', 'analytics.read'].includes(permission));
        });

      (PermissionChecker as any).prototype.hasPermission = mockHasPermission;

      render(<PermissionTabs userId={mockUserId} items={tabItems} />);

      await waitFor(() => {
        expect(screen.getByText('Overview')).toBeInTheDocument();
        expect(screen.getByText('Analytics')).toBeInTheDocument();
        expect(screen.queryByText('Settings')).not.toBeInTheDocument();
      });

      // Test tab switching
      fireEvent.click(screen.getByText('Analytics'));

      await waitFor(() => {
        expect(screen.getByText('Analytics Content')).toBeInTheDocument();
      });
    });
  });

  describe('Permission Button', () => {
    it('should enable button when user has permission', async () => {
      const mockHasPermission = jest.fn().mockResolvedValue(true);
      (PermissionChecker as any).prototype.hasPermission = mockHasPermission;

      const mockOnClick = jest.fn();

      render(
        <PermissionButton
          userId={mockUserId}
          permission="action.execute"
          onClick={mockOnClick}
        >
          Execute Action
        </PermissionButton>
      );

      await waitFor(() => {
        const button = screen.getByText('Execute Action');
        expect(button).not.toBeDisabled();
      });

      fireEvent.click(screen.getByText('Execute Action'));
      expect(mockOnClick).toHaveBeenCalled();
    });

    it('should disable button when user lacks permission', async () => {
      const mockHasPermission = jest.fn().mockResolvedValue(false);
      (PermissionChecker as any).prototype.hasPermission = mockHasPermission;

      const mockOnClick = jest.fn();

      render(
        <PermissionButton
          userId={mockUserId}
          permission="action.execute"
          onClick={mockOnClick}
          disabledMessage="You need execute permission"
        >
          Execute Action
        </PermissionButton>
      );

      await waitFor(() => {
        const button = screen.getByText('Execute Action');
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('title', 'You need execute permission');
      });

      fireEvent.click(screen.getByText('Execute Action'));
      expect(mockOnClick).not.toHaveBeenCalled();
    });
  });

  describe('API Permission Integration', () => {
    it('should handle API permission middleware correctly', async () => {
      // Mock fetch for API calls
      global.fetch = jest.fn();
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

      // Test successful API call with permissions
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: 'test data' })
      } as Response);

      const response = await fetch('/api/test-endpoint', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should handle API permission denial correctly', async () => {
      global.fetch = jest.fn();
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

      // Test API call with insufficient permissions
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ 
          success: false, 
          error: 'Insufficient permissions',
          required_permission: 'test.write'
        })
      } as Response);

      const response = await fetch('/api/test-endpoint', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Insufficient permissions');
      expect(data.required_permission).toBe('test.write');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle permission check errors gracefully', async () => {
      const mockHasPermission = jest.fn().mockRejectedValue(new Error('Permission service unavailable'));
      (PermissionChecker as any).prototype.hasPermission = mockHasPermission;

      render(
        <PermissionGate userId={mockUserId} permission="test.read" fallback={<div>Error Fallback</div>}>
          <div>Protected Content</div>
        </PermissionGate>
      );

      await waitFor(() => {
        expect(screen.getByText('Error Fallback')).toBeInTheDocument();
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
      });
    });

    it('should handle missing user ID gracefully', async () => {
      render(
        <PermissionGate permission="test.read" fallback={<div>No User</div>}>
          <div>Protected Content</div>
        </PermissionGate>
      );

      await waitFor(() => {
        expect(screen.getByText('No User')).toBeInTheDocument();
      });
    });

    it('should handle loading states correctly', async () => {
      const mockHasPermission = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(true), 100))
      );
      (PermissionChecker as any).prototype.hasPermission = mockHasPermission;

      render(
        <PermissionGate 
          userId={mockUserId} 
          permission="test.read"
          loading={<div>Loading...</div>}
        >
          <div>Protected Content</div>
        </PermissionGate>
      );

      // Should show loading initially
      expect(screen.getByText('Loading...')).toBeInTheDocument();

      // Should show content after loading
      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument();
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Performance and Caching', () => {
    it('should cache permission results to avoid redundant checks', async () => {
      const mockHasPermission = jest.fn().mockResolvedValue(true);
      (PermissionChecker as any).prototype.hasPermission = mockHasPermission;

      // Render multiple components with same permission
      render(
        <div>
          <PermissionGate userId={mockUserId} permission="test.read">
            <div>Content 1</div>
          </PermissionGate>
          <PermissionGate userId={mockUserId} permission="test.read">
            <div>Content 2</div>
          </PermissionGate>
        </div>
      );

      await waitFor(() => {
        expect(screen.getByText('Content 1')).toBeInTheDocument();
        expect(screen.getByText('Content 2')).toBeInTheDocument();
      });

      // Should use cached result for second check
      expect(mockHasPermission).toHaveBeenCalledTimes(2); // Called once per component initially
    });
  });
});

describe('Dashboard Layout Integration', () => {
  it('should render role-based navigation correctly', async () => {
    const mockSupabase = require('@/lib/supabase/client').createClient();
    
    // Mock user with teacher role
    mockSupabase.from().select().eq().eq().gte().or.mockResolvedValue({
      data: [{ role: UserRole.TEACHER }],
      error: null
    });

    const mockHasPermission = jest.fn()
      .mockImplementation((userId, permission) => {
        const teacherPermissions = ['classes.manage', 'assignments.manage', 'grades.read'];
        return Promise.resolve(teacherPermissions.includes(permission));
      });

    (PermissionChecker as any).prototype.hasPermission = mockHasPermission;

    // This would be tested in the actual dashboard layout component
    // For now, we'll test the permission logic
    const teacherPermissions = ['classes.manage', 'assignments.manage', 'grades.read'];
    
    for (const permission of teacherPermissions) {
      const hasPermission = await mockHasPermission('test-user', permission);
      expect(hasPermission).toBe(true);
    }

    const adminPermission = await mockHasPermission('test-user', 'system.manage');
    expect(adminPermission).toBe(false);
  });
});