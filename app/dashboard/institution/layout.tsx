'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

// Every school-admin page except the dashboard itself gets a way back to it.
export default function InstitutionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const onDashboard = pathname === '/dashboard/institution';

  return (
    <div className="mx-auto w-full max-w-7xl">
      {!onDashboard && (
        <Link
          href="/dashboard/institution"
          className="mb-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 print:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
      )}
      {children}
    </div>
  );
}
