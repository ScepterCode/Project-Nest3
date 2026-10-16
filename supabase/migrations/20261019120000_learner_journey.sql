-- =============================================================================
-- Learner journey: stage, consent, portfolio, nominations, cohort groups
-- =============================================================================
-- 1. learner_profiles: each learner's stage (foundation -> mentorship ->
--    fellowship -> alumni) and guardian consent (recorded by their school
--    admin or a platform admin; changes logged).
-- 2. learner_portfolio(): all of a learner's work across classes (grades,
--    feedback, revision rounds, featured work), attendance and nominations,
--    for the learner, their tutors, their school admin and platform admins.
--    Tutors mark work as featured for showcase consideration.
-- 3. Nominations: a tutor or school admin nominates a learner for
--    mentorship or fellowship; platform admins review with the learner's
--    results alongside. Approving needs consent 'granted' and moves the
--    stage. Learner and nominator are notified.
-- 4. Programme mentors (chosen by platform admins) can make a class a
--    mentorship or fellowship group; only learners at that stage or beyond
--    can ask to join, from any school.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Learner profile: stage and consent
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.learner_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'foundation'
    CHECK (stage IN ('foundation', 'mentorship', 'fellowship', 'alumni')),
  consent_status text NOT NULL DEFAULT 'not_recorded'
    CHECK (consent_status IN ('not_recorded', 'granted', 'withdrawn')),
  consent_note text CHECK (consent_note IS NULL OR length(consent_note) <= 500),
  consent_recorded_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  consent_recorded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.learner_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learner_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.learner_profiles TO authenticated;

-- Readable by the learner, their tutors and their school's admins. Writes
-- only through the functions below.
DROP POLICY IF EXISTS learner_profiles_select ON public.learner_profiles;
CREATE POLICY learner_profiles_select ON public.learner_profiles
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR user_id IN (SELECT app_private.my_student_ids())
    OR EXISTS (SELECT 1 FROM public.users u
               WHERE u.id = learner_profiles.user_id
                 AND u.institution_id IS NOT NULL
                 AND u.institution_id = (SELECT app_private.my_admin_institution_id()))
  );

CREATE OR REPLACE FUNCTION app_private.learner_stage(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT stage FROM public.learner_profiles WHERE user_id = p_user), 'foundation')
$$;

