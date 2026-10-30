-- Programmes at two levels.
--
-- * School programmes: a school admin starts one for their own school and
--   picks one of their teachers to run it (who becomes a school mentor).
--   Only that school's learners can join; the school admin can start and
--   staff its production projects.
-- * Programme-wide (cross-school) groups: a platform admin starts a
--   mentorship or fellowship programme with a mentor from any school; any
--   school's learners at that stage can join (classes.cohort_stage, as
--   before).
--
-- School admins can also make their own teachers school mentors.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS school_mentor boolean NOT NULL DEFAULT false;
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS school_programme boolean NOT NULL DEFAULT false;

-- Only the teacher's school admin or a platform admin sets school_mentor.
CREATE OR REPLACE FUNCTION app_private.guard_school_mentor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.school_mentor IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN false ELSE OLD.school_mentor END)
     AND NOT (app_private.is_trusted_caller() OR app_private.is_platform_admin()
              OR app_private.is_institution_admin_of(NEW.institution_id)) THEN
    RAISE EXCEPTION 'Only the school''s admin can choose its mentors' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_school_mentor ON public.users;
CREATE TRIGGER guard_school_mentor BEFORE INSERT OR UPDATE OF school_mentor ON public.users
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_school_mentor();

-- Only the school's admin or a platform admin makes a class a school programme.
CREATE OR REPLACE FUNCTION app_private.guard_school_programme()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.school_programme IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN false ELSE OLD.school_programme END)
     AND NOT (app_private.is_trusted_caller() OR app_private.is_platform_admin()
              OR app_private.is_institution_admin_of(NEW.institution_id)) THEN
    RAISE EXCEPTION 'Only the school''s admin starts school programmes' USING ERRCODE = '42501';
  END IF;
  IF NEW.school_programme AND NEW.institution_id IS NULL THEN
    RAISE EXCEPTION 'A school programme belongs to a school' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_school_programme ON public.classes;
CREATE TRIGGER guard_school_programme BEFORE INSERT OR UPDATE OF school_programme, institution_id ON public.classes
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_school_programme();

REVOKE ALL ON FUNCTION app_private.guard_school_mentor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.guard_school_programme() FROM PUBLIC, anon, authenticated;

-- An unused 8-character join code (no look-alike characters).
CREATE OR REPLACE FUNCTION app_private.new_class_code()
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
BEGIN
  LOOP
    SELECT string_agg(substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1), '')
    INTO v_code FROM generate_series(1, 8);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.classes WHERE code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;
REVOKE ALL ON FUNCTION app_private.new_class_code() FROM PUBLIC, anon, authenticated;

-- A school admin (or platform admin) makes one of the school's teachers a
-- school mentor, or stops.
CREATE OR REPLACE FUNCTION public.set_school_mentor(p_user uuid, p_on boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t public.users;
BEGIN
  SELECT * INTO t FROM public.users WHERE id = p_user;
  IF NOT FOUND OR t.role <> 'teacher' OR t.institution_id IS NULL THEN
    RAISE EXCEPTION 'Only teachers at a school can be school mentors' USING ERRCODE = '22023';
  END IF;
  IF NOT (app_private.is_institution_admin_of(t.institution_id) OR app_private.is_platform_admin()) THEN
    RAISE EXCEPTION 'Only the teacher''s school admin can do this' USING ERRCODE = '42501';
  END IF;
  IF t.school_mentor = coalesce(p_on, false) THEN
    RETURN;
  END IF;
  UPDATE public.users SET school_mentor = coalesce(p_on, false) WHERE id = p_user;
  INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, metadata)
  VALUES (p_user, 'role_changed',
          CASE WHEN p_on THEN 'You''re now a school mentor' ELSE 'You''re no longer a school mentor' END,
          CASE WHEN p_on THEN 'You can run your school''s programmes and their production projects.'
               ELSE 'Your school admin removed your mentor role.' END,
          'medium', '/dashboard/projects', jsonb_build_object('school_mentor', p_on));
END;
$$;

