import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  ClassSessions,
  attendanceSummary,
} from '@/components/classes/class-sessions';

const calls: {
  table: string;
  op: string;
  payload?: unknown;
  options?: unknown;
}[] = [];
let existing: unknown[] = [];

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ order: async () => ({ data: existing, error: null }) }),
      }),
      insert: (payload: unknown) => {
        calls.push({ table, op: 'insert', payload });
        return {
          select: () => ({
            single: async () => ({ data: { id: 'new-session' }, error: null }),
          }),
        };
      },
      upsert: async (payload: unknown, options: unknown) => {
        calls.push({ table, op: 'upsert', payload, options });
        return { error: null };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));
jest.mock('@/lib/toast', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
  confirmAction: jest.fn(async () => true),
  errorMessage: (_e: unknown, fallback: string) => fallback,
}));

const students = [
  { id: 's1', first_name: 'Ann', last_name: 'A', email: 'ann@x.test' },
  { id: 's2', first_name: 'Ben', last_name: 'B', email: 'ben@x.test' },
];

beforeEach(() => {
  calls.length = 0;
  existing = [];
});

it('summarises attendance', () => {
  expect(
    attendanceSummary([
      { status: 'present' },
      { status: 'present' },
      { status: 'absent' },
    ])
  ).toBe('2 present · 1 absent');
  expect(attendanceSummary([])).toBe('No attendance marked');
});

it('logs a session with everyone present by default, except who you change', async () => {
  render(<ClassSessions classId="c1" students={students} />);
  fireEvent.click(await screen.findByText('Log a session'));
  fireEvent.change(screen.getByLabelText('Topic'), {
    target: { value: 'Week 1: lines' },
  });

  const benAbsent = screen
    .getByRole('radiogroup', { name: 'Attendance for Ben B' })
    .querySelector('button:nth-child(3)') as HTMLButtonElement;
  fireEvent.click(benAbsent);
  fireEvent.click(screen.getByText('Save session'));

  await waitFor(() => expect(calls.some(c => c.op === 'upsert')).toBe(true));
  expect(calls[0]).toMatchObject({
    table: 'class_sessions',
    op: 'insert',
    payload: { class_id: 'c1', topic: 'Week 1: lines' },
  });
  const upsert = calls.find(c => c.op === 'upsert')!;
  expect(upsert.table).toBe('session_attendance');
  expect(
    (upsert.payload as { student_id: string; status: string }[]).map(r => [
      r.student_id,
      r.status,
    ])
  ).toEqual([
    ['s1', 'present'],
    ['s2', 'absent'],
  ]);
  expect(upsert.options).toEqual({ onConflict: 'session_id,student_id' });
});

it('shows logged sessions with their attendance', async () => {
  existing = [
    {
      id: 'x',
      held_on: '2026-10-10',
      topic: 'Squash and stretch',
      notes: null,
      session_attendance: [
        { student_id: 's1', status: 'present' },
        { student_id: 's2', status: 'late' },
      ],
    },
  ];
  render(<ClassSessions classId="c1" students={students} />);
  expect(await screen.findByText('Squash and stretch')).toBeInTheDocument();
  expect(screen.getByText(/1 present · 1 late/)).toBeInTheDocument();
});
