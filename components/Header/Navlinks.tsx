'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavLinks({
  children,
  href,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <Link
      href={href}
      className={`  font-medium  transition-colors ${className} ${href === pathname ? 'text-blue-600' : 'text-gray-700'}`}
    >
      {children}
    </Link>
  );
}
