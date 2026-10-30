-- Programmes for chosen schools.
--
-- A platform admin's programme can now be limited to selected schools
-- (programme_schools) and/or to learners at a stage (classes.cohort_stage),
-- or be open to every school. classes.programme_group marks every
-- programme group, whatever its limits, so "is this a programme?" no longer
-- depends on a stage being set.

CREATE TABLE IF NOT EXISTS public.programme_schools (
  class_id uuid NOT NULL REFERENCES public.classes (id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
  PRIMARY KEY (class_id, institution_id)
);
ALTER TABLE public.programme_schools ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.programme_schools FROM PUBLIC, anon, authenticated;
-- Read and written only through the functions below.

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS programme_group boolean NOT NULL DEFAULT false;

-- Only platform admins (or a school's admin, for its school programme) mark
-- a class as a programme.
CREATE OR REPLACE FUNCTION app_private.guard_programme_group()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.programme_group IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN false ELSE OLD.programme_group END)
     AND NOT (app_private.is_trusted_caller() OR app_private.is_platform_admin()
              OR (NEW.school_programme AND app_private.is_institution_admin_of(NEW.institution_id))) THEN
    RAISE EXCEPTION 'Only platform admins start programmes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_programme_group ON public.classes;
CREATE TRIGGER guard_programme_group BEFORE INSERT OR UPDATE OF programme_group ON public.classes
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_programme_group();
REVOKE ALL ON FUNCTION app_private.guard_programme_group() FROM PUBLIC, anon, authenticated;

-- Existing programmes (stage groups and school programmes).
UPDATE public.classes SET programme_group = true
WHERE (cohort_stage IS NOT NULL OR school_programme) AND NOT programme_group;

-- Start a programme.
--   p_scope 'school':  the mentor's school only (school admin or platform admin).
--   p_scope 'schools': platform admin; p_schools limits it to those schools
--                      (NULL or empty: every school); p_stage limits it to
--                      learners at that stage (NULL: any learner).
--   'mentorship' / 'fellowship' (older callers): every school at that stage.
DROP FUNCTION IF EXISTS public.create_programme_group(text, uuid, text, text);
CREATE OR REPLACE FUNCTION public.create_programme_group(
  p_name text, p_mentor uuid, p_scope text, p_description text DEFAULT NULL,
  p_schools uuid[] DEFAULT NULL, p_stage text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.users;
  v_school uuid;
  v_id uuid;
  v_code text := app_private.new_class_code();
  v_name text := btrim(coalesce(p_name, ''));
  v_scope text := p_scope;
  v_stage text := nullif(p_stage, '');
  v_schools uuid[] := ARRAY(SELECT DISTINCT unnest(coalesce(p_schools, '{}'::uuid[])));
BEGIN
  IF length(v_name) < 3 THEN
    RAISE EXCEPTION 'Give the programme a name' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO m FROM public.users WHERE id = p_mentor;
  IF NOT FOUND OR m.role <> 'teacher' THEN
    RAISE EXCEPTION 'Choose a teacher to run the programme' USING ERRCODE = '22023';
  END IF;
  IF v_scope IN ('mentorship', 'fellowship') THEN
    v_stage := v_scope;
    v_scope := 'schools';
  END IF;

  IF v_scope = 'school' THEN
    v_school := m.institution_id;
    IF v_school IS NULL THEN
      RAISE EXCEPTION 'That teacher isn''t at a school' USING ERRCODE = '22023';
    END IF;
    IF NOT (app_private.is_institution_admin_of(v_school) OR app_private.is_platform_admin()) THEN
      RAISE EXCEPTION 'School admins start programmes with their own school''s teachers' USING ERRCODE = '42501';
    END IF;
    UPDATE public.users SET school_mentor = true WHERE id = m.id AND NOT school_mentor;
    INSERT INTO public.classes (name, description, code, teacher_id, institution_id, school_programme, programme_group)
    VALUES (v_name, nullif(btrim(coalesce(p_description, '')), ''), v_code, m.id, v_school, true, true)
    RETURNING id INTO v_id;
  ELSIF v_scope = 'schools' THEN
    PERFORM app_private.require_platform_admin();
    IF v_stage IS NOT NULL AND v_stage NOT IN ('mentorship', 'fellowship') THEN
      RAISE EXCEPTION 'Unknown stage' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_schools) s
               WHERE NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = s)) THEN
      RAISE EXCEPTION 'One of the chosen schools doesn''t exist' USING ERRCODE = '22023';
    END IF;
    UPDATE public.users SET is_programme_mentor = true WHERE id = m.id AND NOT is_programme_mentor;
    INSERT INTO public.classes (name, description, code, teacher_id, cohort_stage, programme_group)
    VALUES (v_name, nullif(btrim(coalesce(p_description, '')), ''), v_code, m.id, v_stage, true)
    RETURNING id INTO v_id;
    INSERT INTO public.programme_schools (class_id, institution_id)
    SELECT v_id, s FROM unnest(v_schools) s;
  ELSE
    RAISE EXCEPTION 'Unknown programme type' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
  VALUES (m.id, 'class_created', left('You''re running ' || v_name, 255),
          'Share the join code ' || v_code || ' with the learners taking part, then start a production project.',
          'high', '/dashboard/teacher/classes/' || v_id, 'Open',
          jsonb_build_object('class_id', v_id));

  -- The admins of every school taking part (except whoever started it), so
  -- they can pass the code to their learners.
  INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
  SELECT a.id, 'class_created',
         left('New programme for your school: ' || v_name, 255),
         left('Run by ' || coalesce(app_private.project_name(m.id), 'a mentor')
              || CASE v_stage WHEN 'mentorship' THEN ', for learners selected for mentorship'
                              WHEN 'fellowship' THEN ', for learners selected for the fellowship'
                              ELSE '' END
              || '. Learners join with the code ' || v_code || ' (Join a class).', 500),
         'high', '/dashboard/projects', 'View programme',
         jsonb_build_object('class_id', v_id, 'code', v_code)
  FROM public.users a
  WHERE a.role = 'institution_admin' AND a.id <> auth.uid() AND a.institution_id IS NOT NULL
    AND CASE
          WHEN v_scope = 'school' THEN a.institution_id = v_school
          WHEN cardinality(v_schools) > 0 THEN a.institution_id = ANY (v_schools)
          ELSE true
        END;
  RETURN jsonb_build_object('id', v_id, 'code', v_code);
