// Shapes returned by my_tutor_home() and my_learner_home(), and the small
// date phrases both home pages use.
import { differenceInCalendarDays, format } from 'date-fns';

export interface HomeProgramme {
  id: string;
  name: string;
  stage: 'mentorship' | 'fellowship' | null;
}

export interface TutorHomeData {
  programmes: HomeProgramme[];
  to_mark: number;
  oldest_waiting: string | null;
  queue: {
    submission_id: string;
    learner: string | null;
    assignment_id: string;
    assignment: string;
    class_name: string;
    round: number;
    submitted_at: string | null;
  }[];
  join_requests: { class_id: string; class_name: string; count: number }[];
  unregistered_sessions: {
    session_id: string;
    class_id: string;
    class_name: string;
    topic: string;
    held_on: string;
  }[];
  classes: {
    id: string;
    name: string;
    code: string;
    learners: number;
    next_due: { title: string; due_date: string } | null;
    last_session: string | null;
  }[];
  delivery: {
    sessions_30d: number;
    attendance_rate: number | null;
    avg_turnaround_hours: number | null;
    feedback_rate: number | null;
    graded: number;
    overdue_reviews: number;
    flags: string[];
  } | null;
}

export interface LearnerHomeData {
  stage: 'foundation' | 'mentorship' | 'fellowship' | 'alumni';
  programmes: HomeProgramme[];
  class_count: number;
  revisions: {
    assignment_id: string;
    title: string;
    class_name: string;
    feedback: string | null;
    due_date: string | null;
    requested_at: string | null;
  }[];
  peer_reviews: {
    peer_review_assignment_id: string;
    title: string;
    count: number;
    first_review_id: string;
    end_date: string | null;
    anonymous: boolean;
  }[];
  missed: {
    assignment_id: string;
    title: string;
    class_name: string;
    due_date: string;
  }[];
  coming_up: {
    assignment_id: string;
    title: string;
    class_name: string;
    due_date: string;
    started: boolean;
  }[];
  latest_feedback: {
    assignment_id: string;
    title: string;
    grade: number | null;
    points_possible: number | null;
    feedback: string | null;
    marked_by: string | null;
    graded_at: string | null;
  } | null;
  new_materials: {
    id: string;
    title: string;
    kind: 'file' | 'link';
    file_size: number | null;
    class_id: string;
    class_name: string;
    created_at: string;
  }[];
}

/** "Good morning" before noon, "Good afternoon" until 6pm, then "Good evening". */
export function greeting(now: Date = new Date()) {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** How long something has waited: "today", "1 day", "6 days". */
export function waited(iso: string | null, now: Date = new Date()) {
  if (!iso) return '—';
  const d = differenceInCalendarDays(now, new Date(iso));
  if (d <= 0) return 'today';
  return d === 1 ? '1 day' : `${d} days`;
}

/**
 * A due date as people say it: "today", "tomorrow", a weekday within the
 * week ("Mon"), otherwise "7 Nov". Past dates read "yesterday" or "3 Nov".
 */
export function when(iso: string | null, now: Date = new Date()) {
  if (!iso) return null;
  const date = new Date(iso);
  const d = differenceInCalendarDays(date, now);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  if (d > 1 && d < 7) return format(date, 'EEE');
  return format(date, 'd MMM');
}
