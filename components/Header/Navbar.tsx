import React from 'react';
import Logo from './Logo';

type NavProps = {
  /** Role menu links: their own row under the header, so they never crowd it. */
  children1: React.ReactNode;
  /** Help, notifications, role and sign-out, on the right of the header. */
  children2: React.ReactNode;
};
export default function Navbar({ children1, children2 }: NavProps) {
  return (
    <header className="sticky top-0 z-50 border-b bg-card">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between gap-4">
          <Logo />
          <div className="flex min-w-0 items-center">{children2}</div>
        </div>
      </div>
      {children1 && (
        <div className="hidden border-t md:block">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {children1}
          </div>
        </div>
      )}
    </header>
  );
}
