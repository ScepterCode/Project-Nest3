// Tiny app-wide toast + confirm store, rendered by <Toaster /> in the root
// layout. Replaces window.alert/confirm, which block the page, can't be
// styled, and are suppressed by some browsers.

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

export interface ConfirmRequest {
  id: number;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive: boolean;
  resolve: (ok: boolean) => void;
}

interface State {
  toasts: ToastItem[];
  confirm: ConfirmRequest | null;
}

const TOAST_MS = { success: 4000, info: 5000, error: 7000 } as const;

let state: State = { toasts: [], confirm: null };
let nextId = 1;
const listeners = new Set<() => void>();

function setState(update: Partial<State>) {
  state = { ...state, ...update };
  listeners.forEach(listener => listener());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getState() {
  return state;
}

export function dismissToast(id: number) {
  setState({ toasts: state.toasts.filter(t => t.id !== id) });
}

function show(kind: ToastKind, message: string) {
  const id = nextId++;
  // Keep at most 4 on screen.
  setState({ toasts: [...state.toasts, { id, kind, message }].slice(-4) });
  setTimeout(() => dismissToast(id), TOAST_MS[kind]);
  return id;
}

export const toast = {
  success: (message: string) => show('success', message),
  error: (message: string) => show('error', message),
  info: (message: string) => show('info', message),
};

/** Promise-based replacement for window.confirm. Resolves false on cancel. */
export function confirmAction(options: {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  // Only one confirmation at a time; a new one cancels the previous.
  state.confirm?.resolve(false);
  return new Promise(resolve => {
    setState({
      confirm: {
        id: nextId++,
        title: options.title,
        ...(options.description !== undefined && {
          description: options.description,
        }),
        confirmLabel: options.confirmLabel ?? 'Confirm',
        destructive: options.destructive ?? false,
        resolve: ok => {
          setState({ confirm: null });
          resolve(ok);
        },
      },
    });
  });
}

/** Readable message from an unknown thrown value. */
export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong'
) {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message
  )
    return error.message;
  return fallback;
}
