-- =============================================================================
-- Programme rubric templates, and the revision loop for submissions
-- =============================================================================
-- 1. Programme templates: platform admins publish rubrics every tutor can
--    use, so schools assess the same way. Tutors attach a template to an
--    assignment like any rubric; the assignment keeps a snapshot
--    (assignments.rubric), so later template edits never change past
--    grading, and the snapshot's id shows which template was used.
-- 2. Revision loop: a tutor can ask for changes ('revision_requested', with
--    feedback) instead of grading. The student is notified and resubmits;
--    revision_count counts the rounds. Graded work is locked for students
--    (before, a student could edit graded work and it flipped back to
--    'submitted' with the old grade).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Programme rubric templates
-- =============================================================================
ALTER TABLE public.rubrics
  ADD COLUMN IF NOT EXISTS is_programme_template boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS rubrics_programme_template_idx
  ON public.rubrics (is_programme_template) WHERE is_programme_template;

-- Same as 20260930120000, plus: every signed-in user can read programme
-- templates (their criteria and levels follow through can_view_criterion).
CREATE OR REPLACE FUNCTION app_private.can_view_rubric(p_rubric uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.owns_rubric(p_rubric)
    OR EXISTS (SELECT 1 FROM public.rubrics r
               WHERE r.id = p_rubric AND r.is_programme_template)
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.rubric_id = p_rubric
        AND (app_private.teaches_class(a.class_id) OR app_private.is_enrolled_in(a.class_id))
    )
$$;

-- Only platform admins publish or withdraw templates.
CREATE OR REPLACE FUNCTION app_private.guard_programme_template()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.is_programme_template IS DISTINCT FROM
       (CASE WHEN TG_OP = 'INSERT' THEN false ELSE OLD.is_programme_template END)
     AND NOT (app_private.is_trusted_caller() OR app_private.is_platform_admin()) THEN
    RAISE EXCEPTION 'Only platform admins publish programme rubric templates'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_programme_template() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_programme_template ON public.rubrics;
CREATE TRIGGER guard_programme_template
  BEFORE INSERT OR UPDATE OF is_programme_template ON public.rubrics
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_programme_template();

CREATE OR REPLACE FUNCTION public.platform_set_programme_template(p_rubric uuid, p_published boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_platform_admin();
  UPDATE public.rubrics SET is_programme_template = p_published, updated_at = now()
  WHERE id = p_rubric;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rubric not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM app_private.log_platform_action(
    CASE WHEN p_published THEN 'template_published' ELSE 'template_withdrawn' END,
    'rubric', p_rubric::text, '{}'::jsonb);
END;
$$;

-- Templates (published, plus the platform admin's own drafts) with how
-- widely each is used.
CREATE OR REPLACE FUNCTION public.platform_rubric_templates()
RETURNS TABLE (
  id uuid, name text, description text, published boolean,
  criteria bigint, max_points bigint, assignments bigint, schools bigint,
  created_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_platform_admin();
  RETURN QUERY
  SELECT r.id, r.name::text, r.description::text, r.is_programme_template,
         (SELECT count(*) FROM public.rubric_criteria c WHERE c.rubric_id = r.id),
         (SELECT coalesce(sum(m.top), 0)::bigint FROM (
            SELECT max(l.points) AS top FROM public.rubric_criteria c
            JOIN public.rubric_levels l ON l.criterion_id = c.id
            WHERE c.rubric_id = r.id GROUP BY c.id) m),
         (SELECT count(*) FROM public.assignments a WHERE a.rubric ->> 'id' = r.id::text),
         (SELECT count(DISTINCT cl.institution_id) FROM public.assignments a
          JOIN public.classes cl ON cl.id = a.class_id
          WHERE a.rubric ->> 'id' = r.id::text),
         r.created_at
  FROM public.rubrics r
  WHERE r.is_programme_template OR r.teacher_id = auth.uid()
  ORDER BY r.is_programme_template DESC, r.name;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_set_programme_template(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_rubric_templates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_programme_template(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_rubric_templates() TO authenticated;

-- =============================================================================
-- 2. Revision loop
-- =============================================================================
ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_status_check;
ALTER TABLE public.submissions ADD CONSTRAINT submissions_status_check
  CHECK (status IN ('draft', 'submitted', 'revision_requested', 'graded'));

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS revision_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revision_requested_at timestamptz;

-- Same rules as 20260930120000 for grading fields, plus the workflow:
--   student: may edit only while draft, submitted or revision_requested,
--            and may only set draft or submitted; resubmitting after a
--            revision request counts a round.
--   teacher: may set any status; asking for a revision stamps the time.
CREATE OR REPLACE FUNCTION app_private.guard_submission_grading()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF app_private.is_trusted_caller() OR app_private.teaches_assignment(NEW.assignment_id) THEN
    IF NEW.status = 'revision_requested'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'revision_requested') THEN
      NEW.revision_requested_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.grade IS NOT NULL OR NEW.feedback IS NOT NULL OR NEW.graded_at IS NOT NULL
       OR NEW.graded_by IS NOT NULL OR NEW.rubric_scores IS NOT NULL
       OR NEW.status NOT IN ('draft', 'submitted')
       OR NEW.revision_count <> 0 OR NEW.revision_requested_at IS NOT NULL THEN
      RAISE EXCEPTION 'Only the teacher can grade a submission' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN
    RAISE EXCEPTION 'Cannot move a submission to another student or assignment'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'graded' THEN
    RAISE EXCEPTION 'This work has been graded and can no longer be changed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.grade IS DISTINCT FROM OLD.grade
     OR NEW.feedback IS DISTINCT FROM OLD.feedback
     OR NEW.graded_at IS DISTINCT FROM OLD.graded_at
     OR NEW.graded_by IS DISTINCT FROM OLD.graded_by
     OR NEW.rubric_scores IS DISTINCT FROM OLD.rubric_scores
     OR NEW.revision_requested_at IS DISTINCT FROM OLD.revision_requested_at
     OR NEW.status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Only the teacher can grade a submission' USING ERRCODE = '42501';
  END IF;

  -- Resubmitting after a revision request: count the round (students can't
  -- set the counter themselves).
  NEW.revision_count := OLD.revision_count
    + CASE WHEN OLD.status = 'revision_requested' AND NEW.status = 'submitted' THEN 1 ELSE 0 END;
  RETURN NEW;
END;
$$;

-- Tell the student when their teacher asks for changes.
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
    'enrollment_declined',
    'enrollment_requested',
    'revision_requested',
    'role_changed',
    'system_message'
  )
);

CREATE OR REPLACE FUNCTION app_private.notify_revision_requested()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_title text;
BEGIN
  IF NEW.status = 'revision_requested'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'revision_requested') THEN
    SELECT title INTO v_title FROM public.assignments WHERE id = NEW.assignment_id;
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, action_url, action_label, metadata)
    VALUES (
      NEW.student_id, 'revision_requested',
      left('Changes requested: ' || coalesce(v_title, 'your assignment'), 255),
      coalesce(nullif(left(NEW.feedback, 500), ''), 'Your teacher asked you to revise and resubmit this work.'),
      'high',
      '/dashboard/student/assignments/' || NEW.assignment_id || '/submit',
      'Revise and resubmit',
      jsonb_build_object('assignment_id', NEW.assignment_id, 'submission_id', NEW.id)
    );
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION app_private.notify_revision_requested() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_revision_requested ON public.submissions;
CREATE TRIGGER notify_revision_requested
  AFTER INSERT OR UPDATE OF status ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION app_private.notify_revision_requested();

NOTIFY pgrst, 'reload schema';

COMMIT;
