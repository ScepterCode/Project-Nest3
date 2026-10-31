'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { PermissionGate } from '@/components/ui/permission-gate';
import { isWithin } from '@/lib/auth/dashboards';

export interface DashboardNavItem {
  permission: string;
  text: string;
  href: string;
  icon: React.ReactNode;
  /** Active only on this exact page (a home page whose children are other items). */
  exact?: boolean;
}

function NavItem({
  item,
  onNavigate,
  stacked = false,
}: {
  item: DashboardNavItem;
  onNavigate?: () => void;
  stacked?: boolean;
}) {
  const pathname = usePathname();
  const active = item.exact
    ? pathname === item.href
    : isWithin(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={() => onNavigate?.()}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 ${
        stacked ? 'px-3 py-3' : 'px-3 py-2'
      } ${
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {item.icon}
      <span>{item.text}</span>
    </Link>
  );
}

/** Role menu: a row of links on wide screens, a drop-down menu otherwise. */
export function DashboardNav({
  userId,
  items,
}: {
  userId: string;
  items: DashboardNavItem[];
}) {
  return (
    <nav aria-label="Main" className="flex flex-wrap items-center gap-1 py-1.5">
      {items.map(item => (
        <PermissionGate
          key={item.href}
          userId={userId}
          permission={item.permission}
        >
          <NavItem item={item} />
        </PermissionGate>
      ))}
    </nav>
  );
}

export function DashboardMobileNav({
  userId,
  items,
}: {
  userId: string;
  items: DashboardNavItem[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  if (items.length === 0) return null;

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="dashboard-mobile-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="rounded-md p-2 text-foreground hover:bg-muted"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <div
          id="dashboard-mobile-menu"
          className="absolute left-0 right-0 top-14 border-b bg-card px-4 py-2 shadow-sm"
        >
          <nav aria-label="Main" className="flex flex-col">
            {items.map(item => (
              <PermissionGate
                key={item.href}
                userId={userId}
                permission={item.permission}
              >
                <NavItem
                  item={item}
                  stacked
                  onNavigate={() => setOpen(false)}
                />
              </PermissionGate>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
