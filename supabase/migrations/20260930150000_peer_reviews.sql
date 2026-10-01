-- =============================================================================
-- Peer reviews: server-side pairing, anonymity, and locked-down access
-- =============================================================================
-- Before: teachers created peer-review assignments, but the pairing insert ran
-- as the teacher and the only INSERT rule on peer_reviews required the caller
-- to be the reviewer or reviewee, so no review was ever created. Students
-- couldn't read peer_review_assignments at all, a reviewee could edit reviews
-- written about them, and anonymity ("anonymous" hides the reviewer, "blind"
-- hides the author) couldn't be enforced because both user ids were readable.
--
-- After:
--   * Teachers manage their peer-review assignments and moderate the reviews
--     in them directly (RLS).
--   * Students have NO direct access to peer_reviews / peer_review_assignments.
--     Everything goes through the SECURITY DEFINER functions below, which
--     return only what that student may see and validate every write.
--   * publish_peer_review() pairs every student who submitted the assignment
--     in a balanced circle: each reviews k peers and is reviewed by k peers.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Data fixes
-- -----------------------------------------------------------------------------

-- The teacher form offers 1-3, 1-5 and 1-10 rating scales, but ratings were
-- capped at 5. save_peer_review() enforces each assignment's own scale.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.peer_reviews'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%overall_rating%'
  LOOP
    EXECUTE format('ALTER TABLE public.peer_reviews DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.peer_reviews ADD CONSTRAINT peer_reviews_overall_rating_check
  CHECK (overall_rating IS NULL OR overall_rating BETWEEN 1 AND 10);

-- Peer reviews "published" by the old client-side pairing ended up active with
-- no reviews (the pairing insert always failed). Put them back to draft so the
-- teacher can publish them properly, and drop end dates that have already
-- passed (publishing with a past deadline would lock students out).
UPDATE public.peer_review_assignments pra
SET status = 'draft',
    end_date = CASE WHEN pra.end_date < now() THEN NULL ELSE pra.end_date END,
    updated_at = now()
WHERE pra.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM public.peer_reviews pr WHERE pr.peer_review_assignment_id = pra.id);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_private.owns_peer_review_assignment(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.peer_review_assignments
    WHERE id = p_id AND teacher_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION app_private.participates_in_peer_review(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.peer_reviews
    WHERE peer_review_assignment_id = p_id
      AND (reviewer_id = auth.uid() OR reviewee_id = auth.uid())
  )
$$;

REVOKE ALL ON FUNCTION app_private.owns_peer_review_assignment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.participates_in_peer_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.owns_peer_review_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.participates_in_peer_review(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Policies
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('peer_review_assignments', 'peer_reviews', 'peer_review_activity')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

ALTER TABLE public.peer_review_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_review_activity ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.peer_review_assignments, public.peer_reviews, public.peer_review_activity FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES
  ON public.peer_review_assignments, public.peer_reviews, public.peer_review_activity
  FROM authenticated;

-- Teachers: their own peer-review assignments, for an assignment in a class
-- they teach.
CREATE POLICY peer_review_assignments_teacher ON public.peer_review_assignments
  FOR ALL TO authenticated
  USING (teacher_id = (SELECT auth.uid()))
  WITH CHECK (
    teacher_id = (SELECT auth.uid())
    AND app_private.teaches_class(class_id)
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id AND a.class_id = peer_review_assignments.class_id
    )
  );

-- Teachers: see and moderate (flag, reset, delete) reviews in their own
-- peer-review assignments. Pairs are only created by publish_peer_review().
CREATE POLICY peer_reviews_teacher_select ON public.peer_reviews
  FOR SELECT TO authenticated
  USING (app_private.owns_peer_review_assignment(peer_review_assignment_id));

CREATE POLICY peer_reviews_teacher_update ON public.peer_reviews
  FOR UPDATE TO authenticated
  USING (app_private.owns_peer_review_assignment(peer_review_assignment_id))
  WITH CHECK (app_private.owns_peer_review_assignment(peer_review_assignment_id));

CREATE POLICY peer_reviews_teacher_delete ON public.peer_reviews
  FOR DELETE TO authenticated
  USING (app_private.owns_peer_review_assignment(peer_review_assignment_id));

CREATE POLICY peer_review_activity_select ON public.peer_review_activity
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR app_private.owns_peer_review_assignment(peer_review_assignment_id)
  );

CREATE POLICY peer_review_activity_insert ON public.peer_review_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      app_private.owns_peer_review_assignment(peer_review_assignment_id)
      OR app_private.participates_in_peer_review(peer_review_assignment_id)
    )
  );

-- Reviewers now read the submission through get_peer_review() (which hides the
-- author in blind mode), so they no longer get direct SELECT on submissions:
-- that exposed student_id.
DROP POLICY IF EXISTS submissions_select ON public.submissions;
CREATE POLICY submissions_select ON public.submissions
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR app_private.teaches_assignment(assignment_id)
  );

