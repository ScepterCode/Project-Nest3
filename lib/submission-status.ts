// Submission statuses (supabase/migrations/20261017120000_rubric_templates_and_revisions.sql):
// draft -> submitted -> (revision_requested -> submitted)* -> graded

export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'revision_requested'
  | 'graded';

const LABELS: Record<SubmissionStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  revision_requested: 'Changes requested',
  graded: 'Graded',
};

export function statusLabel(status: string | null | undefined) {
  return LABELS[status as SubmissionStatus] ?? 'Not submitted';
}

export function statusBadgeVariant(
  status: string | null | undefined
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'graded':
      return 'default';
    case 'revision_requested':
      return 'destructive';
    case 'submitted':
      return 'secondary';
    default:
      return 'outline';
  }
}

/** Students can edit and (re)submit only before grading. */
export function studentCanEdit(status: string | null | undefined) {
  return status !== 'graded';
}
