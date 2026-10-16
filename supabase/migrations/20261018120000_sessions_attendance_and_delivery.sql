-- =============================================================================
-- Class sessions and attendance, tutor delivery metrics, programme viewers
-- =============================================================================
-- 1. Tutors log each class session (date, topic, notes) and mark students
--    present / late / absent / excused. Students see their own attendance.
-- 2. Delivery metrics per tutor, computed here: sessions logged, attendance
--    rate, marking turnaround, work awaiting review and overdue reviews,
--    feedback rate, missed deadlines, and flags for attention.
--      platform admins:  every tutor          (platform_tutor_metrics)
--      school admins:    their school's tutors (school_tutor_metrics)
-- 3. 'programme_viewer': programme staff who see totals, the school
--    comparison and delivery per school, never names, emails or admin
--    tools. Same two-factor rule as platform admins. Platform admins grant
--    it from People.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Sessions and attendance
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes (id) ON DELETE CASCADE,
  held_on date NOT NULL,
  topic text NOT NULL CHECK (length(btrim(topic)) BETWEEN 1 AND 200),
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS class_sessions_class_date_idx ON public.class_sessions (class_id, held_on DESC);

CREATE TABLE IF NOT EXISTS public.session_attendance (
  session_id uuid NOT NULL REFERENCES public.class_sessions (id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('present', 'late', 'absent', 'excused')),
  note text CHECK (note IS NULL OR length(note) <= 500),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS session_attendance_student_idx ON public.session_attendance (student_id);

CREATE OR REPLACE FUNCTION app_private.session_class(p_session uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT class_id FROM public.class_sessions WHERE id = p_session
$$;
GRANT EXECUTE ON FUNCTION app_private.session_class(uuid) TO authenticated;

ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_sessions, public.session_attendance FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_sessions, public.session_attendance TO authenticated;

DROP POLICY IF EXISTS class_sessions_select ON public.class_sessions;
CREATE POLICY class_sessions_select ON public.class_sessions
  FOR SELECT TO authenticated
  USING (
    class_id IN (SELECT app_private.my_taught_class_ids())
    OR class_id IN (SELECT app_private.my_enrolled_class_ids())
    OR class_id IN (SELECT app_private.my_admin_class_ids())
  );

DROP POLICY IF EXISTS class_sessions_write ON public.class_sessions;
CREATE POLICY class_sessions_write ON public.class_sessions
  FOR ALL TO authenticated
  USING (app_private.teaches_class(class_id))
  WITH CHECK (app_private.teaches_class(class_id));

DROP POLICY IF EXISTS session_attendance_select ON public.session_attendance;
CREATE POLICY session_attendance_select ON public.session_attendance
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR app_private.teaches_class(app_private.session_class(session_id))
    OR app_private.administers_class(app_private.session_class(session_id))
  );

-- The tutor records attendance only for students who belong to the class.
DROP POLICY IF EXISTS session_attendance_write ON public.session_attendance;
CREATE POLICY session_attendance_write ON public.session_attendance
  FOR ALL TO authenticated
  USING (app_private.teaches_class(app_private.session_class(session_id)))
  WITH CHECK (
    app_private.teaches_class(app_private.session_class(session_id))
    AND EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.class_id = app_private.session_class(session_id)
        AND e.student_id = session_attendance.student_id
        AND e.status IN ('enrolled', 'active')
    )
  );