-- Start a programme group.
--   p_scope 'school':      school admin (their school) or platform admin
--                          (the mentor's school); only that school's
--                          learners can join.
--   p_scope 'mentorship' / 'fellowship': platform admin only; learners from
--                          every school at that stage can join.
CREATE OR REPLACE FUNCTION public.create_programme_group(
  p_name text, p_mentor uuid, p_scope text, p_description text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.users;
  v_school uuid;
  v_id uuid;
  v_code text := app_private.new_class_code();
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF length(v_name) < 3 THEN
    RAISE EXCEPTION 'Give the programme a name' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO m FROM public.users WHERE id = p_mentor;
  IF NOT FOUND OR m.role <> 'teacher' THEN
    RAISE EXCEPTION 'Choose a teacher to run the programme' USING ERRCODE = '22023';
  END IF;

  IF p_scope = 'school' THEN
    v_school := m.institution_id;
    IF v_school IS NULL THEN
      RAISE EXCEPTION 'That teacher isn''t at a school' USING ERRCODE = '22023';
    END IF;
    IF NOT (app_private.is_institution_admin_of(v_school) OR app_private.is_platform_admin()) THEN
      RAISE EXCEPTION 'School admins start programmes with their own school''s teachers' USING ERRCODE = '42501';
    END IF;
    UPDATE public.users SET school_mentor = true WHERE id = m.id AND NOT school_mentor;
    INSERT INTO public.classes (name, description, code, teacher_id, institution_id, school_programme)
    VALUES (v_name, nullif(btrim(coalesce(p_description, '')), ''), v_code, m.id, v_school, true)
    RETURNING id INTO v_id;
  ELSIF p_scope IN ('mentorship', 'fellowship') THEN
    PERFORM app_private.require_platform_admin();
    UPDATE public.users SET is_programme_mentor = true WHERE id = m.id AND NOT is_programme_mentor;
    INSERT INTO public.classes (name, description, code, teacher_id, cohort_stage)
    VALUES (v_name, nullif(btrim(coalesce(p_description, '')), ''), v_code, m.id, p_scope)
    RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'Unknown programme type' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
  VALUES (m.id, 'class_created', left('You''re running ' || v_name, 255),
          'Share the join code ' || v_code || ' with the learners taking part, then start a production project.',
          'high', '/dashboard/teacher/classes/' || v_id, 'Open',
          jsonb_build_object('class_id', v_id));
  RETURN jsonb_build_object('id', v_id, 'code', v_code);
END;
$$;

-- Joining: as before, plus school programmes only take their school's learners.
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

-- Who runs a project: the group's teacher, a platform admin, or (for a
-- school programme) the school's admin.
CREATE OR REPLACE FUNCTION app_private.mentors_project(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.production_projects p
    JOIN public.classes c ON c.id = p.class_id
    WHERE p.id = p_project
      AND (c.teacher_id = auth.uid()
           OR (c.school_programme AND app_private.is_institution_admin_of(c.institution_id))))
$$;

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
  IF v_class.cohort_stage IS NULL AND NOT v_class.school_programme THEN
    RAISE EXCEPTION 'Production projects are for programme groups (mentorship, fellowship or a school programme)' USING ERRCODE = '22023';
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

-- Groups the caller can start projects in.
DROP FUNCTION IF EXISTS public.project_groups();
CREATE OR REPLACE FUNCTION public.project_groups()
RETURNS TABLE (
  id uuid, name text, scope text, school_name text, code text,
  mentor_id uuid, mentor_name text, students bigint, projects bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id, c.name::text,
         CASE WHEN c.school_programme THEN 'school' ELSE c.cohort_stage END,
         i.name::text, c.code::text, c.teacher_id,
         app_private.project_name(c.teacher_id),
         (SELECT count(*) FROM public.enrollments e
           WHERE e.class_id = c.id AND e.status IN ('enrolled', 'active')),
         (SELECT count(*) FROM public.production_projects p WHERE p.class_id = c.id)
  FROM public.classes c
  LEFT JOIN public.institutions i ON i.id = c.institution_id
  WHERE (c.cohort_stage IS NOT NULL OR c.school_programme)
    AND coalesce(c.status, 'active') <> 'archived'
    AND (c.teacher_id = auth.uid()
         OR app_private.is_platform_admin()
         OR (c.school_programme AND app_private.is_institution_admin_of(c.institution_id)))
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
    'groups', (SELECT count(*) FROM public.project_groups())
  )
  FROM public.users u WHERE u.id = auth.uid();
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.set_school_mentor(uuid, boolean)',
    'public.create_programme_group(text, uuid, text, text)',
    'public.join_class_by_code(text)',
    'public.create_production_project(uuid, text, text, text)',
    'public.project_groups()',
    'public.my_project_access()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
