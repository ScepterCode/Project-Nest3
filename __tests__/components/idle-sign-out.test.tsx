import { render, fireEvent, act } from '@testing-library/react';
import { IdleSignOut } from '@/components/idle-sign-out';
import { ACTIVITY_COOKIE } from '@/lib/auth/idle';

const signOut = jest.fn(async () => ({ error: null }));
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut } }),
}));
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

const MINUTE = 60_000;
const stamp = () =>
  document.cookie.match(new RegExp(`${ACTIVITY_COOKIE}=(\\d+)`))?.[1];

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-02T09:00:00Z') });
  document.cookie = `${ACTIVITY_COOKIE}=; Max-Age=0; Path=/`;
  signOut.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

// Advance the clock and let the 30s idle check run, plus pending promises.
async function wait(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

it('stamps activity on mount after sign-in', () => {
  render(<IdleSignOut />);
  expect(Number(stamp())).toBe(Math.floor(Date.now() / 1000));
  expect(signOut).not.toHaveBeenCalled();
});

it('signs out after 30 minutes with no activity', async () => {
  render(<IdleSignOut />);

  await wait(29 * MINUTE);
  expect(signOut).not.toHaveBeenCalled();

  await wait(1.5 * MINUTE);
  expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
});

it('keeps the session while the user is active', async () => {
  render(<IdleSignOut />);

  await wait(20 * MINUTE);
  fireEvent.keyDown(window);
  await wait(25 * MINUTE); // 45 min since sign-in, 25 since the key press
  expect(signOut).not.toHaveBeenCalled();

  await wait(6 * MINUTE); // 31 min since the key press
  expect(signOut).toHaveBeenCalled();
});

it('does not let input after a long sleep revive the session', async () => {
  render(<IdleSignOut />);

  // Laptop asleep: the clock moves on but no timers fire.
  act(() => {
    jest.setSystemTime(Date.now() + 2 * 60 * MINUTE);
  });
  fireEvent.pointerDown(window);
  await act(async () => {});

  expect(signOut).toHaveBeenCalled();
});
