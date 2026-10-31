import { render, screen } from '@testing-library/react';
import { TutorHome } from '@/components/home/tutor-home';
import { LearnerHome } from '@/components/home/learner-home';
import { LearnerHomeData, TutorHomeData } from '@/lib/home';

let payload: unknown = null;

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: async () => ({ data: payload, error: null }),
  }),
}));
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ getUserDisplayName: () => 'Ada Okafor' }),
}));

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString();
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

const tutor: TutorHomeData = {
  programmes: [{ id: 'p1', name: 'Test Programme', stage: null }],
  to_mark: 2,
  oldest_waiting: daysAgo(6),
  queue: [
    {
      submission_id: 's1',
      learner: 'Ben Two',
      assignment_id: 'a1',
      assignment: 'Bouncing ball',
      class_name: 'Animation',
      round: 2,
      submitted_at: daysAgo(6),
    },
  ],
  join_requests: [{ class_id: 'c1', class_name: 'Animation', count: 3 }],
  unregistered_sessions: [
    {
      session_id: 'x1',
      class_id: 'c2',
      class_name: 'Storyboarding',
      topic: 'Panels',
      held_on: new Date().toISOString().slice(0, 10),
    },
  ],
  classes: [
    {
      id: 'c1',
      name: 'Animation',
      code: 'AN-1',
      learners: 2,
      next_due: { title: 'Walk cycle', due_date: inDays(10) },
      last_session: null,
    },
  ],
  delivery: {
    sessions_30d: 9,
    attendance_rate: 91,
    avg_turnaround_hours: 58,
    feedback_rate: 40,
    graded: 10,
    overdue_reviews: 0,
    flags: ['little_feedback'],
  },
};

const learner: LearnerHomeData = {
  stage: 'mentorship',
  programmes: [],
  class_count: 2,
  revisions: [
    {
      assignment_id: 'a1',
      title: 'Bouncing ball',
      class_name: 'Animation',
      feedback: 'Fix the arcs.',
      due_date: null,
      requested_at: daysAgo(1),
    },
  ],
  peer_reviews: [
    {
      peer_review_assignment_id: 'pr1',
      title: 'Thumbnails',
      count: 2,
      first_review_id: 'r1',
      end_date: null,
      anonymous: true,
    },
  ],
  missed: [],
  coming_up: [
    {
      assignment_id: 'a2',
      title: 'Walk cycle',
      class_name: 'Animation',
      due_date: inDays(10),
      started: true,
    },
  ],
  latest_feedback: {
    assignment_id: 'a3',
    title: 'Squash and stretch',
    grade: 16,
    points_possible: 20,
    feedback: 'Great timing.',
    marked_by: 'Ada Okafor',
    graded_at: daysAgo(1),
  },
  new_materials: [],
};

describe('TutorHome', () => {
  it('puts what needs the tutor first, with links to act on it', async () => {
    payload = tutor;
    render(<TutorHome />);
    expect(await screen.findByText('2 pieces to mark.')).toBeInTheDocument();
    expect(
      screen.getByText(/The oldest has waited 6 days/)
    ).toBeInTheDocument();
    expect(
      screen.getByText('3 learners are asking to join').closest('a')
    ).toHaveAttribute(
      'href',
      '/dashboard/teacher/classes/c1/manage?tab=students'
    );
    expect(
      screen.getByText(/Today's session for Storyboarding/)
    ).toBeInTheDocument();
    expect(screen.getByText(/written feedback on 40%/)).toBeInTheDocument();
    expect(screen.getByText('Revision 1')).toBeInTheDocument();
    expect(screen.getByText('2.4 days')).toBeInTheDocument();
    expect(screen.getByText('Test Programme')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /, Ada$/
    );
  });

  it('offers to create a class when there are none', async () => {
    payload = { ...tutor, classes: [], queue: [], to_mark: 0 };
    render(<TutorHome />);
    expect(
      await screen.findByText("You don't have a class yet")
    ).toBeInTheDocument();
  });
});

describe('LearnerHome', () => {
  it('shows revisions and reviews, what is coming up and the latest mark', async () => {
    payload = learner;
    render(<LearnerHome />);
    expect(
      await screen.findByText('Revise "Bouncing ball"')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Review 2 classmates').closest('a')
    ).toHaveAttribute('href', '/dashboard/student/peer-reviews/pr1/review/r1');
    expect(screen.getByText('Walk cycle')).toBeInTheDocument();
    expect(screen.getByText('16/20')).toBeInTheDocument();
    expect(
      screen.getByText('Mentorship').closest('[aria-current]')
    ).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Hi Ada'
    );
  });

  it('asks for a class code before anything else', async () => {
    payload = { ...learner, class_count: 0 };
    render(<LearnerHome />);
    expect(
      await screen.findByText('Join your first class')
    ).toBeInTheDocument();
  });
});
