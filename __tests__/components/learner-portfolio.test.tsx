import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  LearnerPortfolio,
  averageGrade,
} from '@/components/portfolio/learner-portfolio';

let viewer = { id: 'tutor-1', role: 'teacher' };
const rpc = jest.fn();

const portfolio = {
  learner: {
    id: 'kid-1',
    name: 'Lola Test',
    email: 'lola@x.test',
    school: 'Aba Academy',
    stage: 'foundation',
    consent_status: 'not_recorded',
    consent_note: null,
    consent_recorded_at: null,
    joined: '2026-09-01T00:00:00Z',
  },
  work: [
    {
      submission_id: 's1',
      assignment: 'Bouncing ball',
      class: 'Foundation 2D',
      tutor_id: 'tutor-1',
      submitted_at: '2026-10-01T00:00:00Z',
      status: 'graded',
      grade: 9,
      points_possible: 10,
      feedback: 'Lovely arcs',
      revision_count: 1,
      link_url: 'https://youtu.be/x',
      file_url: null,
      featured: true,
    },
    {
      submission_id: 's2',
      assignment: 'Walk cycle',
      class: 'Other class',
      tutor_id: 'tutor-2',
      submitted_at: '2026-10-05T00:00:00Z',
      status: 'graded',
      grade: 6,
      points_possible: 10,
      feedback: null,
      revision_count: 0,
      link_url: null,
      file_url: null,
      featured: false,
    },
  ],
  attendance: [{ class: 'Foundation 2D', attended: 7, counted: 8 }],
  nominations: [],
};

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: viewer.id } }),
}));
jest.mock('@/lib/hooks/useUserRole', () => ({
  useUserRole: () => ({ roleData: { role: viewer.role } }),
}));
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: (name: string, args: unknown) => rpc(name, args),
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  }),
}));
jest.mock('@/lib/toast', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
  errorMessage: (_e: unknown, f: string) => f,
}));

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) =>
    name === 'learner_portfolio'
      ? { data: portfolio, error: null }
      : { data: null, error: null }
  );
});

it('averages grades as percentages', () => {
  expect(averageGrade(portfolio.work as never)).toBe(75);
  expect(averageGrade([])).toBeNull();
});

it("shows a tutor the learner's work, and lets them feature only their own class's work", async () => {
  viewer = { id: 'tutor-1', role: 'teacher' };
  render(<LearnerPortfolio studentId="kid-1" />);
  expect(await screen.findByText('Lola Test')).toBeInTheDocument();
  expect(screen.getByText('Featured work')).toBeInTheDocument();
  expect(screen.getByText('75%')).toBeInTheDocument();
  expect(screen.getByText('7/8')).toBeInTheDocument();
  expect(screen.getAllByText('Unfeature')).toHaveLength(1);
  expect(screen.queryByText('Guardian consent')).not.toBeInTheDocument();
  expect(screen.getByText('Nominate for the next stage')).toBeInTheDocument();
});

it('lets a tutor nominate with a reason', async () => {
  viewer = { id: 'tutor-1', role: 'teacher' };
  render(<LearnerPortfolio studentId="kid-1" />);
  const button = await screen.findByRole('button', { name: 'Nominate' });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Why this learner?'), {
    target: { value: 'Consistently strong timing and spacing.' },
  });
  fireEvent.click(button);
  await waitFor(() =>
    expect(rpc).toHaveBeenCalledWith('nominate_learner', {
      p_student: 'kid-1',
      p_stage: 'mentorship',
      p_reason: 'Consistently strong timing and spacing.',
    })
  );
});

it('lets a school admin record consent', async () => {
  viewer = { id: 'admin-1', role: 'institution_admin' };
  render(<LearnerPortfolio studentId="kid-1" />);
  expect(await screen.findByText('Guardian consent')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Note/), {
    target: { value: 'Form signed 12 Oct' },
  });
  fireEvent.click(screen.getByText('Save consent'));
  await waitFor(() =>
    expect(rpc).toHaveBeenCalledWith('set_learner_consent', {
      p_student: 'kid-1',
      p_status: 'not_recorded',
      p_note: 'Form signed 12 Oct',
    })
  );
});

it("shows a learner their own portfolio without admin tools or others' reasons", async () => {
  viewer = { id: 'kid-1', role: 'student' };
  render(<LearnerPortfolio studentId="kid-1" />);
  expect(await screen.findByText('My portfolio')).toBeInTheDocument();
  expect(
    screen.queryByText('Nominate for the next stage')
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Guardian consent')).not.toBeInTheDocument();
  expect(screen.queryByText(/consent not recorded/i)).not.toBeInTheDocument();
});
