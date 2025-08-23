import React from 'react';

export default function DashboardHeader({ text }: { text: React.ReactNode }) {
  return (
    <div className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-2 items-center  text-gray-900 py-9">
          <h1 className="text-lg text-gray-500">Dashboard</h1>

          <svg
            className="w-5 h-5 text-gray-400 mx-1"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 111.414-1.414L13.414 10l-4.707 4.707a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
          <span className="font-semibold text-2xl">{text}</span>
        </div>
      </div>
    </div>
  );
}