-- Who may see a learner's portfolio: themselves, a tutor of a class they're
-- in, their school's admin, or a platform admin with two-factor.
CREATE OR REPLACE FUNCTION app_private.can_view_learner(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_user = auth.uid()
    OR EXISTS (SELECT 1 FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id
               WHERE e.student_id = p_user AND c.teacher_id = auth.uid()
                 AND e.status IN ('enrolled', 'active'))
    OR EXISTS (SELECT 1 FROM public.users u
               WHERE u.id = p_user AND u.institution_id IS NOT NULL
                 AND u.institution_id = app_private.my_admin_institution_id())
    OR app_private.is_platform_admin()
$$;

-- Guardian consent is recorded by the learner's school admin or a platform
-- admin. Every change is kept in the platform activity log.
CREATE OR REPLACE FUNCTION public.set_learner_consent(p_student uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school uuid;
BEGIN
  IF p_status NOT IN ('not_recorded', 'granted', 'withdrawn') THEN
    RAISE EXCEPTION 'Unknown consent status %', p_status USING ERRCODE = '22023';
  END IF;
  SELECT institution_id INTO v_school FROM public.users WHERE id = p_student AND role = 'student';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found' USING ERRCODE = 'P0002';
  END IF;
  -- coalesce: for anyone who isn't a school admin the comparison is NULL,
  -- and NOT NULL would let them through.
  IF NOT coalesce(app_private.is_platform_admin()
                  OR (v_school IS NOT NULL AND v_school = app_private.my_admin_institution_id()), false) THEN
    RAISE EXCEPTION 'Consent is recorded by the learner''s school admin or a platform admin'
      USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.learner_profiles (user_id, consent_status, consent_note, consent_recorded_by, consent_recorded_at)
  VALUES (p_student, p_status, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET consent_status = EXCLUDED.consent_status,
        consent_note = EXCLUDED.consent_note,
        consent_recorded_by = EXCLUDED.consent_recorded_by,
        consent_recorded_at = EXCLUDED.consent_recorded_at,
        updated_at = now();
  PERFORM app_private.log_platform_action('consent_recorded', 'user', p_student::text,
    jsonb_build_object('status', p_status));
END;
$$;

-- Featured work (for showcase consideration): the tutor marks it.
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS portfolio_featured boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION app_private.guard_featured_work()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.portfolio_featured IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN false ELSE OLD.portfolio_featured END)
     AND NOT (app_private.is_trusted_caller() OR app_private.teaches_assignment(NEW.assignment_id)) THEN
    RAISE EXCEPTION 'Only the tutor can feature work' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_featured_work() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_featured_work ON public.submissions;
CREATE TRIGGER guard_featured_work
  BEFORE INSERT OR UPDATE OF portfolio_featured ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_featured_work();

-- =============================================================================
-- 2. Portfolio
-- =============================================================================
CREATE OR REPLACE FUNCTION public.learner_portfolio(p_student uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_result json;
BEGIN
  IF NOT app_private.can_view_learner(p_student) THEN
    RAISE EXCEPTION 'You can''t view this portfolio' USING ERRCODE = '42501';
  END IF;
  SELECT json_build_object(
    'learner', (
      SELECT json_build_object(
        'id', u.id,
        'name', nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
        'email', u.email,
        'school', i.name,
        'stage', coalesce(p.stage, 'foundation'),
        'consent_status', coalesce(p.consent_status, 'not_recorded'),
        'consent_note', p.consent_note,
        'consent_recorded_at', p.consent_recorded_at,
        'joined', u.created_at)
      FROM public.users u
      LEFT JOIN public.institutions i ON i.id = u.institution_id
      LEFT JOIN public.learner_profiles p ON p.user_id = u.id
      WHERE u.id = p_student),
    'work', (
      SELECT coalesce(json_agg(json_build_object(
        'submission_id', s.id,
        'assignment_id', a.id,
        'assignment', a.title,
        'class', c.name,
        'class_id', c.id,
        'tutor_id', c.teacher_id,
        'due_date', a.due_date,
        'submitted_at', s.submitted_at,
        'status', s.status,
        'grade', s.grade,
        'points_possible', a.points_possible,
        'feedback', s.feedback,
        'revision_count', s.revision_count,
        'link_url', s.link_url,
        'file_url', s.file_url,
        'featured', s.portfolio_featured
      ) ORDER BY s.submitted_at DESC), '[]'::json)
      FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      JOIN public.classes c ON c.id = a.class_id
      WHERE s.student_id = p_student AND s.status <> 'draft'),
    'attendance', (
      SELECT coalesce(json_agg(json_build_object(
        'class', t.class_name, 'attended', t.attended, 'counted', t.counted)), '[]'::json)
      FROM (
        SELECT c.name AS class_name,
               count(*) FILTER (WHERE a.status IN ('present', 'late')) AS attended,
               count(*) FILTER (WHERE a.status <> 'excused') AS counted
        FROM public.session_attendance a
        JOIN public.class_sessions cs ON cs.id = a.session_id
        JOIN public.classes c ON c.id = cs.class_id
        WHERE a.student_id = p_student
        GROUP BY c.name) t),
    'nominations', (
      SELECT coalesce(json_agg(json_build_object(
        'id', n.id, 'target_stage', n.target_stage, 'status', n.status,
        'reason', n.reason, 'review_note', n.review_note, 'created_at', n.created_at,
        'nominated_by', nullif(btrim(coalesce(nb.first_name, '') || ' ' || coalesce(nb.last_name, '')), ''))
        ORDER BY n.created_at DESC), '[]'::json)
      FROM public.cohort_nominations n
      LEFT JOIN public.users nb ON nb.id = n.nominated_by
      WHERE n.student_id = p_student)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- =============================================================================
-- 3. Nominations
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cohort_nominations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  target_stage text NOT NULL CHECK (target_stage IN ('mentorship', 'fellowship')),
  nominated_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn')),
  reviewed_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS cohort_nominations_one_pending
  ON public.cohort_nominations (student_id, target_stage) WHERE status = 'pending';
ALTER TABLE public.cohort_nominations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cohort_nominations FROM PUBLIC, anon;
GRANT SELECT ON public.cohort_nominations TO authenticated;

DROP POLICY IF EXISTS cohort_nominations_select ON public.cohort_nominations;
CREATE POLICY cohort_nominations_select ON public.cohort_nominations
  FOR SELECT TO authenticated
  USING (nominated_by = (SELECT auth.uid()) OR app_private.can_view_learner(student_id));

-- A tutor of the learner, or their school's admin, nominates them for the
-- next stage. Platform admins are told.
CREATE OR REPLACE FUNCTION public.nominate_learner(p_student uuid, p_stage text, p_reason text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_name text;
  v_school text;
  v_current text := app_private.learner_stage(p_student);
BEGIN
  IF p_stage NOT IN ('mentorship', 'fellowship') THEN
    RAISE EXCEPTION 'Nominate for mentorship or fellowship' USING ERRCODE = '22023';
  END IF;
  IF p_student = auth.uid() OR NOT app_private.can_view_learner(p_student)
     OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()
                    AND role IN ('teacher', 'institution_admin', 'system_admin')) THEN
    RAISE EXCEPTION 'Only the learner''s tutors or school admin can nominate them' USING ERRCODE = '42501';
  END IF;
  IF (p_stage = 'mentorship' AND v_current <> 'foundation')
     OR (p_stage = 'fellowship' AND v_current NOT IN ('foundation', 'mentorship')) THEN
    RAISE EXCEPTION 'This learner is already at the % stage', v_current USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'Say why you are nominating them (at least a sentence)' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.cohort_nominations (student_id, target_stage, nominated_by, reason)
  VALUES (p_student, p_stage, auth.uid(), btrim(p_reason))
  RETURNING id INTO v_id;

  SELECT coalesce(nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''), u.email), i.name
  INTO v_name, v_school
  FROM public.users u LEFT JOIN public.institutions i ON i.id = u.institution_id
  WHERE u.id = p_student;

  INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
  SELECT a.id, 'nomination_submitted',
         left(v_name || ' nominated for ' || p_stage, 255),
         coalesce(v_school || ': ', '') || left(btrim(p_reason), 300),
         'medium', '/dashboard/platform/nominations', 'Review',
         jsonb_build_object('nomination_id', v_id, 'student_id', p_student)
  FROM public.users a WHERE a.role = 'system_admin';
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'This learner already has a nomination waiting for review' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_nominations(p_status text DEFAULT 'pending')
RETURNS TABLE (
  id uuid, student_id uuid, student_name text, school_name text,
  current_stage text, target_stage text, consent_status text,
  nominated_by_name text, reason text, status text, review_note text,
  created_at timestamptz, reviewed_at timestamptz,
  submissions bigint, average_grade numeric, attendance_rate numeric, revision_rounds bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_platform_admin();
  RETURN QUERY
  SELECT n.id, n.student_id,
         coalesce(nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''), u.email)::text,
         i.name::text,
         app_private.learner_stage(n.student_id), n.target_stage,
         coalesce(p.consent_status, 'not_recorded'),
         nullif(btrim(coalesce(nb.first_name, '') || ' ' || coalesce(nb.last_name, '')), ''),
         n.reason, n.status, n.review_note, n.created_at, n.reviewed_at,
         (SELECT count(*) FROM public.submissions s WHERE s.student_id = n.student_id AND s.status <> 'draft'),
         (SELECT round(avg(100.0 * s.grade / nullif(a.points_possible, 0)), 1)
          FROM public.submissions s JOIN public.assignments a ON a.id = s.assignment_id
          WHERE s.student_id = n.student_id AND s.grade IS NOT NULL),
         (SELECT round(100.0 * count(*) FILTER (WHERE sa.status IN ('present', 'late'))
                       / nullif(count(*) FILTER (WHERE sa.status <> 'excused'), 0), 1)
          FROM public.session_attendance sa WHERE sa.student_id = n.student_id),
         (SELECT coalesce(sum(s.revision_count), 0)::bigint FROM public.submissions s WHERE s.student_id = n.student_id)
  FROM public.cohort_nominations n
  JOIN public.users u ON u.id = n.student_id
  LEFT JOIN public.institutions i ON i.id = u.institution_id
  LEFT JOIN public.learner_profiles p ON p.user_id = n.student_id
  LEFT JOIN public.users nb ON nb.id = n.nominated_by
  WHERE p_status IS NULL OR n.status = p_status
  ORDER BY n.created_at;
END;
$$;

-- Approving moves the learner to the stage; it needs recorded consent.
CREATE OR REPLACE FUNCTION public.platform_review_nomination(p_nomination uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_n public.cohort_nominations%ROWTYPE;
  v_consent text;
  v_name text;
BEGIN
  PERFORM app_private.require_platform_admin();
  SELECT * INTO v_n FROM public.cohort_nominations WHERE id = p_nomination FOR UPDATE;
  IF NOT FOUND OR v_n.status <> 'pending' THEN
    RAISE EXCEPTION 'That nomination is not waiting for review' USING ERRCODE = 'P0002';
  END IF;
  SELECT coalesce(consent_status, 'not_recorded') INTO v_consent
  FROM public.learner_profiles WHERE user_id = v_n.student_id;
  IF p_approve AND coalesce(v_consent, 'not_recorded') <> 'granted' THEN
    RAISE EXCEPTION 'Guardian consent must be recorded as granted before this learner can progress'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.cohort_nominations
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END,
      reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = nullif(btrim(coalesce(p_note, '')), '')
  WHERE id = p_nomination;

  IF p_approve THEN
    INSERT INTO public.learner_profiles (user_id, stage) VALUES (v_n.student_id, v_n.target_stage)
    ON CONFLICT (user_id) DO UPDATE SET stage = EXCLUDED.stage, updated_at = now();
  END IF;

  SELECT coalesce(nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), email)
  INTO v_name FROM public.users WHERE id = v_n.student_id;

  -- The learner hears good news; the nominator hears either way.
  IF p_approve THEN
    INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, metadata)
    VALUES (v_n.student_id, 'nomination_decided',
            'You have been selected for ' || v_n.target_stage,
            'Congratulations! Your work earned you a place in the ' || v_n.target_stage || ' stage.',
            'high', '/dashboard/portfolio/' || v_n.student_id,
            jsonb_build_object('nomination_id', v_n.id));
  END IF;
  IF v_n.nominated_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, metadata)
    VALUES (v_n.nominated_by, 'nomination_decided',
            left(v_name || ': ' || v_n.target_stage || ' nomination ' || CASE WHEN p_approve THEN 'approved' ELSE 'declined' END, 255),
            coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'No note was added.'),
            'medium', '/dashboard/portfolio/' || v_n.student_id,
            jsonb_build_object('nomination_id', v_n.id));
  END IF;

  PERFORM app_private.log_platform_action(
    CASE WHEN p_approve THEN 'nomination_approved' ELSE 'nomination_declined' END,
    'nomination', p_nomination::text,
    jsonb_build_object('student', v_n.student_id, 'stage', v_n.target_stage));
