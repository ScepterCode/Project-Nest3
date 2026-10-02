'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ACTIVITY_COOKIE,
  IDLE_SIGN_OUT_PATH,
  IDLE_TIMEOUT_SECONDS,
} from '@/lib/auth/idle';

const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'scroll',
  'touchstart',
  'wheel',
] as const;
// Write the cookie at most this often; activity is only needed to the minute.
const WRITE_EVERY_SECONDS = 60;
const CHECK_EVERY_MS = 30_000;

const nowSeconds = () => Math.floor(Date.now() / 1000);

function readLastActive(): number | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${ACTIVITY_COOKIE}=(\\d+)`)
  );
  return match ? Number(match[1]) : null;
}

function writeLastActive(seconds: number) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${ACTIVITY_COOKIE}=${seconds}; Max-Age=${IDLE_TIMEOUT_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

// Signs the user out after IDLE_TIMEOUT_SECONDS without input in any tab.
export function IdleSignOut() {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;

    let signingOut = false;
    let lastWrite = 0;

    const isIdle = () => {
      const last = readLastActive();
      // The cookie expires with the timeout, so a missing one means idle.
      return last === null || nowSeconds() - last >= IDLE_TIMEOUT_SECONDS;
    };

    const signOut = async () => {
      if (signingOut) return;
      signingOut = true;
      document.cookie = `${ACTIVITY_COOKIE}=; Max-Age=0; Path=/`;
      try {
        // 'local' revokes this session's refresh token on Supabase, without
        // signing the user out on their other devices.
        await createClient().auth.signOut({ scope: 'local' });
      } finally {
        window.location.href = IDLE_SIGN_OUT_PATH;
      }
    };

    // Check before recording, so input after a long sleep (laptop lid closed,
    // timers paused) can't revive a session that already timed out.
    const onActivity = () => {
      if (isIdle()) {
        signOut();
        return;
      }
      const now = nowSeconds();
      if (now - lastWrite >= WRITE_EVERY_SECONDS) {
        lastWrite = now;
        writeLastActive(now);
      }
    };

    const check = () => {
      if (isIdle()) signOut();
    };

    // Just signed in: the middleware hasn't stamped the cookie yet. A stale
    // session reopened later is caught by the middleware before this runs.
    if (readLastActive() === null) {
      lastWrite = nowSeconds();
      writeLastActive(lastWrite);
    }

    ACTIVITY_EVENTS.forEach(event =>
      window.addEventListener(event, onActivity, {
        passive: true,
        capture: true,
      })
    );
    document.addEventListener('visibilitychange', check);
    const interval = window.setInterval(check, CHECK_EVERY_MS);

    return () => {
      ACTIVITY_EVENTS.forEach(event =>
        window.removeEventListener(event, onActivity, { capture: true })
      );
      document.removeEventListener('visibilitychange', check);
      window.clearInterval(interval);
    };
  }, [userId]);

  return null;
}
