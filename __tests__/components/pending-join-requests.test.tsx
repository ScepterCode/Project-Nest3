import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PendingJoinRequests } from '@/components/classes/pending-join-requests';

let requests: unknown[] = [];
const calls: [string, unknown][] = [];

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: async (name: string, args?: unknown) => {
      calls.push([name, args]);
      return name === 'my_join_requests'
        ? { data: requests, error: null }
        : { data: null, error: null };
    },
  }),
}));

jest.mock('@/lib/toast', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
  confirmAction: jest.fn(async () => true),
  errorMessage: (_e: unknown, fallback: string) => fallback,
}));

beforeEach(() => {
  requests = [];
  calls.length = 0;
});

it('shows nothing when there are no pending requests', async () => {
  const { container } = render(<PendingJoinRequests />);
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(container).toBeEmptyDOMElement();
});

it('lists pending requests and withdraws one', async () => {
  requests = [
    {
      class_id: 'c1',
      class_name: '2D Animation',
      teacher_name: 'Ms Ade',
      requested_at: '2026-10-14T09:00:00Z',
    },
  ];
  render(<PendingJoinRequests />);

  expect(await screen.findByText('2D Animation')).toBeInTheDocument();
  expect(screen.getByText(/Waiting for your tutor/)).toBeInTheDocument();
  expect(screen.getByText(/Ms Ade/)).toBeInTheDocument();

  fireEvent.click(screen.getByText('Withdraw'));
  await waitFor(() =>
    expect(screen.queryByText('2D Animation')).not.toBeInTheDocument()
  );
  expect(calls).toContainEqual(['leave_class', { p_class: 'c1' }]);
});