END;
$$;

-- =============================================================================
-- 4. Mentors and cohort groups
-- =============================================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_programme_mentor boolean NOT NULL DEFAULT false;
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS cohort_stage text CHECK (cohort_stage IS NULL OR cohort_stage IN ('mentorship', 'fellowship'));

-- Only mentors make a class a cohort group; only platform admins make
-- mentors.
CREATE OR REPLACE FUNCTION app_private.guard_cohort_class()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.cohort_stage IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.cohort_stage END)
     AND NOT (app_private.is_trusted_caller() OR app_private.is_platform_admin()
              OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_programme_mentor)) THEN
    RAISE EXCEPTION 'Only programme mentors run mentorship or fellowship groups' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_cohort_class ON public.classes;
CREATE TRIGGER guard_cohort_class
  BEFORE INSERT OR UPDATE OF cohort_stage ON public.classes
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_cohort_class();

CREATE OR REPLACE FUNCTION app_private.guard_mentor_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.is_programme_mentor IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN false ELSE OLD.is_programme_mentor END)
     AND NOT (app_private.is_trusted_caller() OR app_private.is_platform_admin()) THEN
    RAISE EXCEPTION 'Only platform admins choose programme mentors' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_mentor_flag ON public.users;
CREATE TRIGGER guard_mentor_flag
  BEFORE INSERT OR UPDATE OF is_programme_mentor ON public.users
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_mentor_flag();

