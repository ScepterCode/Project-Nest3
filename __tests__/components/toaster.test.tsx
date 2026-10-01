import { act, render, screen, fireEvent } from '@testing-library/react';
import { Toaster } from '@/components/ui/toaster';
import { confirmAction, errorMessage, getState, toast } from '@/lib/toast';

describe('toasts', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => {
      jest.runAllTimers();
    });
    jest.useRealTimers();
  });

  it('shows a toast and removes it after its timeout', () => {
    render(<Toaster />);
    act(() => {
      toast.success('Saved.');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Saved.');
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
  });

  it('marks errors as alerts and lets users dismiss them', () => {
    render(<Toaster />);
    act(() => {
      toast.error('Could not save.');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save.');
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText('Could not save.')).not.toBeInTheDocument();
  });

  it('keeps at most four toasts on screen', () => {
    act(() => {
      for (let i = 1; i <= 6; i++) toast.info(`n${i}`);
    });
    expect(getState().toasts.map(t => t.message)).toEqual([
      'n3',
      'n4',
      'n5',
      'n6',
    ]);
  });
});

describe('confirmAction', () => {
  it('resolves true when confirmed and false when cancelled', async () => {
    render(<Toaster />);

    let result: Promise<boolean>;
    act(() => {
      result = confirmAction({ title: 'Delete it?', confirmLabel: 'Delete' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await expect(result!).resolves.toBe(true);

    act(() => {
      result = confirmAction({ title: 'Delete it?', confirmLabel: 'Delete' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(result!).resolves.toBe(false);
    expect(getState().confirm).toBeNull();
  });

  it('cancels a pending confirmation when a new one opens', async () => {
    let first: Promise<boolean>;
    act(() => {
      first = confirmAction({ title: 'First?' });
      confirmAction({ title: 'Second?' });
    });
    await expect(first!).resolves.toBe(false);
    act(() => getState().confirm?.resolve(false));
  });
});

describe('errorMessage', () => {
  it('reads messages from errors and error-like objects', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage({ message: 'pg says no' })).toBe('pg says no');
    expect(errorMessage(null, 'fallback')).toBe('fallback');
  });
});
