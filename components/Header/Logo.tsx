import React from 'react';
import Link from 'next/link';
import { NestMark } from '@/components/brand/nest-mark';

export default function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link
      href={href}
      aria-label="ProjectNest home"
      className="flex items-center gap-2 text-foreground"
    >
      <NestMark size={30} />
      <span className="text-xl font-semibold tracking-tight">projectnest</span>
    </Link>
  );
}
