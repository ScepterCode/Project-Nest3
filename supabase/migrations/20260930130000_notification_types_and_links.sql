-- =============================================================================
-- Notifications: allow the types the app sends, and only in-app links
-- =============================================================================
-- * The app sends 'class_created' (teacher creates a class) and
--   'assignment_submitted' (student submits work), but the type check only
--   allowed 7 other values, so both notifications always failed to insert.
-- * action_url is passed to router.push() when a notification is clicked.
--   Only same-origin paths ("/dashboard/...") are allowed, so a notification
--   can't send someone to a phishing site or run a javascript: URL.
--   (Mirrors lib/utils/safe-url.ts.)
-- =============================================================================

BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'assignment_created',
    'assignment_graded',
    'assignment_due_soon',
    'assignment_submitted',
    'class_announcement',
    'class_created',
    'enrollment_approved',
    'role_changed',
    'system_message'
  )
);

-- Clear any existing unsafe links first so the constraint can validate.
UPDATE public.notifications
SET action_url = NULL
WHERE action_url IS NOT NULL
  AND (action_url !~ '^/' OR action_url ~ '^//' OR action_url ~ '^/\\');

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_action_url_internal;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_action_url_internal CHECK (
  action_url IS NULL
  OR (action_url ~ '^/' AND action_url !~ '^//' AND action_url !~ '^/\\')
);

-- -----------------------------------------------------------------------------
-- Storage: peer reviewers can open the file they were assigned to review
-- -----------------------------------------------------------------------------
-- submissions.file_url holds either the object path (new uploads) or an old
-- ".../object/public/submissions/<path>" URL.

CREATE OR REPLACE FUNCTION app_private.reviews_submission_path(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.submissions s
    JOIN public.peer_reviews pr ON pr.submission_id = s.id
    WHERE pr.reviewer_id = auth.uid()
      AND (s.file_url = p_name OR s.file_url LIKE '%/submissions/' || p_name)
  )
$$;

REVOKE ALL ON FUNCTION app_private.reviews_submission_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.reviews_submission_path(text) TO authenticated;

DROP POLICY IF EXISTS "Peer reviewers can view assigned submissions" ON storage.objects;
CREATE POLICY "Peer reviewers can view assigned submissions" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'submissions' AND app_private.reviews_submission_path(name));

COMMIT;
