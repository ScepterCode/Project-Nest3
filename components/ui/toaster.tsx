'use client';

import { useSyncExternalStore } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { dismissToast, getState, subscribe, type ToastKind } from '@/lib/toast';

const STYLES: Record<ToastKind, string> = {
  success: 'border-green-200 bg-green-50 text-green-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
};

const ICONS = {
  success: <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />,
  error: <XCircle className="h-5 w-5 text-red-600 shrink-0" />,
  info: <Info className="h-5 w-5 text-blue-600 shrink-0" />,
};

export function Toaster() {
  const { toasts, confirm } = useSyncExternalStore(
    subscribe,
    getState,
    getState
  );

  return (
    <>
      <div
        aria-live="polite"
        className="fixed z-[100] bottom-4 right-4 left-4 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg text-sm ${STYLES[t.kind]}`}
          >
            {ICONS[t.kind]}
            <p className="flex-1 break-words">{t.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
              className="opacity-60 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <Dialog
        open={confirm !== null}
        onOpenChange={open => {
          if (!open) confirm?.resolve(false);
        }}
      >
        {confirm && (
          <DialogContent
            key={confirm.id}
            className="sm:max-w-md"
            {...(!confirm.description && { 'aria-describedby': undefined })}
          >
            <DialogHeader>
              <DialogTitle>{confirm.title}</DialogTitle>
              {confirm.description && (
                <DialogDescription>{confirm.description}</DialogDescription>
              )}
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => confirm.resolve(false)}>
                Cancel
              </Button>
              <Button
                variant={confirm.destructive ? 'destructive' : 'default'}
                onClick={() => confirm.resolve(true)}
              >
                {confirm.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
