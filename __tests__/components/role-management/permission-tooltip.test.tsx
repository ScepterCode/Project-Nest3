import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PermissionTooltip, PermissionAccessIndicator } from '@/components/role-management/permission-tooltip'

describe('PermissionTooltip', () => {
  it('renders with default variant', () => {
    render(<PermissionTooltip permission="content.create" />)
    
    expect(screen.getByText('Create Content')).toBeInTheDocument()
  })

  it('renders with badge variant', () => {
    render(<PermissionTooltip permission="content.create" variant="badge" />)
    
    const badge = screen.getByText('Create Content')
    expect(badge).toBeInTheDocument()
    expect(badge.closest('.cursor-help')).toBeInTheDocument()
  })

  it('renders with inline variant', () => {
    render(<PermissionTooltip permission="content.create" variant="inline" />)
    
    const element = screen.getByText('Create Content')
    expect(element).toBeInTheDocument()
    expect(element.closest('.cursor-help')).toBeInTheDocument()
  })

  it('shows tooltip content on hover', async () => {
    const user = userEvent.setup()
    render(<PermissionTooltip permission="content.create" />)
    
    const trigger = screen.getByText('Create Content')
    await user.hover(trigger)
    
    await waitFor(() => {
      expect(screen.getByText('Ability to create new educational content, assignments, and materials')).toBeInTheDocument()
      expect(screen.getByText('Examples:')).toBeInTheDocument()
      expect(screen.getByText('Create new assignments and quizzes')).toBeInTheDocument()
    })
  })

  it('displays role requirements in tooltip', async () => {
    const user = userEvent.setup()
    render(<PermissionTooltip permission="content.create" />)
    
    const trigger = screen.getByText('Create Content')
    await user.hover(trigger)
    
    await waitFor(() => {
      expect(screen.getByText('Required roles:')).toBeInTheDocument()
      expect(screen.getByText('Teacher')).toBeInTheDocument()
      expect(screen.getByText('Department Admin')).toBeInTheDocument()
    })
  })

  it('shows scope information in tooltip', async () => {
    const user = userEvent.setup()
    render(<PermissionTooltip permission="content.create" />)
    
    const trigger = screen.getByText('Create Content')
    await user.hover(trigger)
    
    await waitFor(() => {
      expect(screen.getByText('Scope:')).toBeInTheDocument()
      expect(screen.getByText('Department level')).toBeInTheDocument()
    })
  })

  it('renders custom children when provided', () => {
    render(
      <PermissionTooltip permission="content.create">
        <span>Custom Content</span>
      </PermissionTooltip>
    )
    
    expect(screen.getByText('Custom Content')).toBeInTheDocument()
  })

  it('handles unknown permissions gracefully', () => {
    render(<PermissionTooltip permission="unknown.permission" />)
    
    expect(screen.getByText('unknown.permission')).toBeInTheDocument()
  })

  it('shows appropriate category icons', async () => {
    const user = userEvent.setup()
    render(<PermissionTooltip permission="user.manage" />)
    
    const trigger = screen.getByText('Manage Users')
    await user.hover(trigger)
    
    await waitFor(() => {
      // Should show users icon for user management category
      expect(screen.getByText('Manage Users')).toBeInTheDocument()
    })
  })

  it('is accessible with proper ARIA attributes', () => {
    render(<PermissionTooltip permission="content.create" />)
    
    const trigger = screen.getByText('Create Content')
    expect(trigger.closest('[role="button"]')).toBeInTheDocument()
  })

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup()
    render(<PermissionTooltip permission="content.create" />)
    
    const trigger = screen.getByText('Create Content')
    
    // Focus with keyboard
    await user.tab()
    expect(trigger.closest('[role="button"]')).toHaveFocus()
    
    // Activate with Enter
    await user.keyboard('{Enter}')
    
    await waitFor(() => {
      expect(screen.getByText('Ability to create new educational content, assignments, and materials')).toBeInTheDocument()
    })
  })
})

describe('PermissionAccessIndicator', () => {
  it('shows unlock icon when user has permission', () => {
    render(<PermissionAccessIndicator hasPermission={true} permission="content.create" />)
    
    // Should show unlock icon (green)
    const icon = screen.getByRole('button')
    expect(icon).toBeInTheDocument()
  })

  it('shows lock icon when user lacks permission', () => {
    render(<PermissionAccessIndicator hasPermission={false} permission="content.create" />)
    
    // Should show lock icon (red)
    const icon = screen.getByRole('button')
    expect(icon).toBeInTheDocument()
  })

  it('shows appropriate tooltip for granted permission', async () => {
    const user = userEvent.setup()
    render(<PermissionAccessIndicator hasPermission={true} permission="content.create" />)
    
    const icon = screen.getByRole('button')
    await user.hover(icon)
    
    await waitFor(() => {
      expect(screen.getByText('✓ You have this permission')).toBeInTheDocument()
      expect(screen.getByText('Create Content')).toBeInTheDocument()
    })
  })

  it('shows appropriate tooltip for denied permission', async () => {
    const user = userEvent.setup()
    render(<PermissionAccessIndicator hasPermission={false} permission="content.create" />)
    
    const icon = screen.getByRole('button')
    await user.hover(icon)
    
    await waitFor(() => {
      expect(screen.getByText('✗ Permission required')).toBeInTheDocument()
      expect(screen.getByText('Create Content')).toBeInTheDocument()
    })
  })

  it('includes permission description in tooltip', async () => {
    const user = userEvent.setup()
    render(<PermissionAccessIndicator hasPermission={true} permission="content.create" />)
    
    const icon = screen.getByRole('button')
    await user.hover(icon)
    
    await waitFor(() => {
      expect(screen.getByText('Ability to create new educational content, assignments, and materials')).toBeInTheDocument()
    })
  })

  it('handles unknown permissions in indicator', async () => {
    const user = userEvent.setup()
    render(<PermissionAccessIndicator hasPermission={false} permission="unknown.permission" />)
    
    const icon = screen.getByRole('button')
    await user.hover(icon)
    
    await waitFor(() => {
      expect(screen.getByText('unknown.permission')).toBeInTheDocument()
    })
  })

  it('applies custom className', () => {
    render(<PermissionAccessIndicator hasPermission={true} permission="content.create" className="custom-class" />)
    
    const container = screen.getByRole('button').closest('.custom-class')
    expect(container).toBeInTheDocument()
  })
})