-- =============================================================================
-- 2. Delivery metrics
-- =============================================================================
-- One row per tutor (optionally one school). No access checks: only the
-- wrappers below call it.
CREATE OR REPLACE FUNCTION app_private.tutor_delivery(p_institution uuid DEFAULT NULL)
RETURNS TABLE (
  teacher_id uuid, teacher_name text, teacher_email text,
  school_id uuid, school_name text,
  classes bigint, students bigint,
  sessions_30d bigint, sessions_total bigint, last_session date,
  attendance_rate numeric,
  assignments bigint, submissions bigint, graded bigint,
  avg_turnaround_hours numeric, awaiting_review bigint, overdue_reviews bigint,
  feedback_rate numeric, missed_deadlines bigint,
  flags text[]
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH tutors AS (
    SELECT u.id, u.email, u.institution_id,
           nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '') AS name
    FROM public.users u
    WHERE u.role = 'teacher'
      AND (p_institution IS NULL OR u.institution_id = p_institution)
  ),
  cls AS (SELECT c.id, c.teacher_id FROM public.classes c JOIN tutors t ON t.id = c.teacher_id),
  sess AS (SELECT s.id, s.held_on, c.teacher_id FROM public.class_sessions s JOIN cls c ON c.id = s.class_id),
  att AS (SELECT a.status, s.teacher_id FROM public.session_attendance a JOIN sess s ON s.id = a.session_id),
  asg AS (SELECT a.id, a.class_id, a.due_date, c.teacher_id FROM public.assignments a JOIN cls c ON c.id = a.class_id),
  subs AS (
    SELECT s.*, g.teacher_id FROM public.submissions s JOIN asg g ON g.id = s.assignment_id
    WHERE s.status IN ('submitted', 'revision_requested', 'graded')
  ),
  missed AS (
    SELECT g.teacher_id, count(*) AS n
    FROM asg g
    JOIN public.enrollments e ON e.class_id = g.class_id AND e.status IN ('enrolled', 'active')
    WHERE g.due_date < now()
      AND NOT EXISTS (
        SELECT 1 FROM public.submissions s
        WHERE s.assignment_id = g.id AND s.student_id = e.student_id
          AND s.status IN ('submitted', 'revision_requested', 'graded'))
    GROUP BY g.teacher_id
  ),
  rows AS (
    SELECT t.id, t.name, t.email, t.institution_id, i.name AS school,
      (SELECT count(*) FROM cls WHERE cls.teacher_id = t.id) AS classes,
      (SELECT count(DISTINCT e.student_id) FROM public.enrollments e
       JOIN cls ON cls.id = e.class_id
       WHERE cls.teacher_id = t.id AND e.status IN ('enrolled', 'active')) AS students,
      (SELECT count(*) FROM sess WHERE sess.teacher_id = t.id AND sess.held_on >= current_date - 30) AS s30,
      (SELECT count(*) FROM sess WHERE sess.teacher_id = t.id) AS stot,
      (SELECT max(held_on) FROM sess WHERE sess.teacher_id = t.id) AS last_s,
      (SELECT round(100.0 * count(*) FILTER (WHERE att.status IN ('present', 'late')) / nullif(count(*) FILTER (WHERE att.status <> 'excused'), 0), 1)
       FROM att WHERE att.teacher_id = t.id) AS att_rate,
      (SELECT count(*) FROM asg WHERE asg.teacher_id = t.id) AS asg_n,
      (SELECT count(*) FROM subs WHERE subs.teacher_id = t.id) AS sub_n,
      (SELECT count(*) FROM subs WHERE subs.teacher_id = t.id AND subs.status = 'graded') AS graded_n,
      (SELECT round(avg(extract(epoch FROM (subs.graded_at - subs.submitted_at)) / 3600)::numeric, 1)
       FROM subs WHERE subs.teacher_id = t.id AND subs.status = 'graded'
         AND subs.graded_at IS NOT NULL AND subs.submitted_at IS NOT NULL) AS turnaround,
      (SELECT count(*) FROM subs WHERE subs.teacher_id = t.id AND subs.status = 'submitted') AS waiting,
      (SELECT count(*) FROM subs WHERE subs.teacher_id = t.id AND subs.status = 'submitted'
         AND subs.submitted_at < now() - interval '7 days') AS overdue,
      (SELECT round(100.0 * count(*) FILTER (WHERE length(btrim(coalesce(subs.feedback, ''))) > 0) / nullif(count(*), 0), 1)
       FROM subs WHERE subs.teacher_id = t.id AND subs.status IN ('graded', 'revision_requested')) AS fb_rate,
      coalesce((SELECT n FROM missed WHERE missed.teacher_id = t.id), 0) AS missed_n
    FROM tutors t
    LEFT JOIN public.institutions i ON i.id = t.institution_id
  )
  SELECT r.id, r.name, r.email::text, r.institution_id, r.school::text,
         r.classes, r.students, r.s30, r.stot, r.last_s, r.att_rate,
         r.asg_n, r.sub_n, r.graded_n, r.turnaround, r.waiting, r.overdue,
         r.fb_rate, r.missed_n,
         array_remove(ARRAY[
           CASE WHEN r.classes > 0 AND (r.last_s IS NULL OR r.last_s < current_date - 14)
                THEN 'no_recent_sessions' END,
           CASE WHEN r.overdue > 0 THEN 'overdue_reviews' END,
           CASE WHEN r.graded_n >= 5 AND coalesce(r.fb_rate, 0) < 50 THEN 'little_feedback' END,
           CASE WHEN r.att_rate IS NOT NULL AND r.att_rate < 70 THEN 'low_attendance' END
         ], NULL)
  FROM rows r
  ORDER BY r.school NULLS LAST, r.name NULLS LAST
