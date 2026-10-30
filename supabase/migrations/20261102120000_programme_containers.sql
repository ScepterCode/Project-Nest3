-- Programmes become containers of classes.
--
-- A programme has its own name, the schools taking part, an optional stage
-- and a status (active, suspended, ended). It holds any number of classes,
-- each run by its own tutor with its own join code; production projects
-- belong to those classes. Managers can edit it, add or remove classes and
-- tutors, suspend, end or delete it, and see its analytics:
--   * platform admins: every programme;
--   * school admins: their school's programmes (scope 'school').
--
-- Existing programme groups (one class each) are moved into programmes of
-- their own, so nothing already set up is lost.

CREATE TABLE IF NOT EXISTS public.programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 3 AND 150),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  -- 'school': one school's programme (institution_id); 'programme': run by
  -- the platform for selected schools (programme_school_links) or all.
  scope text NOT NULL CHECK (scope IN ('school', 'programme')),
  institution_id uuid REFERENCES public.institutions (id) ON DELETE CASCADE,
  stage text CHECK (stage IS NULL OR stage IN ('mentorship', 'fellowship')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'ended')),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK (scope <> 'school' OR institution_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.programme_school_links (
  programme_id uuid NOT NULL REFERENCES public.programmes (id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
  PRIMARY KEY (programme_id, institution_id)
);

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS programme_id uuid REFERENCES public.programmes (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS classes_programme_idx ON public.classes (programme_id);

ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programme_school_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.programmes, public.programme_school_links FROM PUBLIC, anon, authenticated;
-- Read and written only through the functions below.

-- Who manages a programme.
CREATE OR REPLACE FUNCTION app_private.manages_programme(p_programme uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_programme IS NOT NULL AND (
    app_private.is_platform_admin()
    OR EXISTS (SELECT 1 FROM public.programmes p
               WHERE p.id = p_programme AND p.scope = 'school'
                 AND app_private.is_institution_admin_of(p.institution_id)))
$$;
REVOKE ALL ON FUNCTION app_private.manages_programme(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.manages_programme(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.require_programme_manager(p_programme uuid)
RETURNS public.programmes LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes;
BEGIN
  SELECT * INTO p FROM public.programmes WHERE id = p_programme;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programme not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT app_private.manages_programme(p_programme) THEN
    RAISE EXCEPTION 'Only the programme''s school admin or a platform admin can change it' USING ERRCODE = '42501';
  END IF;
  RETURN p;
END;
$$;
REVOKE ALL ON FUNCTION app_private.require_programme_manager(uuid) FROM PUBLIC, anon, authenticated;

-- Only programme managers (through the functions below) move classes in or
-- out of programmes.
CREATE OR REPLACE FUNCTION app_private.guard_class_programme()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.programme_id IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.programme_id END)
     AND NOT (app_private.is_trusted_caller() OR app_private.is_platform_admin()
              OR ((TG_OP = 'INSERT' OR OLD.programme_id IS NULL OR app_private.manages_programme(OLD.programme_id))
                  AND (NEW.programme_id IS NULL OR app_private.manages_programme(NEW.programme_id)))) THEN
    RAISE EXCEPTION 'Only the programme''s managers add or remove its classes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_class_programme ON public.classes;
CREATE TRIGGER guard_class_programme BEFORE INSERT OR UPDATE OF programme_id ON public.classes
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_class_programme();
REVOKE ALL ON FUNCTION app_private.guard_class_programme() FROM PUBLIC, anon, authenticated;

-- Move existing programme groups into programmes of their own.
DO $$
DECLARE
  c record;
  v_id uuid;
BEGIN
  FOR c IN
    SELECT * FROM public.classes
    WHERE programme_id IS NULL
      AND (programme_group OR cohort_stage IS NOT NULL OR school_programme)
  LOOP
    INSERT INTO public.programmes (name, description, scope, institution_id, stage, status, created_by, created_at)
    VALUES (
      CASE WHEN length(btrim(c.name)) >= 3 THEN c.name ELSE c.name || ' programme' END,
      c.description,
      CASE WHEN c.school_programme THEN 'school' ELSE 'programme' END,
      CASE WHEN c.school_programme THEN c.institution_id END,
      c.cohort_stage,
      CASE WHEN c.status = 'archived' THEN 'ended' ELSE 'active' END,
      c.teacher_id,
      coalesce(c.created_at, now()))
    RETURNING id INTO v_id;
    UPDATE public.classes SET programme_id = v_id WHERE id = c.id;
    INSERT INTO public.programme_school_links (programme_id, institution_id)
    SELECT v_id, ps.institution_id FROM public.programme_schools ps WHERE ps.class_id = c.id;
  END LOOP;
END $$;

-- Projects can now be suspended too.
ALTER TABLE public.production_projects DROP CONSTRAINT IF EXISTS production_projects_status_check;
ALTER TABLE public.production_projects ADD CONSTRAINT production_projects_status_check
  CHECK (status IN ('active', 'suspended', 'completed', 'archived'));

CREATE OR REPLACE FUNCTION app_private.person_name(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), email::text)
  FROM public.users WHERE id = p_user;
$$;
REVOKE ALL ON FUNCTION app_private.person_name(uuid) FROM PUBLIC, anon, authenticated;

-- A tutor for a programme class: a teacher, at the programme's school for a
-- school programme. Marks them as a mentor.
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
  IF p.scope = 'school' THEN
    UPDATE public.users SET school_mentor = true WHERE id = t.id AND NOT school_mentor;
  ELSE
    UPDATE public.users SET is_programme_mentor = true WHERE id = t.id AND NOT is_programme_mentor;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app_private.check_programme_tutor(public.programmes, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.notify_new_tutor(p public.programmes, p_class uuid, p_tutor uuid, p_class_name text, p_code text)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
  VALUES (p_tutor, 'class_created', left('You''re a tutor in ' || p.name, 255),
          left('You run the class "' || p_class_name || '". Learners join with the code ' || p_code
               || '; then start production projects.', 500),
          'high', '/dashboard/teacher/classes/' || p_class, 'Open',
          jsonb_build_object('class_id', p_class, 'programme_id', p.id));
$$;
REVOKE ALL ON FUNCTION app_private.notify_new_tutor(public.programmes, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- The admins of the schools taking part (except the caller), with the codes.
CREATE OR REPLACE FUNCTION app_private.notify_programme_schools(p public.programmes, p_title text, p_message text)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
  SELECT a.id, 'class_created', left(p_title, 255), left(p_message, 500), 'high',
         '/dashboard/programmes/' || p.id, 'View programme', jsonb_build_object('programme_id', p.id)
  FROM public.users a
  WHERE a.role = 'institution_admin' AND a.institution_id IS NOT NULL
    AND a.id IS DISTINCT FROM auth.uid()
    AND CASE
          WHEN p.scope = 'school' THEN a.institution_id = p.institution_id
          WHEN EXISTS (SELECT 1 FROM public.programme_school_links l WHERE l.programme_id = p.id)
            THEN a.institution_id IN (SELECT l.institution_id FROM public.programme_school_links l WHERE l.programme_id = p.id)
          ELSE true
        END;
$$;
REVOKE ALL ON FUNCTION app_private.notify_programme_schools(public.programmes, text, text) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- Managing programmes
-- =============================================================================

-- Start a programme, optionally with its first class.
--   p_scope 'school':    a school admin's (their school) or a platform admin's
--                        (p_school) programme for one school.
--   p_scope 'programme': platform admin; p_schools limits it to those
--                        schools (empty: all); p_stage to learners at it.
CREATE OR REPLACE FUNCTION public.create_programme(
  p_name text, p_description text, p_scope text,
  p_school uuid DEFAULT NULL, p_schools uuid[] DEFAULT NULL, p_stage text DEFAULT NULL,
  p_class_name text DEFAULT NULL, p_tutor uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes;
  v_school uuid := p_school;
  v_schools uuid[] := ARRAY(SELECT DISTINCT unnest(coalesce(p_schools, '{}'::uuid[])));
  v_class jsonb;
BEGIN
  IF length(btrim(coalesce(p_name, ''))) < 3 THEN
    RAISE EXCEPTION 'Give the programme a name' USING ERRCODE = '22023';
  END IF;
  IF p_scope = 'school' THEN
    IF NOT app_private.is_platform_admin() THEN
      SELECT institution_id INTO v_school FROM public.users
      WHERE id = auth.uid() AND role = 'institution_admin';
      IF v_school IS NULL THEN
        RAISE EXCEPTION 'Only school admins and platform admins start programmes' USING ERRCODE = '42501';
      END IF;
    ELSIF v_school IS NULL AND p_tutor IS NOT NULL THEN
      SELECT institution_id INTO v_school FROM public.users WHERE id = p_tutor;
    END IF;
    IF v_school IS NULL THEN
      RAISE EXCEPTION 'Choose the school' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.programmes (name, description, scope, institution_id, created_by)
    VALUES (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), 'school', v_school, auth.uid())
    RETURNING * INTO p;
  ELSIF p_scope = 'programme' THEN
    PERFORM app_private.require_platform_admin();
    IF p_stage IS NOT NULL AND p_stage NOT IN ('mentorship', 'fellowship') THEN
      RAISE EXCEPTION 'Unknown stage' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_schools) s
               WHERE NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = s)) THEN
      RAISE EXCEPTION 'One of the chosen schools doesn''t exist' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.programmes (name, description, scope, stage, created_by)
    VALUES (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), 'programme', p_stage, auth.uid())
    RETURNING * INTO p;
    INSERT INTO public.programme_school_links (programme_id, institution_id)
    SELECT p.id, s FROM unnest(v_schools) s;
  ELSE
    RAISE EXCEPTION 'Unknown programme type' USING ERRCODE = '22023';
  END IF;

  IF app_private.is_platform_admin() THEN
    PERFORM app_private.log_platform_action('programme_created', 'programme', p.id::text,
      jsonb_build_object('name', p.name, 'scope', p.scope));
  END IF;
  PERFORM app_private.notify_programme_schools(p, 'New programme for your school: ' || p.name,
    'Open it to see its classes and their join codes for your learners.');

  IF p_tutor IS NOT NULL THEN
    v_class := public.add_programme_class(p.id, coalesce(nullif(btrim(coalesce(p_class_name, '')), ''), p.name), p_tutor);
  END IF;
  RETURN jsonb_build_object('id', p.id) || coalesce(jsonb_build_object('class', v_class), '{}'::jsonb);
END;
$$;

-- A new class in a programme, run by p_tutor.
CREATE OR REPLACE FUNCTION public.add_programme_class(p_programme uuid, p_name text, p_tutor uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes := app_private.require_programme_manager(p_programme);
  v_id uuid;
  v_code text := app_private.new_class_code();
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Give the class a name' USING ERRCODE = '22023';
  END IF;
  IF p.status = 'ended' THEN
    RAISE EXCEPTION 'This programme has ended' USING ERRCODE = '22023';
  END IF;
  PERFORM app_private.check_programme_tutor(p, p_tutor);
  INSERT INTO public.classes (name, code, teacher_id, institution_id, programme_id)
  VALUES (v_name, v_code, p_tutor,
          CASE WHEN p.scope = 'school' THEN p.institution_id END, p.id)
  RETURNING id INTO v_id;
  PERFORM app_private.notify_new_tutor(p, v_id, p_tutor, v_name, v_code);
  RETURN jsonb_build_object('id', v_id, 'code', v_code);
END;
$$;

-- Classes that could be added to a programme (not in another programme):
-- the school's classes for a school programme, any class for the platform.
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
  ORDER BY i.name NULLS LAST, c.name
  LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_programme_class(p_programme uuid, p_class uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes := app_private.require_programme_manager(p_programme);
  c public.classes;
BEGIN
  SELECT * INTO c FROM public.classes WHERE id = p_class FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found' USING ERRCODE = 'P0002';
  END IF;
  IF c.programme_id IS NOT NULL THEN
    RAISE EXCEPTION 'That class is already in a programme' USING ERRCODE = '22023';
  END IF;
  IF p.scope = 'school' AND c.institution_id IS DISTINCT FROM p.institution_id THEN
    RAISE EXCEPTION 'A school programme can only hold that school''s classes' USING ERRCODE = '22023';
  END IF;
  PERFORM app_private.check_programme_tutor(p, c.teacher_id);
  UPDATE public.classes SET programme_id = p.id WHERE id = c.id;
  PERFORM app_private.notify_new_tutor(p, c.id, c.teacher_id, c.name, c.code);
END;
$$;

-- Take a class out of a programme. The class, its learners and its work
-- stay; its production projects are suspended (they belong to programmes).
CREATE OR REPLACE FUNCTION public.detach_programme_class(p_programme uuid, p_class uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes := app_private.require_programme_manager(p_programme);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = p_class AND programme_id = p.id) THEN
    RAISE EXCEPTION 'That class isn''t in this programme' USING ERRCODE = '22023';
  END IF;
  UPDATE public.production_projects SET status = 'suspended'
  WHERE class_id = p_class AND status = 'active';
  UPDATE public.classes SET programme_id = NULL WHERE id = p_class;
END;
$$;

-- Hand a programme class to another tutor.
CREATE OR REPLACE FUNCTION public.set_programme_class_tutor(p_class uuid, p_tutor uuid)
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
  IF c.teacher_id = p_tutor THEN
    RETURN;
  END IF;
  PERFORM app_private.check_programme_tutor(p, p_tutor);
  UPDATE public.classes SET teacher_id = p_tutor, updated_at = now() WHERE id = c.id;
  PERFORM app_private.notify_new_tutor(p, c.id, p_tutor, c.name, c.code);
END;
$$;

-- Edit name, description and (platform programmes) schools and stage.
CREATE OR REPLACE FUNCTION public.update_programme(
  p_programme uuid, p_name text, p_description text,
  p_schools uuid[] DEFAULT NULL, p_stage text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes := app_private.require_programme_manager(p_programme);
  v_schools uuid[] := ARRAY(SELECT DISTINCT unnest(coalesce(p_schools, '{}'::uuid[])));
BEGIN
  IF length(btrim(coalesce(p_name, ''))) < 3 THEN
    RAISE EXCEPTION 'Give the programme a name' USING ERRCODE = '22023';
  END IF;
  UPDATE public.programmes SET
    name = btrim(p_name),
    description = nullif(btrim(coalesce(p_description, '')), '')
  WHERE id = p.id;
  IF p.scope = 'programme' THEN
    IF p_stage IS NOT NULL AND p_stage NOT IN ('mentorship', 'fellowship') THEN
      RAISE EXCEPTION 'Unknown stage' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_schools) s
               WHERE NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = s)) THEN
      RAISE EXCEPTION 'One of the chosen schools doesn''t exist' USING ERRCODE = '22023';
    END IF;
    UPDATE public.programmes SET stage = p_stage WHERE id = p.id;
    DELETE FROM public.programme_school_links WHERE programme_id = p.id;
    INSERT INTO public.programme_school_links (programme_id, institution_id)
    SELECT p.id, s FROM unnest(v_schools) s;
  END IF;
  IF app_private.is_platform_admin() THEN
    PERFORM app_private.log_platform_action('programme_updated', 'programme', p.id::text,
      jsonb_build_object('name', btrim(p_name)));
  END IF;
END;
$$;

-- Suspend (no joining or handing in; resume later), end (closed for good,
-- kept for the record) or reactivate a programme. Tutors are told.
CREATE OR REPLACE FUNCTION public.set_programme_status(p_programme uuid, p_status text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes := app_private.require_programme_manager(p_programme);
BEGIN
  IF p_status NOT IN ('active', 'suspended', 'ended') THEN
    RAISE EXCEPTION 'Unknown status' USING ERRCODE = '22023';
  END IF;
  IF p.status = p_status THEN
    RETURN;
  END IF;
  UPDATE public.programmes SET
    status = p_status,
    ended_at = CASE WHEN p_status = 'ended' THEN now() ELSE NULL END
  WHERE id = p.id;
  IF p_status = 'ended' THEN
    UPDATE public.production_projects pp SET status = 'completed', completed_at = coalesce(completed_at, now())
    FROM public.classes c
    WHERE c.id = pp.class_id AND c.programme_id = p.id AND pp.status IN ('active', 'suspended');
  END IF;
  INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, metadata)
  SELECT DISTINCT c.teacher_id, 'system_message',
         left(p.name || CASE p_status WHEN 'suspended' THEN ' is suspended'
                                      WHEN 'ended' THEN ' has ended'
                                      ELSE ' is active again' END, 255),
         CASE p_status
           WHEN 'suspended' THEN 'Learners can''t join or hand in work until it is resumed.'
           WHEN 'ended' THEN 'The programme is closed. Its classes, projects and work are kept for the record.'
           ELSE 'Learners can join and hand in work again.' END,
         'medium', '/dashboard/programmes/' || p.id, jsonb_build_object('programme_id', p.id)
  FROM public.classes c WHERE c.programme_id = p.id;
  IF app_private.is_platform_admin() THEN
    PERFORM app_private.log_platform_action('programme_' || p_status, 'programme', p.id::text,
      jsonb_build_object('name', p.name));
  END IF;
END;
$$;

-- Delete a programme and its production projects. Its classes are kept
-- (with their learners, assignments and grades) as ordinary classes.
CREATE OR REPLACE FUNCTION public.delete_programme(p_programme uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes := app_private.require_programme_manager(p_programme);
BEGIN
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

-- Older callers (one programme with one class).
DROP FUNCTION IF EXISTS public.create_programme_group(text, uuid, text, text, uuid[], text);
CREATE OR REPLACE FUNCTION public.create_programme_group(
  p_name text, p_mentor uuid, p_scope text, p_description text DEFAULT NULL,
  p_schools uuid[] DEFAULT NULL, p_stage text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v jsonb;
BEGIN
  v := public.create_programme(
    p_name, p_description,
    CASE WHEN p_scope = 'school' THEN 'school' ELSE 'programme' END,
    NULL, p_schools,
    CASE WHEN p_scope IN ('mentorship', 'fellowship') THEN p_scope ELSE p_stage END,
    p_name, p_mentor);
  RETURN jsonb_build_object('id', v -> 'class' ->> 'id', 'code', v -> 'class' ->> 'code',
                            'programme_id', v ->> 'id');
END;
$$;

-- =============================================================================
-- Reading programmes and their analytics
-- =============================================================================

-- Who can open a programme: its managers, tutors of its classes, and admins
-- of the schools taking part (read-only).
CREATE OR REPLACE FUNCTION app_private.can_view_programme(p_programme uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.manages_programme(p_programme)
      OR EXISTS (SELECT 1 FROM public.classes c WHERE c.programme_id = p_programme AND c.teacher_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.programmes p
        JOIN public.users me ON me.id = auth.uid() AND me.role = 'institution_admin' AND me.institution_id IS NOT NULL
        WHERE p.id = p_programme
          AND CASE
                WHEN p.scope = 'school' THEN p.institution_id = me.institution_id
                WHEN EXISTS (SELECT 1 FROM public.programme_school_links l WHERE l.programme_id = p.id)
                  THEN EXISTS (SELECT 1 FROM public.programme_school_links l
                               WHERE l.programme_id = p.id AND l.institution_id = me.institution_id)
                ELSE true
              END)
$$;
REVOKE ALL ON FUNCTION app_private.can_view_programme(uuid) FROM PUBLIC, anon, authenticated;

-- Totals for one programme (used by the list and the detail page).
CREATE OR REPLACE FUNCTION app_private.programme_totals(p_programme uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH cls AS (SELECT id, teacher_id FROM public.classes WHERE programme_id = p_programme),
  learners AS (
    SELECT DISTINCT e.student_id FROM public.enrollments e
    JOIN cls ON cls.id = e.class_id WHERE e.status IN ('enrolled', 'active')),
  sess AS (SELECT s.id FROM public.class_sessions s JOIN cls ON cls.id = s.class_id),
  att AS (
    SELECT a.status FROM public.session_attendance a JOIN sess ON sess.id = a.session_id
    WHERE a.status <> 'excused'),
  proj AS (SELECT pp.* FROM public.production_projects pp JOIN cls ON cls.id = pp.class_id),
  ms AS (SELECT m.* FROM public.production_milestones m JOIN proj ON proj.id = m.project_id),
  vers AS (SELECT v.* FROM public.production_milestone_versions v JOIN ms ON ms.id = v.milestone_id)
  SELECT jsonb_build_object(
    'classes', (SELECT count(*) FROM cls),
    'tutors', (SELECT count(DISTINCT teacher_id) FROM cls),
    'learners', (SELECT count(*) FROM learners),
    'pending_requests', (SELECT count(*) FROM public.enrollments e JOIN cls ON cls.id = e.class_id WHERE e.status = 'pending'),
    'schools_represented', (SELECT count(DISTINCT u.institution_id) FROM learners l
                            JOIN public.users u ON u.id = l.student_id WHERE u.institution_id IS NOT NULL),
    'sessions', (SELECT count(*) FROM sess),
    'attendance_rate', (SELECT round(avg(CASE WHEN status IN ('present', 'late') THEN 1.0 ELSE 0 END), 3) FROM att),
    'projects', (SELECT count(*) FROM proj),
    'projects_active', (SELECT count(*) FROM proj WHERE status = 'active'),
    'projects_completed', (SELECT count(*) FROM proj WHERE status = 'completed'),
    'projects_suspended', (SELECT count(*) FROM proj WHERE status = 'suspended'),
    'milestones', (SELECT count(*) FROM ms),
    'milestones_approved', (SELECT count(*) FROM ms WHERE status = 'approved'),
    'milestones_waiting', (SELECT count(*) FROM ms WHERE status = 'submitted'),
    'milestones_changes', (SELECT count(*) FROM ms WHERE status = 'changes_requested'),
    'milestones_overdue', (SELECT count(*) FROM ms WHERE status <> 'approved' AND due_date < current_date),
    'versions', (SELECT count(*) FROM vers),
    'avg_review_hours', (SELECT round(avg(extract(epoch FROM decided_at - submitted_at) / 3600)::numeric, 1)
                         FROM vers WHERE decided_at IS NOT NULL),
    'last_activity', (SELECT max(submitted_at) FROM vers)
  );
$$;
REVOKE ALL ON FUNCTION app_private.programme_totals(uuid) FROM PUBLIC, anon, authenticated;

-- Programmes the caller can see: all for platform admins; for school admins
-- their school's programmes (manageable) and the platform programmes their
-- school takes part in (read-only); for tutors, programmes they teach in.
CREATE OR REPLACE FUNCTION public.programmes_overview()
RETURNS TABLE (
  id uuid, name text, scope text, stage text, status text, school_name text,
  schools text, created_at timestamptz, can_manage boolean, totals jsonb
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, p.name, p.scope, p.stage, p.status, i.name::text,
         (SELECT string_agg(si.name, ', ' ORDER BY si.name)
          FROM public.programme_school_links l JOIN public.institutions si ON si.id = l.institution_id
          WHERE l.programme_id = p.id),
         p.created_at, app_private.manages_programme(p.id),
         app_private.programme_totals(p.id)
  FROM public.programmes p
  LEFT JOIN public.institutions i ON i.id = p.institution_id
  WHERE app_private.can_view_programme(p.id)
  ORDER BY (p.status = 'active') DESC, p.created_at DESC;
$$;

-- One programme: details, its classes and (for managers) analytics.
CREATE OR REPLACE FUNCTION public.programme_detail(p_programme uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.programmes;
  v_manage boolean := app_private.manages_programme(p_programme);
BEGIN
  SELECT * INTO p FROM public.programmes WHERE id = p_programme;
  IF NOT FOUND OR NOT app_private.can_view_programme(p_programme) THEN
    RAISE EXCEPTION 'Programme not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'programme', to_jsonb(p) || jsonb_build_object(
      'school_name', (SELECT name FROM public.institutions WHERE id = p.institution_id),
      'created_by_name', app_private.person_name(p.created_by)),
    'can_manage', v_manage,
    'schools', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name) ORDER BY i.name)
      FROM public.programme_school_links l JOIN public.institutions i ON i.id = l.institution_id
      WHERE l.programme_id = p.id), '[]'::jsonb),
    'classes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'code', c.code, 'status', c.status,
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

-- =============================================================================
-- Projects inside programmes
-- =============================================================================

-- Who runs a project: its class's tutor, the programme's managers, platform
-- admins (and, for older school programme groups, the school's admin).
CREATE OR REPLACE FUNCTION app_private.mentors_project(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.production_projects p
    JOIN public.classes c ON c.id = p.class_id
    WHERE p.id = p_project
      AND (c.teacher_id = auth.uid()
           OR app_private.manages_programme(c.programme_id)
           OR (c.school_programme AND app_private.is_institution_admin_of(c.institution_id))))
$$;

-- The programme a class belongs to must be active for new work.
CREATE OR REPLACE FUNCTION app_private.programme_open(p_class uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.status FROM public.classes c JOIN public.programmes p ON p.id = c.programme_id
  WHERE c.id = p_class;
$$;
REVOKE ALL ON FUNCTION app_private.programme_open(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_production_project(
  p_class uuid, p_title text, p_brief text DEFAULT NULL, p_assets_url text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_class public.classes;
  v_id uuid;
  v_status text;
BEGIN
  SELECT * INTO v_class FROM public.classes WHERE id = p_class;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_class.teacher_id = auth.uid() OR app_private.is_platform_admin()
          OR app_private.manages_programme(v_class.programme_id)
          OR (v_class.school_programme AND app_private.is_institution_admin_of(v_class.institution_id))) THEN
    RAISE EXCEPTION 'Only the class''s tutor or the programme''s managers can start a project' USING ERRCODE = '42501';
  END IF;
  IF v_class.programme_id IS NULL AND v_class.cohort_stage IS NULL THEN
    RAISE EXCEPTION 'Production projects are for programme classes' USING ERRCODE = '22023';
  END IF;
  v_status := app_private.programme_open(p_class);
  IF v_status IS NOT NULL AND v_status <> 'active' THEN
    RAISE EXCEPTION 'This programme is %', v_status USING ERRCODE = '22023';
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

-- Delete a project with its milestones and versions.
CREATE OR REPLACE FUNCTION public.delete_production_project(p_project uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_title text;
BEGIN
  PERFORM app_private.require_project_mentor(p_project);
  SELECT title INTO v_title FROM public.production_projects WHERE id = p_project;
  PERFORM app_private.notify_project_team(p_project, 'Project removed: ' || v_title,
    'Your mentor removed this project. Your files stay wherever you kept them.');
  DELETE FROM public.production_projects WHERE id = p_project;
  IF app_private.is_platform_admin() THEN
    PERFORM app_private.log_platform_action('project_deleted', 'project', p_project::text,
      jsonb_build_object('title', v_title));
  END IF;
END;
$$;

-- Classes the caller can start projects in.
DROP FUNCTION IF EXISTS public.project_groups();
CREATE OR REPLACE FUNCTION public.project_groups()
RETURNS TABLE (
  id uuid, name text, programme_id uuid, programme_name text, scope text, stage text,
  school_name text, schools text, code text, mentor_id uuid, mentor_name text,
  students bigint, projects bigint, can_run boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id, c.name::text, p.id, p.name,
         coalesce(p.scope, CASE WHEN c.school_programme THEN 'school' ELSE 'programme' END),
         coalesce(p.stage, c.cohort_stage),
         i.name::text,
         (SELECT string_agg(si.name, ', ' ORDER BY si.name)
          FROM public.programme_school_links l JOIN public.institutions si ON si.id = l.institution_id
          WHERE l.programme_id = p.id),
         c.code::text, c.teacher_id, app_private.person_name(c.teacher_id),
         (SELECT count(*) FROM public.enrollments e
           WHERE e.class_id = c.id AND e.status IN ('enrolled', 'active')),
         (SELECT count(*) FROM public.production_projects pp WHERE pp.class_id = c.id),
         true
  FROM public.classes c
  LEFT JOIN public.programmes p ON p.id = c.programme_id
  LEFT JOIN public.institutions i ON i.id = p.institution_id
  WHERE coalesce(c.status, 'active') <> 'archived'
    AND (c.programme_id IS NOT NULL OR c.cohort_stage IS NOT NULL)
    AND coalesce(p.status, 'active') = 'active'
    AND (c.teacher_id = auth.uid()
         OR app_private.is_platform_admin()
         OR app_private.manages_programme(c.programme_id))
  ORDER BY p.name NULLS LAST, c.name;
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

CREATE OR REPLACE FUNCTION public.update_production_project(
  p_project uuid, p_title text, p_brief text, p_assets_url text, p_status text
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old text;
BEGIN
  PERFORM app_private.require_project_mentor(p_project);
  IF p_status NOT IN ('active', 'suspended', 'completed', 'archived') THEN
    RAISE EXCEPTION 'Unknown status' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) < 3 THEN
    RAISE EXCEPTION 'Give the project a title' USING ERRCODE = '22023';
  END IF;
  SELECT status INTO v_old FROM public.production_projects WHERE id = p_project;
  UPDATE public.production_projects SET
    title = btrim(p_title),
    brief = nullif(btrim(coalesce(p_brief, '')), ''),
    assets_url = app_private.clean_link(p_assets_url),
    status = p_status,
    completed_at = CASE WHEN p_status = 'completed' THEN coalesce(completed_at, now()) ELSE NULL END
  WHERE id = p_project;
  IF p_status = 'completed' AND v_old <> 'completed' THEN
    PERFORM app_private.notify_project_team(p_project,
      'Project complete: ' || btrim(p_title), 'Your mentor marked the project as complete. Well done!');
  END IF;
  IF p_status = 'suspended' AND v_old <> 'suspended' THEN
    PERFORM app_private.notify_project_team(p_project,
      'Project paused: ' || btrim(p_title), 'Your mentor suspended the project. You can''t hand in work until it resumes.');
  ELSIF p_status = 'active' AND v_old = 'suspended' THEN
    PERFORM app_private.notify_project_team(p_project,
      'Project resumed: ' || btrim(p_title), 'You can hand in work again.');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_milestone_version(p_milestone uuid, p_link text, p_note text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ms public.production_milestones;
  v_project public.production_projects;
  v_version integer;
  v_mentor uuid;
BEGIN
  SELECT * INTO ms FROM public.production_milestones WHERE id = p_milestone FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Milestone not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT app_private.on_project_team(ms.project_id) THEN
    RAISE EXCEPTION 'Only the project team can hand in work' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_project FROM public.production_projects WHERE id = ms.project_id;
  IF v_project.status <> 'active' THEN
    RAISE EXCEPTION 'This project is %', v_project.status USING ERRCODE = '22023';
  END IF;
  IF coalesce(app_private.programme_open(v_project.class_id), 'active') <> 'active' THEN
    RAISE EXCEPTION 'This programme is %', app_private.programme_open(v_project.class_id) USING ERRCODE = '22023';
  END IF;
  IF ms.status = 'approved' THEN
    RAISE EXCEPTION 'This milestone is already approved' USING ERRCODE = '22023';
  END IF;
  IF app_private.clean_link(p_link) IS NULL THEN
    RAISE EXCEPTION 'Add a link to the work (Drive, YouTube, Vimeo…)' USING ERRCODE = '22023';
  END IF;

  -- A newer version replaces one still waiting for review.
  UPDATE public.production_milestone_versions SET decision = 'superseded'
  WHERE milestone_id = ms.id AND decision = 'pending';
  SELECT coalesce(max(version), 0) + 1 INTO v_version
  FROM public.production_milestone_versions WHERE milestone_id = ms.id;
  INSERT INTO public.production_milestone_versions (milestone_id, version, submitted_by, link_url, note)
  VALUES (ms.id, v_version, auth.uid(), app_private.clean_link(p_link), nullif(btrim(coalesce(p_note, '')), ''));
  UPDATE public.production_milestones SET status = 'submitted' WHERE id = ms.id;

  SELECT c.teacher_id INTO v_mentor FROM public.classes c WHERE c.id = v_project.class_id;
  INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
  VALUES (v_mentor, 'project_update',
          left(v_project.title || ': ' || ms.title || ' v' || v_version || ' ready for review', 255),
          left(coalesce(app_private.project_name(auth.uid()), 'The team') || ' handed in a version'
               || coalesce(': ' || nullif(btrim(coalesce(p_note, '')), ''), '.'), 500),
          'medium', '/dashboard/projects/' || v_project.id, 'Review',
          jsonb_build_object('project_id', v_project.id, 'milestone_id', ms.id));
  PERFORM app_private.notify_project_team(v_project.id,
    v_project.title || ': ' || ms.title || ' v' || v_version || ' handed in',
    coalesce(app_private.project_name(auth.uid()), 'A teammate') || ' handed in a new version for review.', 'low');
  RETURN v_version;
END;
$$;

-- Joining: programme classes follow their programme's status, stage and schools.
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

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.create_programme(text, text, text, uuid, uuid[], text, text, uuid)',
    'public.add_programme_class(uuid, text, uuid)',
    'public.programme_classes_available(uuid)',
    'public.attach_programme_class(uuid, uuid)',
    'public.detach_programme_class(uuid, uuid)',
    'public.set_programme_class_tutor(uuid, uuid)',
    'public.update_programme(uuid, text, text, uuid[], text)',
    'public.set_programme_status(uuid, text)',
    'public.delete_programme(uuid)',
    'public.create_programme_group(text, uuid, text, text, uuid[], text)',
    'public.programmes_overview()',
    'public.programme_detail(uuid)',
    'public.create_production_project(uuid, text, text, text)',
    'public.update_production_project(uuid, text, text, text, text)',
    'public.submit_milestone_version(uuid, text, text)',
    'public.delete_production_project(uuid)',
    'public.project_groups()',
    'public.my_project_access()',
    'public.join_class_by_code(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
