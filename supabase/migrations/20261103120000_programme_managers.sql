-- Programme managers, a school for each class, and school figures.
--
-- 1. Programme managers: a platform admin makes existing users (a school
--    admin, a teacher, …) managers of a specific programme. They keep their
--    own login; for that programme they can do what a platform admin can
--    (edit it, add or remove classes and tutors, suspend or end it, see its
--    analytics), and nothing else on the platform. Deleting a programme
--    stays with platform admins (and a school's admin for its own school
--    programme).
-- 2. One school per class: a class in a multi-school programme can serve
--    one school, so only that school's learners can join it.
-- 3. Admins of schools taking part see their own school's figures in the
--    programme (their learners, attendance and project progress).

CREATE TABLE IF NOT EXISTS public.programme_managers (
  programme_id uuid NOT NULL REFERENCES public.programmes (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (programme_id, user_id)
);
CREATE INDEX IF NOT EXISTS programme_managers_user_idx ON public.programme_managers (user_id);
ALTER TABLE public.programme_managers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.programme_managers FROM PUBLIC, anon, authenticated;

-- Managers: platform admins, the school's admin for a school programme,
-- and the people assigned to it.
CREATE OR REPLACE FUNCTION app_private.manages_programme(p_programme uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_programme IS NOT NULL AND (
    app_private.is_platform_admin()
    OR EXISTS (SELECT 1 FROM public.programmes p
               WHERE p.id = p_programme AND p.scope = 'school'
                 AND app_private.is_institution_admin_of(p.institution_id))
    OR EXISTS (SELECT 1 FROM public.programme_managers m
               WHERE m.programme_id = p_programme AND m.user_id = auth.uid()))
$$;

-- People a platform admin can make programme managers: school admins and
-- teachers (with their school).
CREATE OR REPLACE FUNCTION public.programme_manager_candidates()
RETURNS TABLE (id uuid, name text, email text, role text, school_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_platform_admin();
  RETURN QUERY
  SELECT u.id, app_private.person_name(u.id), u.email::text, u.role::text, i.name::text
  FROM public.users u LEFT JOIN public.institutions i ON i.id = u.institution_id
  WHERE u.role IN ('institution_admin', 'teacher')
  ORDER BY u.role DESC, 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_programme_manager(p_programme uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes;
BEGIN
  PERFORM app_private.require_platform_admin();
  SELECT * INTO p FROM public.programmes WHERE id = p_programme;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programme not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user
                 AND role IN ('institution_admin', 'teacher')) THEN
    RAISE EXCEPTION 'Programme managers are school admins or teachers' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.programme_managers (programme_id, user_id, added_by)
  VALUES (p.id, p_user, auth.uid())
  ON CONFLICT DO NOTHING;
  IF FOUND THEN
    INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
    VALUES (p_user, 'role_changed', left('You''re now managing ' || p.name, 255),
            'You can add classes and tutors, suspend or end it, and see its analytics. Find it under Programmes.',
            'high', '/dashboard/programmes/' || p.id, 'Open programme',
            jsonb_build_object('programme_id', p.id));
    PERFORM app_private.log_platform_action('programme_manager_added', 'programme', p.id::text,
      jsonb_build_object('user_id', p_user));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_programme_manager(p_programme uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_platform_admin();
  DELETE FROM public.programme_managers WHERE programme_id = p_programme AND user_id = p_user;
  IF FOUND THEN
    PERFORM app_private.log_platform_action('programme_manager_removed', 'programme', p_programme::text,
      jsonb_build_object('user_id', p_user));
  END IF;
END;
$$;

-- Schools a manager can choose from (the programme's schools, or every
-- school when it is open to all).
CREATE OR REPLACE FUNCTION public.programme_school_options(p_programme uuid)
RETURNS TABLE (id uuid, name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes := app_private.require_programme_manager(p_programme);
BEGIN
  RETURN QUERY
  SELECT i.id, i.name::text FROM public.institutions i
  WHERE i.status = 'active'
    AND CASE
          WHEN p.scope = 'school' THEN i.id = p.institution_id
          WHEN EXISTS (SELECT 1 FROM public.programme_school_links l WHERE l.programme_id = p.id)
            THEN i.id IN (SELECT l.institution_id FROM public.programme_school_links l WHERE l.programme_id = p.id)
          ELSE true
        END
  ORDER BY i.name;
END;
$$;

-- Every school, for managers editing a platform programme's school list.
CREATE OR REPLACE FUNCTION public.programme_all_schools(p_programme uuid)
RETURNS TABLE (id uuid, name text, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_programme_manager(p_programme);
  RETURN QUERY SELECT i.id, i.name::text, i.status::text FROM public.institutions i ORDER BY i.name;
END;
$$;

-- Teachers who can tutor a programme's classes: the school's teachers for a
-- school programme, any teacher for a platform programme.
CREATE OR REPLACE FUNCTION public.programme_tutor_candidates(p_programme uuid)
RETURNS TABLE (id uuid, name text, email text, school_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes := app_private.require_programme_manager(p_programme);
BEGIN
  RETURN QUERY
  SELECT u.id, app_private.person_name(u.id), u.email::text, i.name::text
  FROM public.users u LEFT JOIN public.institutions i ON i.id = u.institution_id
  WHERE u.role = 'teacher'
    AND (p.scope <> 'school' OR u.institution_id = p.institution_id)
  ORDER BY 2;
END;
$$;

-- A new class in a programme, run by p_tutor, optionally for one school.
DROP FUNCTION IF EXISTS public.add_programme_class(uuid, text, uuid);
CREATE OR REPLACE FUNCTION public.add_programme_class(
  p_programme uuid, p_name text, p_tutor uuid, p_school uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes := app_private.require_programme_manager(p_programme);
  v_id uuid;
  v_code text := app_private.new_class_code();
  v_name text := btrim(coalesce(p_name, ''));
  v_school uuid;
BEGIN
  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Give the class a name' USING ERRCODE = '22023';
  END IF;
  IF p.status = 'ended' THEN
    RAISE EXCEPTION 'This programme has ended' USING ERRCODE = '22023';
  END IF;
  v_school := CASE WHEN p.scope = 'school' THEN p.institution_id ELSE p_school END;
  IF p.scope = 'programme' AND v_school IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.programme_school_options(p.id) o WHERE o.id = v_school) THEN
    RAISE EXCEPTION 'That school isn''t taking part in this programme' USING ERRCODE = '22023';
  END IF;
  PERFORM app_private.check_programme_tutor(p, p_tutor);
  INSERT INTO public.classes (name, code, teacher_id, institution_id, programme_id)
  VALUES (v_name, v_code, p_tutor, v_school, p.id)
  RETURNING id INTO v_id;
  PERFORM app_private.notify_new_tutor(p, v_id, p_tutor, v_name, v_code);
  RETURN jsonb_build_object('id', v_id, 'code', v_code);
END;
$$;

-- Change which school a platform programme's class serves (NULL: any
-- school taking part).
CREATE OR REPLACE FUNCTION public.set_programme_class_school(p_class uuid, p_school uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c public.classes;
  p public.programmes;
BEGIN
  SELECT * INTO c FROM public.classes WHERE id = p_class FOR UPDATE;
  IF NOT FOUND OR c.programme_id IS NULL THEN
    RAISE EXCEPTION 'That class isn''t in a programme' USING ERRCODE = '22023';
  END IF;
  p := app_private.require_programme_manager(c.programme_id);
  IF p.scope = 'school' THEN
    RAISE EXCEPTION 'A school programme''s classes all belong to its school' USING ERRCODE = '22023';
  END IF;
  IF p_school IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.programme_school_options(p.id) o WHERE o.id = p_school) THEN
    RAISE EXCEPTION 'That school isn''t taking part in this programme' USING ERRCODE = '22023';
  END IF;
  UPDATE public.classes SET institution_id = p_school, updated_at = now() WHERE id = c.id;
END;
$$;

-- A tutor for a programme class: a teacher, at the programme's school for a
-- school programme. The mentor flags (used by class "Group type" settings)
-- are only set by people allowed to set them; programme tutors don't need
-- them, so assigned managers can add tutors too.
CREATE OR REPLACE FUNCTION app_private.check_programme_tutor(p public.programmes, p_tutor uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t public.users;
BEGIN
  SELECT * INTO t FROM public.users WHERE id = p_tutor;
  IF NOT FOUND OR t.role <> 'teacher' THEN
    RAISE EXCEPTION 'Choose a teacher as the tutor' USING ERRCODE = '22023';
  END IF;
  IF p.scope = 'school' AND t.institution_id IS DISTINCT FROM p.institution_id THEN
    RAISE EXCEPTION 'A school programme''s tutors are teachers at that school' USING ERRCODE = '22023';
  END IF;
  IF p.scope = 'school'
     AND (app_private.is_platform_admin() OR app_private.is_institution_admin_of(t.institution_id)) THEN
    UPDATE public.users SET school_mentor = true WHERE id = t.id AND NOT school_mentor;
  ELSIF p.scope = 'programme' AND app_private.is_platform_admin() THEN
    UPDATE public.users SET is_programme_mentor = true WHERE id = t.id AND NOT is_programme_mentor;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app_private.check_programme_tutor(public.programmes, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.programme_classes_available(p_programme uuid)
RETURNS TABLE (id uuid, name text, code text, tutor_name text, school_name text, learners bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes := app_private.require_programme_manager(p_programme);
BEGIN
  RETURN QUERY
  SELECT c.id, c.name::text, c.code::text, app_private.person_name(c.teacher_id), i.name::text,
         (SELECT count(*) FROM public.enrollments e
           WHERE e.class_id = c.id AND e.status IN ('enrolled', 'active'))
  FROM public.classes c
  LEFT JOIN public.institutions i ON i.id = c.institution_id
  WHERE c.programme_id IS NULL AND c.status = 'active'
    AND (p.scope <> 'school' OR c.institution_id = p.institution_id)
    AND (app_private.is_platform_admin()
         OR c.institution_id IN (SELECT o.id FROM public.programme_school_options(p.id) o)
         OR c.institution_id = (SELECT me.institution_id FROM public.users me WHERE me.id = auth.uid()))
  ORDER BY i.name NULLS LAST, c.name
  LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_programme(p_programme uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes := app_private.require_programme_manager(p_programme);
BEGIN
  IF NOT (app_private.is_platform_admin()
          OR (p.scope = 'school' AND app_private.is_institution_admin_of(p.institution_id))) THEN
    RAISE EXCEPTION 'Only a platform admin can delete this programme. You can end it instead.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.production_projects pp
  USING public.classes c
  WHERE c.id = pp.class_id AND c.programme_id = p.id;
  UPDATE public.classes SET programme_id = NULL WHERE programme_id = p.id;
  DELETE FROM public.programmes WHERE id = p.id;
  IF app_private.is_platform_admin() THEN
    PERFORM app_private.log_platform_action('programme_deleted', 'programme', p.id::text,
      jsonb_build_object('name', p.name));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.programme_detail(p_programme uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes;
  v_manage boolean := app_private.manages_programme(p_programme);
  v_my_school uuid;
BEGIN
  SELECT u.institution_id INTO v_my_school FROM public.users u
  WHERE u.id = auth.uid() AND u.role = 'institution_admin';
  SELECT * INTO p FROM public.programmes WHERE id = p_programme;
  IF NOT FOUND OR NOT app_private.can_view_programme(p_programme) THEN
    RAISE EXCEPTION 'Programme not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'programme', to_jsonb(p) || jsonb_build_object(
      'school_name', (SELECT name FROM public.institutions WHERE id = p.institution_id),
      'created_by_name', app_private.person_name(p.created_by)),
    'can_manage', v_manage,
    'can_delete', app_private.is_platform_admin()
                  OR (p.scope = 'school' AND app_private.is_institution_admin_of(p.institution_id)),
    'is_platform_admin', app_private.is_platform_admin(),
    'managers', CASE WHEN v_manage THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'user_id', m.user_id, 'name', app_private.person_name(m.user_id),
               'role', u.role, 'school', i.name) ORDER BY m.added_at)
      FROM public.programme_managers m
      JOIN public.users u ON u.id = m.user_id
      LEFT JOIN public.institutions i ON i.id = u.institution_id
      WHERE m.programme_id = p.id), '[]'::jsonb) END,
    'my_school', CASE WHEN v_my_school IS NOT NULL THEN (
      WITH mine AS (
        SELECT DISTINCT e.student_id FROM public.enrollments e
        JOIN public.classes c ON c.id = e.class_id AND c.programme_id = p.id
        JOIN public.users u ON u.id = e.student_id AND u.institution_id = v_my_school
        WHERE e.status IN ('enrolled', 'active')),
      my_projects AS (
        SELECT DISTINCT pp.id FROM public.production_projects pp
        JOIN public.classes c ON c.id = pp.class_id AND c.programme_id = p.id
        JOIN public.production_project_members pm ON pm.project_id = pp.id
        WHERE pm.student_id IN (SELECT student_id FROM mine))
      SELECT jsonb_build_object(
        'school', (SELECT name FROM public.institutions WHERE id = v_my_school),
        'learners', (SELECT count(*) FROM mine),
        'attendance_rate', (SELECT round(avg(CASE WHEN a.status IN ('present', 'late') THEN 1.0 ELSE 0 END), 3)
                            FROM public.session_attendance a
                            JOIN public.class_sessions s ON s.id = a.session_id
                            JOIN public.classes c ON c.id = s.class_id AND c.programme_id = p.id
                            WHERE a.student_id IN (SELECT student_id FROM mine) AND a.status <> 'excused'),
        'projects', (SELECT count(*) FROM my_projects),
        'milestones', (SELECT count(*) FROM public.production_milestones m WHERE m.project_id IN (SELECT id FROM my_projects)),
        'milestones_approved', (SELECT count(*) FROM public.production_milestones m
                                WHERE m.project_id IN (SELECT id FROM my_projects) AND m.status = 'approved'),
        'milestones_overdue', (SELECT count(*) FROM public.production_milestones m
                               WHERE m.project_id IN (SELECT id FROM my_projects)
                                 AND m.status <> 'approved' AND m.due_date < current_date))) END,
    'schools', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name) ORDER BY i.name)
      FROM public.programme_school_links l JOIN public.institutions i ON i.id = l.institution_id
      WHERE l.programme_id = p.id), '[]'::jsonb),
    'classes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'code', c.code, 'status', c.status,
               'school_id', c.institution_id,
               'school_name', (SELECT i.name FROM public.institutions i WHERE i.id = c.institution_id),
               'tutor_id', c.teacher_id, 'tutor_name', app_private.person_name(c.teacher_id),
               'tutor_school', (SELECT i.name FROM public.users t JOIN public.institutions i ON i.id = t.institution_id
                                WHERE t.id = c.teacher_id),
               'learners', (SELECT count(*) FROM public.enrollments e
                            WHERE e.class_id = c.id AND e.status IN ('enrolled', 'active')),
               'pending', (SELECT count(*) FROM public.enrollments e
                           WHERE e.class_id = c.id AND e.status = 'pending'),
               'sessions', (SELECT count(*) FROM public.class_sessions s WHERE s.class_id = c.id),
               'attendance_rate', (SELECT round(avg(CASE WHEN a.status IN ('present', 'late') THEN 1.0 ELSE 0 END), 3)
                                   FROM public.session_attendance a JOIN public.class_sessions s ON s.id = a.session_id
                                   WHERE s.class_id = c.id AND a.status <> 'excused'),
               'projects', (SELECT count(*) FROM public.production_projects pp WHERE pp.class_id = c.id),
               'milestones', (SELECT count(*) FROM public.production_milestones m
                              JOIN public.production_projects pp ON pp.id = m.project_id WHERE pp.class_id = c.id),
               'milestones_approved', (SELECT count(*) FROM public.production_milestones m
                                       JOIN public.production_projects pp ON pp.id = m.project_id
                                       WHERE pp.class_id = c.id AND m.status = 'approved'))
             ORDER BY c.name)
      FROM public.classes c WHERE c.programme_id = p.id), '[]'::jsonb),
    'totals', CASE WHEN v_manage THEN app_private.programme_totals(p.id) END,
    'by_school', CASE WHEN v_manage THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('school', coalesce(x.school, 'No school'), 'learners', x.n) ORDER BY x.n DESC)
      FROM (SELECT i.name AS school, count(DISTINCT e.student_id) AS n
            FROM public.enrollments e
            JOIN public.classes c ON c.id = e.class_id AND c.programme_id = p.id
            JOIN public.users u ON u.id = e.student_id
            LEFT JOIN public.institutions i ON i.id = u.institution_id
            WHERE e.status IN ('enrolled', 'active')
            GROUP BY i.name) x), '[]'::jsonb) END,
    'projects', CASE WHEN v_manage THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pp.id, 'title', pp.title, 'status', pp.status, 'class', c.name,
               'team', (SELECT count(*) FROM public.production_project_members pm WHERE pm.project_id = pp.id),
               'milestones', (SELECT count(*) FROM public.production_milestones m WHERE m.project_id = pp.id),
               'approved', (SELECT count(*) FROM public.production_milestones m WHERE m.project_id = pp.id AND m.status = 'approved'),
               'waiting', (SELECT count(*) FROM public.production_milestones m WHERE m.project_id = pp.id AND m.status = 'submitted'),
               'overdue', (SELECT count(*) FROM public.production_milestones m
                           WHERE m.project_id = pp.id AND m.status <> 'approved' AND m.due_date < current_date),
               'last_activity', (SELECT max(v.submitted_at) FROM public.production_milestone_versions v
                                 JOIN public.production_milestones m ON m.id = v.milestone_id
                                 WHERE m.project_id = pp.id))
             ORDER BY pp.created_at DESC)
      FROM public.production_projects pp JOIN public.classes c ON c.id = pp.class_id
      WHERE c.programme_id = p.id), '[]'::jsonb) END
  );