$$;
REVOKE ALL ON FUNCTION app_private.tutor_delivery(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_tutor_metrics()
RETURNS TABLE (
  teacher_id uuid, teacher_name text, teacher_email text, school_id uuid, school_name text,
  classes bigint, students bigint, sessions_30d bigint, sessions_total bigint, last_session date,
  attendance_rate numeric, assignments bigint, submissions bigint, graded bigint,
  avg_turnaround_hours numeric, awaiting_review bigint, overdue_reviews bigint,
  feedback_rate numeric, missed_deadlines bigint, flags text[]
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_platform_admin();
  RETURN QUERY SELECT * FROM app_private.tutor_delivery(NULL);
END;
$$;

-- School admins: their own school's tutors.
CREATE OR REPLACE FUNCTION public.school_tutor_metrics()
RETURNS TABLE (
  teacher_id uuid, teacher_name text, teacher_email text, school_id uuid, school_name text,
  classes bigint, students bigint, sessions_30d bigint, sessions_total bigint, last_session date,
  attendance_rate numeric, assignments bigint, submissions bigint, graded bigint,
  avg_turnaround_hours numeric, awaiting_review bigint, overdue_reviews bigint,
  feedback_rate numeric, missed_deadlines bigint, flags text[]
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_inst uuid;
BEGIN
  SELECT institution_id INTO v_inst FROM public.users
  WHERE id = auth.uid() AND role = 'institution_admin';
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'School admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM app_private.tutor_delivery(v_inst);
END;
$$;

-- =============================================================================
-- 3. Programme viewers
-- =============================================================================
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (
  role IN ('student', 'teacher', 'institution_admin', 'department_admin',
           'system_admin', 'programme_viewer')
);

CREATE OR REPLACE FUNCTION app_private.require_programme_access()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()
                 AND role IN ('system_admin', 'programme_viewer')) THEN
    RAISE EXCEPTION 'Programme staff only' USING ERRCODE = '42501';
  END IF;
  IF coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'Enter your two-factor code first' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app_private.require_programme_access() FROM PUBLIC, anon, authenticated;

-- Totals (same as platform_overview, open to programme viewers).
CREATE OR REPLACE FUNCTION public.programme_overview()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_result json;
BEGIN
  PERFORM app_private.require_programme_access();
  WITH weeks AS (
    SELECT generate_series(date_trunc('week', now()) - interval '7 weeks',
                           date_trunc('week', now()), interval '1 week') AS week
  )
  SELECT json_build_object(
    'schools', (SELECT count(*) FROM public.institutions),
    'active_schools', (SELECT count(*) FROM public.institutions WHERE status = 'active'),
    'admins', (SELECT count(*) FROM public.users WHERE role = 'institution_admin'),
    'teachers', (SELECT count(*) FROM public.users WHERE role = 'teacher'),
    'students', (SELECT count(*) FROM public.users WHERE role = 'student'),
    'classes', (SELECT count(*) FROM public.classes),
    'assignments', (SELECT count(*) FROM public.assignments),
    'submissions', (SELECT count(*) FROM public.submissions),
    'active_7d', (SELECT count(*) FROM auth.users WHERE last_sign_in_at > now() - interval '7 days'),
    'active_30d', (SELECT count(*) FROM auth.users WHERE last_sign_in_at > now() - interval '30 days'),
    'weekly', (
      SELECT json_agg(json_build_object(
        'week', w.week::date,
        'new_users', (SELECT count(*) FROM public.users u
                      WHERE u.created_at >= w.week AND u.created_at < w.week + interval '1 week'),
        'new_classes', (SELECT count(*) FROM public.classes c
                        WHERE c.created_at >= w.week AND c.created_at < w.week + interval '1 week'),
        'submissions', (SELECT count(*) FROM public.submissions s
                        WHERE s.submitted_at >= w.week AND s.submitted_at < w.week + interval '1 week')
      ) ORDER BY w.week)
      FROM weeks w
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- Per school: size, results and delivery, with no names or contacts.
CREATE OR REPLACE FUNCTION public.programme_schools()
RETURNS TABLE (
  school_id uuid, school_name text, status text, institution_type text,
  teachers bigint, students bigint, classes bigint, assignments bigint,
  submissions bigint, average_grade numeric,
  sessions_30d bigint, attendance_rate numeric, avg_turnaround_hours numeric,
  overdue_reviews bigint, missed_deadlines bigint, tutors_flagged bigint,
  last_activity timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_programme_access();
  RETURN QUERY
  WITH d AS (SELECT * FROM app_private.tutor_delivery(NULL))
  SELECT i.id, i.name::text, i.status::text, i.institution_type,
         (SELECT count(*) FROM public.users u WHERE u.institution_id = i.id AND u.role = 'teacher'),
         (SELECT count(*) FROM public.users u WHERE u.institution_id = i.id AND u.role = 'student'),
         (SELECT count(*) FROM public.classes c WHERE c.institution_id = i.id),
         (SELECT coalesce(sum(d.assignments), 0)::bigint FROM d WHERE d.school_id = i.id),
         (SELECT coalesce(sum(d.submissions), 0)::bigint FROM d WHERE d.school_id = i.id),
         (SELECT round(avg(100.0 * s.grade / nullif(a.points_possible, 0)), 1)
          FROM public.submissions s JOIN public.assignments a ON a.id = s.assignment_id
          JOIN public.classes c ON c.id = a.class_id
          WHERE c.institution_id = i.id AND s.grade IS NOT NULL),
         (SELECT coalesce(sum(d.sessions_30d), 0)::bigint FROM d WHERE d.school_id = i.id),
         (SELECT round(avg(d.attendance_rate), 1) FROM d WHERE d.school_id = i.id),
         (SELECT round(avg(d.avg_turnaround_hours), 1) FROM d WHERE d.school_id = i.id),
         (SELECT coalesce(sum(d.overdue_reviews), 0)::bigint FROM d WHERE d.school_id = i.id),
         (SELECT coalesce(sum(d.missed_deadlines), 0)::bigint FROM d WHERE d.school_id = i.id),
         (SELECT count(*) FROM d WHERE d.school_id = i.id AND cardinality(d.flags) > 0),
         (SELECT max(s.submitted_at) FROM public.submissions s
          JOIN public.assignments a ON a.id = s.assignment_id
          JOIN public.classes c ON c.id = a.class_id WHERE c.institution_id = i.id)
  FROM public.institutions i
  ORDER BY i.name;
END;
$$;

-- Platform admins may grant the viewer role (still never system_admin).
CREATE OR REPLACE FUNCTION public.platform_set_role(p_user uuid, p_role text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old text;
BEGIN
  PERFORM app_private.require_platform_admin();
  IF p_role NOT IN ('student', 'teacher', 'institution_admin', 'programme_viewer') THEN
    RAISE EXCEPTION 'Role must be student, teacher, school admin or programme viewer' USING ERRCODE = '22023';
  END IF;
  SELECT role INTO v_old FROM public.users WHERE id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_old = 'system_admin' THEN
    RAISE EXCEPTION 'Platform admins are changed in the SQL editor' USING ERRCODE = '42501';
  END IF;
  UPDATE public.users
  SET role = p_role,
      onboarding_completed = CASE WHEN p_role = 'programme_viewer' THEN true ELSE onboarding_completed END,
      updated_at = now()
  WHERE id = p_user;
  PERFORM app_private.log_platform_action('role_changed', 'user', p_user::text,
    jsonb_build_object('from', v_old, 'to', p_role));
END;
$$;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.platform_tutor_metrics()',
    'public.school_tutor_metrics()',
    'public.programme_overview()',
    'public.programme_schools()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
