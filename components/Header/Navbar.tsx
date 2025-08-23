import React from 'react';
import Logo from './Logo';

type NavProps = {
  children1: React.ReactNode;
  children2: React.ReactNode;
};
export default function Navbar({ children1, children2 }: NavProps) {
  return (
    <nav className="bg-white backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Logo />
          <div className="hidden md:flex items-center space-x-8">
            {children1}
          </div>
          <div className="flex items-center space-x-4">{children2}</div>
        </div>
      </div>
    </nav>
  );
}
