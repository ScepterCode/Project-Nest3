"use client";

import { useParams } from 'next/navigation';

export default function SubmitTestPage() {
  const params = useParams();
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Submit Page Test</h1>
      <div className="bg-green-100 p-4 rounded">
        <p><strong>Assignment ID:</strong> {params.id}</p>
        <p><strong>Route:</strong> /dashboard/student/assignments/{params.id}/submit-test</p>
        <p><strong>Status:</strong> ✅ Submit route structure is working!</p>
      </div>
      <div className="mt-4">
        <p>This confirms the routing works. The issue is likely in the main submit page component.</p>
      </div>
    </div>
  );
}