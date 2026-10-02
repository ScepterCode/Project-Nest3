// Signed-in users are signed out after this long without activity. Supabase's
// own session limits need a paid plan, so the app enforces it: the browser
// records activity in ACTIVITY_COOKIE (shared by all tabs) and signs out when
// it goes stale, and the middleware revokes the session if a request arrives
// after the timeout (e.g. a tab reopened the next day).
export const IDLE_TIMEOUT_SECONDS = 30 * 60;

// Unix seconds of the last activity. Readable by the browser on purpose: it
// has to update it. It only ever shortens a session, never grants access.
export const ACTIVITY_COOKIE = 'pn_active';

export const IDLE_SIGN_OUT_PATH = '/auth/login?reason=idle';
