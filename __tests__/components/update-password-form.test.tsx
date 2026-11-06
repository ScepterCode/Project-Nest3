import { render, screen, waitFor } from '@testing-library/react';
import { UpdatePasswordForm } from '@/components/update-password-form';

const setSession = jest.fn();
const exchangeCodeForSession = jest.fn();
const verifyOtp = jest.fn();
const getSession = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      setSession,
      exchangeCodeForSession,
      verifyOtp,
      getSession,
      updateUser: jest.fn(),
    },
  }),
}));

const visit = (path: string) => window.history.replaceState(null, '', path);

beforeEach(() => {
  jest.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: null } });
});

it('signs in from a link that carries its session (works on any device)', async () => {
  visit('/auth/update-password#access_token=a&refresh_token=r&type=recovery');
  setSession.mockResolvedValue({ error: null });
  render(<UpdatePasswordForm />);
  expect(await screen.findByLabelText('New password')).toBeInTheDocument();
  expect(setSession).toHaveBeenCalledWith({
    access_token: 'a',
    refresh_token: 'r',
  });
  // The tokens don't stay in the address bar.
  expect(window.location.hash).toBe('');
});

it('signs in from a same-browser ?code= link', async () => {
  visit('/auth/update-password?code=abc');
  exchangeCodeForSession.mockResolvedValue({ error: null });
  render(<UpdatePasswordForm />);
  expect(await screen.findByLabelText('New password')).toBeInTheDocument();
  expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
});

it('signs in from a template ?token_hash= link', async () => {
  visit('/auth/update-password?token_hash=h&type=recovery');
  verifyOtp.mockResolvedValue({ error: null });
  render(<UpdatePasswordForm />);
  expect(await screen.findByLabelText('New password')).toBeInTheDocument();
  expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'h', type: 'recovery' });
});

it('explains an unusable link instead of failing on save', async () => {
  // A ?code= opened in another browser: the exchange fails, no session.
  visit('/auth/update-password?code=abc');
  exchangeCodeForSession.mockResolvedValue({ error: new Error('no verifier') });
  render(<UpdatePasswordForm />);
  await waitFor(() =>
    expect(screen.getByText(/can’t be used/)).toBeInTheDocument()
  );
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: /send a new reset link/i })
  ).toHaveAttribute('href', '/auth/forgot-password');
});

it('uses a session already set by /auth/confirm', async () => {
  visit('/auth/update-password');
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u' } } } });
  render(<UpdatePasswordForm />);
  expect(await screen.findByLabelText('New password')).toBeInTheDocument();
});