END;
$$;

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

  -- Programme classes: the programme must be open, and its stage and
  -- schools apply.
  IF v_class.programme_id IS NOT NULL THEN
    DECLARE
      p public.programmes;
    BEGIN
      SELECT * INTO p FROM public.programmes WHERE id = v_class.programme_id;
      IF p.status <> 'active' THEN
        RAISE EXCEPTION 'This programme is % at the moment', p.status USING ERRCODE = '22023';
      END IF;
      IF p.stage IS NOT NULL
         AND array_position(ARRAY['foundation', 'mentorship', 'fellowship', 'alumni'], app_private.learner_stage(v_uid))
           < array_position(ARRAY['foundation', 'mentorship', 'fellowship', 'alumni'], p.stage) THEN
        RAISE EXCEPTION 'This programme is for learners selected for the % stage', p.stage USING ERRCODE = '42501';
      END IF;
      IF p.scope = 'school'
         AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_uid AND institution_id = p.institution_id) THEN
        RAISE EXCEPTION 'This programme is for learners at %',
          coalesce((SELECT name FROM public.institutions WHERE id = p.institution_id), 'another school')
          USING ERRCODE = '42501';
      END IF;
      IF p.scope = 'programme' AND v_class.institution_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_uid AND institution_id = v_class.institution_id) THEN
        RAISE EXCEPTION 'This class is for learners at %',
          coalesce((SELECT name FROM public.institutions WHERE id = v_class.institution_id), 'another school')
          USING ERRCODE = '42501';
      END IF;
      IF p.scope = 'programme'
         AND EXISTS (SELECT 1 FROM public.programme_school_links l WHERE l.programme_id = p.id)
         AND NOT EXISTS (SELECT 1 FROM public.programme_school_links l
                         JOIN public.users u ON u.institution_id = l.institution_id
                         WHERE l.programme_id = p.id AND u.id = v_uid) THEN
        RAISE EXCEPTION 'This programme is for learners at %',
          (SELECT string_agg(i.name, ', ' ORDER BY i.name)
           FROM public.programme_school_links l JOIN public.institutions i ON i.id = l.institution_id
           WHERE l.programme_id = p.id)
          USING ERRCODE = '42501';
      END IF;
    END;
  END IF;

  -- Mentorship and fellowship groups are for learners selected for them.
  IF v_class.cohort_stage IS NOT NULL
     AND array_position(ARRAY['foundation', 'mentorship', 'fellowship', 'alumni'], app_private.learner_stage(v_uid))
       < array_position(ARRAY['foundation', 'mentorship', 'fellowship', 'alumni'], v_class.cohort_stage) THEN
    RAISE EXCEPTION 'This group is for learners selected for the % stage', v_class.cohort_stage
      USING ERRCODE = '42501';
  END IF;

  -- School programmes are for that school's learners.
  IF v_class.school_programme
     AND NOT EXISTS (SELECT 1 FROM public.users
                     WHERE id = v_uid AND institution_id = v_class.institution_id) THEN
    RAISE EXCEPTION 'This programme is for learners at %',
      coalesce((SELECT name FROM public.institutions WHERE id = v_class.institution_id), 'another school')
      USING ERRCODE = '42501';
  END IF;

  -- Programmes for selected schools take only those schools' learners.
  IF EXISTS (SELECT 1 FROM public.programme_schools ps WHERE ps.class_id = v_class.id)
     AND NOT EXISTS (SELECT 1 FROM public.programme_schools ps
                     JOIN public.users u ON u.institution_id = ps.institution_id
                     WHERE ps.class_id = v_class.id AND u.id = v_uid) THEN
    RAISE EXCEPTION 'This programme is for learners at %',
      (SELECT string_agg(i.name, ', ' ORDER BY i.name)
       FROM public.programme_schools ps JOIN public.institutions i ON i.id = ps.institution_id
       WHERE ps.class_id = v_class.id)
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

CREATE OR REPLACE FUNCTION public.my_project_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'role', u.role,
    'is_mentor', coalesce(u.is_programme_mentor, false) OR coalesce(u.school_mentor, false),
    'school_mentor', coalesce(u.school_mentor, false),
    'platform_admin', app_private.is_platform_admin(),
    'stage', CASE WHEN u.role = 'student' THEN app_private.learner_stage(u.id) END,
    'groups', (SELECT count(*) FROM public.project_groups()),
    'managed_programmes', (SELECT count(*) FROM public.programme_managers m WHERE m.user_id = u.id)
  )
  FROM public.users u WHERE u.id = auth.uid();
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.programme_manager_candidates()',
    'public.add_programme_manager(uuid, uuid)',
    'public.remove_programme_manager(uuid, uuid)',
    'public.programme_school_options(uuid)',
    'public.programme_all_schools(uuid)',
    'public.programme_tutor_candidates(uuid)',
    'public.add_programme_class(uuid, text, uuid, uuid)',
    'public.set_programme_class_school(uuid, uuid)',
    'public.programme_classes_available(uuid)',
    'public.delete_programme(uuid)',
    'public.programme_detail(uuid)',
    'public.join_class_by_code(text)',
    'public.my_project_access()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
