"use client";

import { useParams } from 'next/navigation';

export default function TestAssignmentPage() {
  const params = useParams();
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Assignment Route Test</h1>
      <div className="bg-gray-100 p-4 rounded">
        <p><strong>Assignment ID:</strong> {params.id}</p>
        <p><strong>Route:</strong> /dashboard/student/assignments/{params.id}/test</p>
        <p><strong>Status:</strong> ✅ Route is working!</p>
      </div>
      <div className="mt-4">
        <p>If you can see this page, the routing structure is correct.</p>
        <p>The issue might be with the submit page component itself.</p>
      </div>
    </div>
  );
}