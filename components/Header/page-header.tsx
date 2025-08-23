import React from 'react';
import Navbar from './Navbar';
import Navlinks from './Navlinks';
import Link from 'next/link';
export default function PageHeader() {
  return (
    <Navbar
      children2={
        <>
          <Navlinks href="/auth/login">Login</Navlinks>
          <Link
            href="/auth/sign-up"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Get Started
          </Link>{' '}
        </>
      }
      children1={
        <>
          <Navlinks href="#features">Features</Navlinks>
          <Navlinks href="#about">About</Navlinks>
          <Navlinks href="#demo">Demo</Navlinks>
          <Navlinks href="#contact">Contact</Navlinks>{' '}
        </>
      }
    />
  );
}
