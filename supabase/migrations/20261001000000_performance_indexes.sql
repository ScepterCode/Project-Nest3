-- =============================================================================
-- Indexes for the hot queries, and removal of redundant ones
-- =============================================================================
-- Added (match the queries the app and RLS helpers actually run):
--   * notifications (user_id, created_at DESC): the bell's "latest 5" and the
--     notifications page, both per user, newest first
--   * notifications (user_id) WHERE NOT is_read: the unread count
--   * peer_reviews (submission_id): app_private.reviews_submission(_path)
--   * assignments (rubric_id): app_private.can_view_rubric
--   * users (department_id): department member counts
--
-- Dropped (every insert/update pays for them, no query benefits):
--   * notifications is_read / type / priority: low-selectivity single columns
--   * notifications user_id: covered by the new (user_id, created_at) index
--   * submissions (assignment_id), enrollments (class_id): leading column of
--     an existing unique index on (assignment_id, student_id) / (class_id,
--     student_id)
--   * users (email), classes (code): duplicates of their unique constraints
--
-- Tables are small today, so plain CREATE INDEX inside the transaction is
-- fine. On large tables, create indexes CONCURRENTLY in a separate migration
-- without BEGIN/COMMIT.
-- =============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id) WHERE NOT is_read;

CREATE INDEX IF NOT EXISTS idx_peer_reviews_submission_id
  ON public.peer_reviews (submission_id);
CREATE INDEX IF NOT EXISTS idx_assignments_rubric_id
  ON public.assignments (rubric_id) WHERE rubric_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_department_id
  ON public.users (department_id) WHERE department_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_notifications_is_read;
DROP INDEX IF EXISTS public.idx_notifications_type;
DROP INDEX IF EXISTS public.idx_notifications_priority;
DROP INDEX IF EXISTS public.idx_notifications_user_id;
DROP INDEX IF EXISTS public.idx_submissions_assignment_id;
DROP INDEX IF EXISTS public.idx_enrollments_class_id;
DROP INDEX IF EXISTS public.idx_users_email;
DROP INDEX IF EXISTS public.idx_classes_code;

COMMIT;
