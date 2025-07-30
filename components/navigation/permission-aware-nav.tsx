/**
 * Permission-Aware Navigation Components
 * Provides navigation components that respect user permissions and roles
 */

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShowIfPermission, ShowIfAnyPermission, RoleBasedContent } from '@/components/ui/role-visibility';
import { ResourceContext } from '@/lib/services/permission-checker';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  permission?: string;
  permissions?: Array<{ permission: string; context?: ResourceContext }>;
  roles?: string[];
  context?: ResourceContext;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  children?: NavItem[];
}

interface PermissionAwareNavProps {
  userId?: string;
  items: NavItem[];
  className?: string;
  itemClassName?: string;
  activeClassName?: string;
  orientation?: 'horizontal' | 'vertical';
}

/**
 * Main navigation component that respects permissions
 */
export function PermissionAwareNav({
  userId,
  items,
  className = '',
  itemClassName = '',
  activeClassName = 'text-foreground',
  orientation = 'horizontal'
}: PermissionAwareNavProps) {
  const pathname = usePathname();

  const renderNavItem = (item: NavItem, index: number) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
    
    const linkContent = (
      <Link
        href={item.href}
        className={cn(
          'transition-colors hover:text-foreground',
          isActive ? activeClassName : 'text-muted-foreground',
          itemClassName
        )}
      >
        <span className="flex items-center gap-2">
          {item.icon}
          {item.label}
          {item.badge}
        </span>
      </Link>
    );

    // If item has specific permission requirement
    if (item.permission) {
      return (
        <ShowIfPermission
          key={index}
          userId={userId}
          permission={item.permission}
          context={item.context}
        >
          {linkContent}
        </ShowIfPermission>
      );
    }

    // If item has multiple permission requirements (any)
    if (item.permissions) {
      return (
        <ShowIfAnyPermission
          key={index}
          userId={userId}
          permissions={item.permissions}
        >
          {linkContent}
        </ShowIfPermission>
      );
    }

    // If item has role requirements
    if (item.roles) {
      return (
        <RoleBasedContent
          key={index}
          userId={userId}
          roleContent={Object.fromEntries(
            item.roles.map(role => [role, linkContent])
          )}
        />
      );
    }

    // Default: show to everyone
    return <div key={index}>{linkContent}</div>;
  };

  const navClass = cn(
    'flex gap-6',
    orientation === 'vertical' ? 'flex-col' : 'flex-row items-center',
    className
  );

  return (
    <nav className={navClass}>
      {items.map(renderNavItem)}
    </nav>
  );
}

/**
 * Sidebar navigation with hierarchical structure
 */
interface SidebarNavProps {
  userId?: string;
  items: NavItem[];
  className?: string;
}

export function SidebarNav({ userId, items, className = '' }: SidebarNavProps) {
  const pathname = usePathname();

  const renderNavItem = (item: NavItem, level: number = 0) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
    const hasChildren = item.children && item.children.length > 0;
    
    const itemContent = (
      <div className={`pl-${level * 4}`}>
        <Link
          href={item.href}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all hover:text-primary',
            isActive ? 'bg-muted text-primary' : 'text-muted-foreground'
          )}
        >
          {item.icon}
          {item.label}
          {item.badge}
        </Link>
        {hasChildren && (
          <div className="ml-4 mt-1">
            {item.children!.map((child, index) => renderNavItem(child, level + 1))}
          </div>
        )}
      </div>
    );

    // Apply permission/role checks
    if (item.permission) {
      return (
        <ShowIfPermission
          userId={userId}
          permission={item.permission}
          context={item.context}
        >
          {itemContent}
        </ShowIfPermission>
      );
    }

    if (item.permissions) {
      return (
        <ShowIfAnyPermission
          userId={userId}
          permissions={item.permissions}
        >
          {itemContent}
        </ShowIfAnyPermission>
      );
    }

    if (item.roles) {
      return (
        <RoleBasedContent
          userId={userId}
          roleContent={Object.fromEntries(
            item.roles.map(role => [role, itemContent])
          )}
        />
      );
    }

    return itemContent;
  };

  return (
    <nav className={cn('space-y-1', className)}>
      {items.map((item, index) => (
        <div key={index}>
          {renderNavItem(item)}
        </div>
      ))}
    </nav>
  );
}

/**
 * Breadcrumb navigation with permission checks
 */
interface BreadcrumbItem {
  href?: string;
  label: string;
  permission?: string;
  context?: ResourceContext;
}

interface PermissionBreadcrumbProps {
  userId?: string;
  items: BreadcrumbItem[];
  separator?: React.ReactNode;
  className?: string;
}