-- -----------------------------------------------------------------------------
-- Teacher: publish (pair students and activate)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_peer_review(p_peer_review_assignment_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pra public.peer_review_assignments%ROWTYPE;
  v_n integer;
  v_k integer;
  v_created integer;
BEGIN
  SELECT * INTO v_pra
  FROM public.peer_review_assignments
  WHERE id = p_peer_review_assignment_id
  FOR UPDATE;

  IF NOT FOUND OR v_pra.teacher_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Peer review not found' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.peer_reviews WHERE peer_review_assignment_id = v_pra.id) THEN
    RAISE EXCEPTION 'This peer review has already been published' USING ERRCODE = '23505';
  END IF;

  IF v_pra.end_date IS NOT NULL AND v_pra.end_date < now() THEN
    RAISE EXCEPTION 'The end date for this peer review has already passed' USING ERRCODE = '22023';
  END IF;

  -- Participants: students currently in the class who submitted the work.
  CREATE TEMP TABLE _pr_participants ON COMMIT DROP AS
  SELECT s.student_id, s.id AS submission_id,
         (row_number() OVER (ORDER BY random()))::integer - 1 AS pos
  FROM public.submissions s
  JOIN public.enrollments e
    ON e.student_id = s.student_id
   AND e.class_id = v_pra.class_id
   AND e.status IN ('enrolled', 'active')
  WHERE s.assignment_id = v_pra.assignment_id
    AND s.status IN ('submitted', 'graded');

  SELECT count(*) INTO v_n FROM _pr_participants;
  IF v_n < 2 THEN
    DROP TABLE _pr_participants;
    RAISE EXCEPTION 'At least 2 students must submit this assignment before peer review can start (% so far)', v_n
      USING ERRCODE = '22023';
  END IF;

  v_k := least(greatest(coalesce(v_pra.reviews_per_student, 2), 1), v_n - 1);

  -- Balanced circle: the student at position i reviews positions i+1..i+k.
  INSERT INTO public.peer_reviews
    (peer_review_assignment_id, reviewer_id, reviewee_id, submission_id, status)
  SELECT v_pra.id, r.student_id, t.student_id, t.submission_id, 'pending'
  FROM _pr_participants r
  CROSS JOIN generate_series(1, v_k) AS g(k)
  JOIN _pr_participants t ON t.pos = (r.pos + g.k) % v_n;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  DROP TABLE _pr_participants;

  UPDATE public.peer_review_assignments
  SET status = 'active',
      start_date = coalesce(start_date, now()),
      updated_at = now()
  WHERE id = v_pra.id;

  INSERT INTO public.peer_review_activity (peer_review_assignment_id, user_id, activity_type, details)
  VALUES (v_pra.id, v_uid, 'assignment_published',
          json_build_object('students', v_n, 'reviews_per_student', v_k)::jsonb);

  RETURN json_build_object('students', v_n, 'reviews_per_student', v_k, 'reviews_created', v_created);
END;
$$;

-- -----------------------------------------------------------------------------
-- Students: read what they may see
-- -----------------------------------------------------------------------------

-- Reviews I have to write. Author hidden for "blind" reviews.
CREATE OR REPLACE FUNCTION public.get_my_peer_review_tasks()
RETURNS TABLE (
  id uuid,
  status text,
  time_spent integer,
  peer_review_assignment_id uuid,
  title text,
  end_date timestamptz,
  author_name text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.id, pr.status, coalesce(pr.time_spent, 0), a.id, a.title, a.end_date,
         CASE WHEN a.review_type = 'blind' THEN NULL
              ELSE nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '')
         END
  FROM public.peer_reviews pr
  JOIN public.peer_review_assignments a ON a.id = pr.peer_review_assignment_id
  LEFT JOIN public.users u ON u.id = pr.reviewee_id
  WHERE pr.reviewer_id = auth.uid()
    AND a.status IN ('active', 'completed')
  ORDER BY a.end_date NULLS LAST, pr.created_at
$$;

-- Completed reviews of my work. Reviewer hidden for "anonymous" reviews.
CREATE OR REPLACE FUNCTION public.get_my_received_peer_reviews()
RETURNS TABLE (
  id uuid,
  assignment_title text,
  reviewer_name text,
  submitted_at timestamptz,
  overall_rating integer,
  rating_scale integer,
  feedback jsonb,
  helpfulness_rating integer
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.id, a.title,
         CASE WHEN a.review_type = 'anonymous' THEN NULL
              ELSE nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '')
         END,
         pr.submitted_at, pr.overall_rating,
         coalesce((a.settings->>'rating_scale')::integer, 5),
         pr.feedback, pr.helpfulness_rating
  FROM public.peer_reviews pr
  JOIN public.peer_review_assignments a ON a.id = pr.peer_review_assignment_id
  LEFT JOIN public.users u ON u.id = pr.reviewer_id
  WHERE pr.reviewee_id = auth.uid()
    AND pr.status = 'completed'
  ORDER BY pr.submitted_at DESC
$$;

-- One review I'm writing, with the work to review.
CREATE OR REPLACE FUNCTION public.get_peer_review(p_review_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'id', pr.id,
    'status', pr.status,
    'overall_rating', pr.overall_rating,
    'feedback', pr.feedback,
    'time_spent', coalesce(pr.time_spent, 0),
    'submitted_at', pr.submitted_at,
    'peer_review_assignment', json_build_object(
      'id', a.id,
      'title', a.title,
      'instructions', a.instructions,
      'review_type', a.review_type,
      'settings', a.settings,
      'end_date', a.end_date
    ),
    'submission', json_build_object(
      'id', s.id,
      'assignment_title', asg.title,
      'content', s.content,
      'file_url', s.file_url,
      'link_url', s.link_url
    ),
    'author_name', CASE WHEN a.review_type = 'blind' THEN NULL
                        ELSE nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '')
                   END
  ) INTO v_result
  FROM public.peer_reviews pr
  JOIN public.peer_review_assignments a ON a.id = pr.peer_review_assignment_id
  LEFT JOIN public.submissions s ON s.id = pr.submission_id
  LEFT JOIN public.assignments asg ON asg.id = a.assignment_id
  LEFT JOIN public.users u ON u.id = pr.reviewee_id
  WHERE pr.id = p_review_id
    AND pr.reviewer_id = auth.uid()
    AND a.status IN ('active', 'completed');

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Peer review not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- Students: write
-- -----------------------------------------------------------------------------

