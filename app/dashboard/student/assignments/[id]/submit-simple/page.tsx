"use client";

import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';

export default function SimpleSubmitPage() {
  const params = useParams();
  const router = useRouter();
  
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => router.push('/dashboard/student/assignments')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Assignments
        </Button>
        
        <h1 className="text-3xl font-bold mb-2">Submit Assignment</h1>
        <p className="text-gray-600">Assignment ID: {params.id}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Simple Submit Test</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p>This is a simplified submit page to test routing.</p>
            <p><strong>Assignment ID:</strong> {params.id}</p>
            <p><strong>Status:</strong> ✅ Submit page is accessible!</p>
            
            <div className="flex gap-2">
              <Button onClick={() => alert('Test submission!')}>
                Test Submit
              </Button>
              <Button 
                variant="outline"
                onClick={() => router.push('/dashboard/student/assignments')}
              >
                Back to Assignments
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}