export function PermissionBreadcrumb({
  userId,
  items,
  separator = '/',
  className = ''
}: PermissionBreadcrumbProps) {
  const renderBreadcrumbItem = (item: BreadcrumbItem, index: number, isLast: boolean) => {
    const content = item.href ? (
      <Link href={item.href} className="hover:text-primary">
        {item.label}
      </Link>
    ) : (
      <span className={isLast ? 'text-foreground' : 'text-muted-foreground'}>
        {item.label}
      </span>
    );

    const itemWithSeparator = (
      <span className="flex items-center gap-2">
        {content}
        {!isLast && <span className="text-muted-foreground">{separator}</span>}
      </span>
    );

    if (item.permission) {
      return (
        <ShowIfPermission
          key={index}
          userId={userId}
          permission={item.permission}
          context={item.context}
        >
          {itemWithSeparator}
        </ShowIfPermission>
      );
    }

    return <span key={index}>{itemWithSeparator}</span>;
  };

  return (
    <nav className={cn('flex items-center space-x-1 text-sm text-muted-foreground', className)}>
      {items.map((item, index) => 
        renderBreadcrumbItem(item, index, index === items.length - 1)
      )}
    </nav>
  );
}

/**
 * Tab navigation with permission-based visibility
 */
interface TabItem {
  id: string;
  label: string;
  permission?: string;
  permissions?: Array<{ permission: string; context?: ResourceContext }>;
  roles?: string[];
  context?: ResourceContext;
  content?: React.ReactNode;
  badge?: React.ReactNode;
}

interface PermissionTabsProps {
  userId?: string;
  items: TabItem[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
}

export function PermissionTabs({
  userId,
  items,
  activeTab,
  onTabChange,
  className = ''
}: PermissionTabsProps) {
  const [internalActiveTab, setInternalActiveTab] = React.useState(
    activeTab || items[0]?.id || ''
  );

  const currentActiveTab = activeTab || internalActiveTab;

  const handleTabClick = (tabId: string) => {
    if (onTabChange) {
      onTabChange(tabId);
    } else {
      setInternalActiveTab(tabId);
    }
  };

  const renderTab = (item: TabItem) => {
    const isActive = currentActiveTab === item.id;
    
    const tabButton = (
      <button
        onClick={() => handleTabClick(item.id)}
        className={cn(
          'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
          'border-b-2 border-transparent hover:text-primary',
          isActive ? 'border-primary text-primary' : 'text-muted-foreground'
        )}
      >
        {item.label}
        {item.badge}
      </button>
    );

    if (item.permission) {
      return (
        <ShowIfPermission
          userId={userId}
          permission={item.permission}
          context={item.context}
        >
          {tabButton}
        </ShowIfPermission>
      );
    }

    if (item.permissions) {
      return (
        <ShowIfAnyPermission
          userId={userId}
          permissions={item.permissions}
        >
          {tabButton}
        </ShowIfAnyPermission>
      );
    }

    if (item.roles) {
      return (
        <RoleBasedContent
          userId={userId}
          roleContent={Object.fromEntries(
            item.roles.map(role => [role, tabButton])
          )}
        />
      );
    }

    return tabButton;
  };

  const activeTabItem = items.find(item => item.id === currentActiveTab);

  return (
    <div className={className}>
      <div className="flex border-b">
        {items.map((item) => (
          <div key={item.id}>
            {renderTab(item)}
          </div>
        ))}
      </div>
      {activeTabItem?.content && (
        <div className="mt-4">
          {activeTabItem.content}
        </div>
      )}
    </div>
  );
}

/**
 * Context menu with permission-based items
 */
interface ContextMenuItem {
  id: string;
  label: string;
  onClick: () => void;
  permission?: string;
  context?: ResourceContext;
  icon?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}

interface PermissionContextMenuProps {
  userId?: string;
  items: ContextMenuItem[];
  trigger: React.ReactNode;
  className?: string;
}

export function PermissionContextMenu({
  userId,
  items,
  trigger,
  className = ''
}: PermissionContextMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const renderMenuItem = (item: ContextMenuItem) => {
    const menuItem = (
      <button
        onClick={() => {
          item.onClick();
          setIsOpen(false);
        }}
        disabled={item.disabled}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
          'hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed',
          item.destructive ? 'text-destructive hover:bg-destructive/10' : ''
        )}
      >
        {item.icon}
        {item.label}
      </button>
    );

    if (item.permission) {
      return (
        <ShowIfPermission
          userId={userId}
          permission={item.permission}
          context={item.context}
        >
          {menuItem}
        </ShowIfPermission>
      );
    }

    return menuItem;
  };

  return (
    <div className={cn('relative', className)}>
      <div onClick={() => setIsOpen(!isOpen)}>
        {trigger}
      </div>
      {isOpen && (
        <div className="absolute right-0 z-50 mt-1 w-48 rounded-md border bg-popover p-1 shadow-lg">
          {items.map((item) => (
            <div key={item.id}>
              {renderMenuItem(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}