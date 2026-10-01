import React from 'react';
import Navbar from './Navbar';
import Navlinks from './Navlinks';
import MobileMenu from './mobile-menu';
import Link from 'next/link';

const SECTIONS = [
  { href: '#features', label: 'Features' },
  { href: '#about', label: 'About' },
  { href: '#contact', label: 'Contact' },
];

export default function PageHeader() {
  return (
    <Navbar
      children2={
        <>
          <Navlinks href="/auth/login" className="hidden sm:inline">
            Login
          </Navlinks>
          <Link
            href="/auth/sign-up"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Get Started
          </Link>
          <MobileMenu
            links={[...SECTIONS, { href: '/auth/login', label: 'Login' }]}
          />
        </>
      }
      children1={
        <>
          {SECTIONS.map(section => (
            <Navlinks key={section.href} href={section.href}>
              {section.label}
            </Navlinks>
          ))}
        </>
      }
    />
  );
}
