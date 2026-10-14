import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TwoFactorGate } from '@/components/platform/two-factor-gate';

const mfa = {
  getAuthenticatorAssuranceLevel: jest.fn(),
  listFactors: jest.fn(),
  unenroll: jest.fn(async () => ({ error: null })),
  enroll: jest.fn(),
  challengeAndVerify: jest.fn(),
};

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { mfa } }),
}));

beforeEach(() => {
  Object.values(mfa).forEach(fn => fn.mockReset());
  mfa.unenroll.mockResolvedValue({ error: null });
});

const child = <p>Platform content</p>;

it('shows the dashboard when the session already has two-factor', async () => {
  mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal2', nextLevel: 'aal2' },
    error: null,
  });
  render(<TwoFactorGate>{child}</TwoFactorGate>);
  expect(await screen.findByText('Platform content')).toBeInTheDocument();
});

it('asks for a code when a factor is set up, and lets you in once it checks out', async () => {
  mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal2' },
    error: null,
  });
  mfa.listFactors.mockResolvedValue({
    data: { totp: [{ id: 'f1', status: 'verified' }], all: [] },
    error: null,
  });
  mfa.challengeAndVerify
    .mockResolvedValueOnce({ error: { message: 'Invalid TOTP code' } })
    .mockResolvedValueOnce({ error: null });

  render(<TwoFactorGate>{child}</TwoFactorGate>);
  const input = await screen.findByLabelText('6-digit code');
  expect(screen.queryByText('Platform content')).not.toBeInTheDocument();

  fireEvent.change(input, { target: { value: '111 111' } });
  fireEvent.click(screen.getByText('Continue'));
  expect(await screen.findByText(/didn’t work/)).toBeInTheDocument();
  expect(mfa.challengeAndVerify).toHaveBeenCalledWith({
    factorId: 'f1',
    code: '111111',
  });

  fireEvent.change(input, { target: { value: '222222' } });
  fireEvent.click(screen.getByText('Continue'));
  expect(await screen.findByText('Platform content')).toBeInTheDocument();
});

it('sets up two-factor on first visit, clearing half-finished attempts', async () => {
  mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal1' },
    error: null,
  });
  mfa.listFactors.mockResolvedValue({
    data: { totp: [], all: [{ id: 'old', status: 'unverified' }] },
    error: null,
  });
  mfa.enroll.mockResolvedValue({
    data: {
      id: 'f2',
      totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABC123' },
    },
    error: null,
  });
  mfa.challengeAndVerify.mockResolvedValue({ error: null });

  render(<TwoFactorGate>{child}</TwoFactorGate>);
  expect(
    await screen.findByText('Set up two-factor sign-in')
  ).toBeInTheDocument();
  expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'old' });
  expect(screen.getByAltText(/QR code/)).toBeInTheDocument();
  expect(screen.getByText('ABC123')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('6-digit code'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByText('Continue'));
  await waitFor(() =>
    expect(screen.getByText('Platform content')).toBeInTheDocument()
  );
  expect(mfa.challengeAndVerify).toHaveBeenCalledWith({
    factorId: 'f2',
    code: '123456',
  });
});
