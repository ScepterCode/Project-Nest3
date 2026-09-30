'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { getSubmissionFileUrl } from '@/lib/storage/submission-files';

interface SubmissionFileButtonProps {
  fileUrl: string;
  children: ReactNode;
  className?: string;
}

/**
 * Opens a submitted file through a short-lived signed URL. The submissions
 * bucket is private, so a stored URL can't be linked to directly.
 */
export function SubmissionFileButton({
  fileUrl,
  children,
  className,
}: SubmissionFileButtonProps) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = async () => {
    // Open the tab synchronously so popup blockers allow it, then point it at
    // the signed URL once we have it.
    const tab = window.open('', '_blank');
    setOpening(true);
    setError(null);
    try {
      const url = await getSubmissionFileUrl(createClient(), fileUrl);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : 'Could not open this file');
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={handleOpen}
        disabled={opening}
      >
        {children}
      </Button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </>
  );
}