END;
$$;

-- Joining: as before, plus programmes for selected schools take only those
-- schools' learners.
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

-- Projects can be started in any programme group.
CREATE OR REPLACE FUNCTION public.create_production_project(
  p_class uuid, p_title text, p_brief text DEFAULT NULL, p_assets_url text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_class public.classes;
  v_id uuid;
BEGIN
  SELECT * INTO v_class FROM public.classes WHERE id = p_class;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_class.teacher_id = auth.uid() OR app_private.is_platform_admin()
          OR (v_class.school_programme AND app_private.is_institution_admin_of(v_class.institution_id))) THEN
    RAISE EXCEPTION 'Only the group''s mentor can start a project' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_class.programme_group OR v_class.cohort_stage IS NOT NULL OR v_class.school_programme) THEN
    RAISE EXCEPTION 'Production projects are for programmes' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) < 3 THEN
    RAISE EXCEPTION 'Give the project a title' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.production_projects (class_id, title, brief, assets_url, created_by)
  VALUES (p_class, btrim(p_title), nullif(btrim(coalesce(p_brief, '')), ''),
          app_private.clean_link(p_assets_url), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Programmes the caller can run, with who can take part.
DROP FUNCTION IF EXISTS public.project_groups();
CREATE OR REPLACE FUNCTION public.project_groups()
RETURNS TABLE (
  id uuid, name text, scope text, stage text, school_name text, schools text,
  code text, mentor_id uuid, mentor_name text, students bigint, projects bigint,
  can_run boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id, c.name::text,
         CASE WHEN c.school_programme THEN 'school' ELSE 'programme' END,
         c.cohort_stage,
         i.name::text,
         (SELECT string_agg(si.name, ', ' ORDER BY si.name)
          FROM public.programme_schools ps JOIN public.institutions si ON si.id = ps.institution_id
          WHERE ps.class_id = c.id),
         c.code::text, c.teacher_id,
         app_private.project_name(c.teacher_id),
         (SELECT count(*) FROM public.enrollments e
           WHERE e.class_id = c.id AND e.status IN ('enrolled', 'active')),
         (SELECT count(*) FROM public.production_projects p WHERE p.class_id = c.id),
         (c.teacher_id = auth.uid()
          OR app_private.is_platform_admin()
          OR (c.school_programme AND app_private.is_institution_admin_of(c.institution_id)))
  FROM public.classes c
  LEFT JOIN public.institutions i ON i.id = c.institution_id
  WHERE (c.programme_group OR c.cohort_stage IS NOT NULL OR c.school_programme)
    AND coalesce(c.status, 'active') <> 'archived'
    AND (c.teacher_id = auth.uid()
         OR app_private.is_platform_admin()
         OR (c.school_programme AND app_private.is_institution_admin_of(c.institution_id))
         -- A school admin also sees platform programmes their school is in.
         OR (NOT c.school_programme AND EXISTS (
               SELECT 1 FROM public.users me
               WHERE me.id = auth.uid() AND me.role = 'institution_admin'
                 AND me.institution_id IS NOT NULL
                 AND (NOT EXISTS (SELECT 1 FROM public.programme_schools ps WHERE ps.class_id = c.id)
                      OR EXISTS (SELECT 1 FROM public.programme_schools ps
                                 WHERE ps.class_id = c.id AND ps.institution_id = me.institution_id)))))
  ORDER BY c.school_programme, c.name;
$$;

CREATE OR REPLACE FUNCTION public.my_project_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'role', u.role,
    'is_mentor', coalesce(u.is_programme_mentor, false) OR coalesce(u.school_mentor, false),
    'school_mentor', coalesce(u.school_mentor, false),
    'platform_admin', app_private.is_platform_admin(),
    'stage', CASE WHEN u.role = 'student' THEN app_private.learner_stage(u.id) END,
    'groups', (SELECT count(*) FROM public.project_groups() g WHERE g.can_run)
  )
  FROM public.users u WHERE u.id = auth.uid();
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.create_programme_group(text, uuid, text, text, uuid[], text)',
    'public.join_class_by_code(text)',
    'public.create_production_project(uuid, text, text, text)',
    'public.project_groups()',
    'public.my_project_access()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