CREATE OR REPLACE FUNCTION public.platform_set_mentor(p_user uuid, p_mentor boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_platform_admin();
  UPDATE public.users SET is_programme_mentor = p_mentor, updated_at = now()
  WHERE id = p_user AND role = 'teacher';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only tutors can be programme mentors' USING ERRCODE = '22023';
  END IF;
  PERFORM app_private.log_platform_action(
    CASE WHEN p_mentor THEN 'mentor_added' ELSE 'mentor_removed' END, 'user', p_user::text, '{}'::jsonb);
END;
$$;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.set_learner_consent(uuid, text, text)',
    'public.learner_portfolio(uuid)',
    'public.nominate_learner(uuid, text, text)',
    'public.platform_nominations(text)',
    'public.platform_review_nomination(uuid, boolean, text)',
    'public.platform_set_mentor(uuid, boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION app_private.learner_stage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.can_view_learner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.can_view_learner(uuid) TO authenticated;
REVOKE ALL ON FUNCTION app_private.guard_cohort_class() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.guard_mentor_flag() FROM PUBLIC, anon, authenticated;

-- People search: same as 20261016120000, plus mentor flag and learner stage.
DROP FUNCTION IF EXISTS public.platform_search_people(text, integer);
CREATE OR REPLACE FUNCTION public.platform_search_people(p_query text, p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid, email text, name text, role text, school_id uuid, school_name text,
  last_sign_in_at timestamptz, email_confirmed boolean, disabled boolean,
  created_at timestamptz, is_programme_mentor boolean, stage text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_term text := '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
BEGIN
  PERFORM app_private.require_platform_admin();
  RETURN QUERY
  SELECT u.id, u.email::text,
         nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
         u.role::text, u.institution_id, i.name::text,
         au.last_sign_in_at, au.email_confirmed_at IS NOT NULL,
         coalesce(au.banned_until > now(), false),
         u.created_at, u.is_programme_mentor,
         CASE WHEN u.role = 'student' THEN app_private.learner_stage(u.id) END
  FROM public.users u
  LEFT JOIN auth.users au ON au.id = u.id
  LEFT JOIN public.institutions i ON i.id = u.institution_id
  WHERE u.email ILIKE v_term
     OR (coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) ILIKE v_term
  ORDER BY u.last_name NULLS LAST, u.first_name NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
END;
$$;
REVOKE ALL ON FUNCTION public.platform_search_people(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_search_people(text, integer) TO authenticated;

-- New notification types.
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
    'nomination_submitted',
    'nomination_decided',
    'role_changed',
    'system_message'
  )
);


-- =============================================================================
-- join_class_by_code: same as 20261014120000, plus the cohort stage check.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.join_class_by_code(p_code text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_class public.classes%ROWTYPE;
  v_enrollment public.enrollments%ROWTYPE;
  v_has_enrollment boolean;
  v_teacher_name text;
  v_student_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join a class' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_class
  FROM public.classes
  WHERE code = upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'))
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active class found with that code' USING ERRCODE = 'P0002';
  END IF;

  IF v_class.teacher_id = v_uid THEN
    RAISE EXCEPTION 'You teach this class' USING ERRCODE = '22023';
  END IF;

  -- Mentorship and fellowship groups are for learners selected for them.
  IF v_class.cohort_stage IS NOT NULL
     AND array_position(ARRAY['foundation', 'mentorship', 'fellowship', 'alumni'], app_private.learner_stage(v_uid))
       < array_position(ARRAY['foundation', 'mentorship', 'fellowship', 'alumni'], v_class.cohort_stage) THEN
    RAISE EXCEPTION 'This group is for learners selected for the % stage', v_class.cohort_stage
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_enrollment
  FROM public.enrollments
  WHERE class_id = v_class.id AND student_id = v_uid;
  v_has_enrollment := FOUND;

  IF v_has_enrollment AND v_enrollment.status IN ('enrolled', 'active') THEN
    RAISE EXCEPTION 'You are already enrolled in this class' USING ERRCODE = '23505';
  END IF;
  IF v_has_enrollment AND v_enrollment.status = 'pending' THEN
    RAISE EXCEPTION 'You have already asked to join this class. Your teacher hasn''t answered yet.'
      USING ERRCODE = '23505';
  END IF;

  IF v_has_enrollment THEN
    -- Asking again after leaving, being removed or being declined.
    UPDATE public.enrollments
    SET status = 'pending', enrolled_at = now(), updated_at = now()
    WHERE id = v_enrollment.id
    RETURNING * INTO v_enrollment;
  ELSE
    INSERT INTO public.enrollments (class_id, student_id, status, enrolled_at)
    VALUES (v_class.id, v_uid, 'pending', now())
    RETURNING * INTO v_enrollment;
  END IF;

  SELECT nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  INTO v_teacher_name
  FROM public.users WHERE id = v_class.teacher_id;

  SELECT coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), email)
  INTO v_student_name
  FROM public.users WHERE id = v_uid;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, action_url, action_label, metadata)
  VALUES (
    v_class.teacher_id,
    'enrollment_requested',
    left(v_student_name || ' asked to join ' || v_class.name, 255),
    'Accept or decline the request on the class''s Students tab.',
    'high',
    '/dashboard/teacher/classes/' || v_class.id || '/manage?tab=students',
    'Review request',
    jsonb_build_object('class_id', v_class.id, 'student_id', v_uid)
  );

  RETURN json_build_object(
    'enrollment_id', v_enrollment.id,
    'class_id', v_class.id,
    'class_name', v_class.name,
    'class_description', v_class.description,
    'teacher_name', v_teacher_name,
    'enrolled_at', v_enrollment.enrolled_at,
    'status', 'pending'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.join_class_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_class_by_code(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
