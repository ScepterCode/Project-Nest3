"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Database, AlertCircle } from 'lucide-react';

export function DatabaseStatusBanner() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const checkDatabaseConnection = async () => {
      try {
        const supabase = createClient();
        const { error } = await supabase.from('users').select('count').limit(1);
        setIsConnected(!error);
      } catch (error) {
        setIsConnected(false);
      }
    };

    checkDatabaseConnection();
  }, []);

  if (isConnected === null) {
    return null; // Still checking
  }

  if (isConnected) {
    return null; // Database is working, no need to show banner
  }

  return (
    <Alert className="mb-6 border-orange-200 bg-orange-50">
      <AlertCircle className="h-4 w-4 text-orange-600" />
      <AlertDescription className="text-orange-800">
        <strong>Demo Mode:</strong> Database tables not found. Showing sample data. 
        <a 
          href="/debug" 
          className="ml-2 underline hover:no-underline"
        >
          Check system status
        </a>
      </AlertDescription>
    </Alert>
  );
}