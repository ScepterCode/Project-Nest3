import React from 'react';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';

export default function Logo() {
  return (
    <Link href="/" className="flex items-center space-x-2">
      <BookOpen className="h-8 w-8 text-blue-600" />
      <span className="text-xl font-bold text-gray-900">ProjectNest</span>
    </Link>
  );
}