-- Save a draft (p_submit = false) or submit (p_submit = true). Only the
-- reviewer, only while the peer review is open, and not after submitting.
-- p_minutes is time spent since the last save (clamped to 0-120).
CREATE OR REPLACE FUNCTION public.save_peer_review(
  p_review_id uuid,
  p_overall_rating integer,
  p_feedback jsonb,
  p_minutes integer,
  p_submit boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pr public.peer_reviews%ROWTYPE;
  v_a public.peer_review_assignments%ROWTYPE;
  v_scale integer;
BEGIN
  SELECT * INTO v_pr FROM public.peer_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND OR v_pr.reviewer_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Peer review not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_a FROM public.peer_review_assignments WHERE id = v_pr.peer_review_assignment_id;
  IF v_a.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'This peer review is not open' USING ERRCODE = '22023';
  END IF;
  IF v_a.end_date IS NOT NULL AND now() > v_a.end_date THEN
    RAISE EXCEPTION 'The deadline for this peer review has passed' USING ERRCODE = '22023';
  END IF;
  IF v_pr.status = 'completed' THEN
    RAISE EXCEPTION 'This review has already been submitted' USING ERRCODE = '22023';
  END IF;

  v_scale := coalesce((v_a.settings->>'rating_scale')::integer, 5);
  IF p_overall_rating IS NOT NULL AND (p_overall_rating < 1 OR p_overall_rating > v_scale) THEN
    RAISE EXCEPTION 'Rating must be between 1 and %', v_scale USING ERRCODE = '22023';
  END IF;

  IF p_submit THEN
    IF coalesce((v_a.settings->>'require_rating')::boolean, false) AND p_overall_rating IS NULL THEN
      RAISE EXCEPTION 'Please provide a rating before submitting' USING ERRCODE = '22023';
    END IF;
    IF coalesce(trim(p_feedback->>'overall_comments'), '') = '' THEN
      RAISE EXCEPTION 'Please provide overall comments before submitting' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.peer_reviews
  SET status = CASE WHEN p_submit THEN 'completed' ELSE 'in_progress' END,
      overall_rating = p_overall_rating,
      feedback = coalesce(p_feedback, '{}'::jsonb),
      time_spent = coalesce(time_spent, 0) + least(greatest(coalesce(p_minutes, 0), 0), 120),
      submitted_at = CASE WHEN p_submit THEN now() ELSE submitted_at END,
      updated_at = now()
  WHERE id = v_pr.id;

  IF p_submit THEN
    INSERT INTO public.peer_review_activity
      (peer_review_assignment_id, peer_review_id, user_id, activity_type, details)
    VALUES (v_a.id, v_pr.id, v_uid, 'review_submitted',
            json_build_object('rating', p_overall_rating)::jsonb);
  END IF;
END;
$$;

-- The author rates how helpful a review of their work was (1-5).
CREATE OR REPLACE FUNCTION public.rate_peer_review_helpfulness(p_review_id uuid, p_rating integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5' USING ERRCODE = '22023';
  END IF;

  UPDATE public.peer_reviews
  SET helpfulness_rating = p_rating, updated_at = now()
  WHERE id = p_review_id
    AND reviewee_id = auth.uid()
    AND status = 'completed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Peer review not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_peer_review(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_peer_review_tasks() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_received_peer_reviews() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_peer_review(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_peer_review(uuid, integer, jsonb, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rate_peer_review_helpfulness(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_peer_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_peer_review_tasks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_received_peer_reviews() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_peer_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_peer_review(uuid, integer, jsonb, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rate_peer_review_helpfulness(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
