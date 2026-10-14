-- =============================================================================
-- Platform admin dashboard
-- =============================================================================
-- Functions behind /dashboard/platform for the programme operator: admin
-- invites, schools, programme overview, people lookup and support fixes,
-- storage/database health, and announcements.
--
-- Who: users with role 'system_admin' (granted only in the SQL editor; see
-- docs/platform-admin.md) who signed in with two-factor authentication
-- (JWT aal = 'aal2'). Every platform_* function checks this itself and
-- records what it changed in app_private.platform_audit.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Access check and activity log
-- =============================================================================
CREATE TABLE IF NOT EXISTS app_private.platform_audit (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON app_private.platform_audit FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'system_admin')
$$;

CREATE OR REPLACE FUNCTION app_private.require_platform_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'system_admin') THEN
    RAISE EXCEPTION 'Platform admins only' USING ERRCODE = '42501';
  END IF;
  IF coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'Enter your two-factor code first' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.log_platform_action(
  p_action text, p_target_type text, p_target_id text, p_details jsonb)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO app_private.platform_audit (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb))
$$;

REVOKE ALL ON FUNCTION app_private.is_platform_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.require_platform_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.log_platform_action(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Invites get a note, a creator and can be cancelled.
ALTER TABLE app_private.admin_invites
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- =============================================================================
-- 2. Existing functions, adjusted
-- =============================================================================
-- Guard: same as 20261007120000, plus the platform admin branch.
CREATE OR REPLACE FUNCTION app_private.guard_users_privileged_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_my_role text;
  v_my_inst uuid;
BEGIN
  IF app_private.is_trusted_caller() THEN
    RETURN NEW;
  END IF;

  -- Platform admins (signed in with two-factor) fixing accounts through the
  -- platform_* functions.
  IF app_private.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- An upsert on an existing row is checked by the UPDATE branch instead.
    IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
      RETURN NEW;
    END IF;
    IF NEW.role NOT IN ('student', 'teacher', 'institution_admin') THEN
      RAISE EXCEPTION 'Cannot self-register with role %', NEW.role USING ERRCODE = '42501';
    END IF;
    IF NEW.institution_id IS NOT NULL OR NEW.department_id IS NOT NULL THEN
      RAISE EXCEPTION 'Institution and department are assigned by an administrator'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'id and email cannot be changed here' USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.institution_id IS NOT DISTINCT FROM OLD.institution_id
     AND NEW.department_id IS NOT DISTINCT FROM OLD.department_id THEN
    RETURN NEW;
  END IF;

  SELECT role, institution_id INTO v_my_role, v_my_inst FROM public.users WHERE id = v_uid;

  -- Institution admins managing existing members of their own institution.
  -- They can never grant system_admin or department_admin, and can't pull in
  -- users from elsewhere.
  IF v_my_role = 'institution_admin' AND v_my_inst IS NOT NULL
     AND OLD.institution_id = v_my_inst
     AND (NEW.institution_id IS NULL OR NEW.institution_id = v_my_inst)
     AND NEW.role IN ('student', 'teacher', 'institution_admin')
     AND (NEW.department_id IS NULL OR EXISTS (
           SELECT 1 FROM public.departments d
           WHERE d.id = NEW.department_id AND d.institution_id = v_my_inst)) THEN
    RETURN NEW;
  END IF;

  -- Institution setup: an institution_admin with no institution claims the one
  -- they just created (see create_my_institution).
  IF NEW.id = v_uid AND OLD.role = 'institution_admin' AND NEW.role = OLD.role
     AND OLD.institution_id IS NULL AND NEW.institution_id IS NOT NULL
     AND NEW.department_id IS NOT DISTINCT FROM OLD.department_id
     AND EXISTS (SELECT 1 FROM public.institutions i
                 WHERE i.id = NEW.institution_id AND i.created_by = v_uid) THEN
    RETURN NEW;
  END IF;

  -- Institution join: a user with no institution joining one through a join
  -- code or a class, granted for this transaction by
  -- app_private.link_users_to_institution.
  IF NEW.role = OLD.role
     AND OLD.institution_id IS NULL AND NEW.institution_id IS NOT NULL
     AND NEW.department_id IS NOT DISTINCT FROM OLD.department_id
     AND EXISTS (SELECT 1 FROM app_private.institution_join_grants g
                 WHERE g.user_id = NEW.id AND g.institution_id = NEW.institution_id
                   AND g.txid = pg_current_xact_id()) THEN
    RETURN NEW;
  END IF;

  -- Anyone picking a department inside the institution they already belong to.
  IF NEW.id = v_uid AND NEW.role = OLD.role
     AND NEW.institution_id IS NOT DISTINCT FROM OLD.institution_id
     AND NEW.department_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.departments d
                 WHERE d.id = NEW.department_id AND d.institution_id = OLD.institution_id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed to change role, institution or department'
    USING ERRCODE = '42501';
END;
$$;

-- Sign-up code check and sign-up: same as 20261013120000, but cancelled
-- invites no longer work.
CREATE OR REPLACE FUNCTION public.check_signup_code(p_code text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM app_private.institution_join_codes c
      JOIN public.institutions i ON i.id = c.institution_id
      WHERE c.staff_code = app_private.normalize_code(p_code) AND i.status = 'active')
      THEN 'teacher'
    WHEN EXISTS (
      SELECT 1 FROM app_private.admin_invites
      WHERE code = app_private.normalize_code(p_code)
        AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now())
      THEN 'institution_admin'
  END
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text := app_private.normalize_code(NEW.raw_user_meta_data->>'signup_code');
  v_role text := 'student';
  v_institution uuid;
BEGIN
  IF v_code <> '' THEN
    SELECT c.institution_id INTO v_institution
    FROM app_private.institution_join_codes c
    JOIN public.institutions i ON i.id = c.institution_id
    WHERE c.staff_code = v_code AND i.status = 'active';
    IF FOUND THEN
      v_role := 'teacher';
    ELSE
      UPDATE app_private.admin_invites
      SET used_by = NEW.id, used_at = now()
      WHERE code = v_code AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now();
      IF FOUND THEN
        v_role := 'institution_admin';
      END IF;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.users
      (id, email, first_name, last_name, role, institution_id, onboarding_completed)
    VALUES (
      NEW.id,
      NEW.email,
      coalesce(NEW.raw_user_meta_data->>'first_name', ''),
      coalesce(NEW.raw_user_meta_data->>'last_name', ''),
      v_role,
      v_institution,
      false
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    -- e.g. a stale users row with the same email. Never block signup over it;
    -- onboarding's upsert will reconcile.
    NULL;
  END;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 3. Platform functions (all check require_platform_admin first)
-- =============================================================================

-- ---- Invites ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_create_invite(p_note text DEFAULT NULL, p_valid_days integer DEFAULT 14)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_code text := app_private.new_join_code();
BEGIN
  PERFORM app_private.require_platform_admin();
  INSERT INTO app_private.admin_invites (code, expires_at, note, created_by)
  VALUES (v_code,
          now() + make_interval(days => greatest(1, least(coalesce(p_valid_days, 14), 365))),
          nullif(left(btrim(coalesce(p_note, '')), 300), ''),
          auth.uid());
  PERFORM app_private.log_platform_action('invite_created', 'invite', v_code,
    jsonb_build_object('note', p_note, 'valid_days', p_valid_days));
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_list_invites()
RETURNS TABLE (
  code text, note text, created_at timestamptz, expires_at timestamptz,
  used_at timestamptz, used_by_email text, used_by_name text, school_name text,
  revoked_at timestamptz, status text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_platform_admin();
  RETURN QUERY
  SELECT i.code, i.note, i.created_at, i.expires_at, i.used_at,
         u.email::text,
         nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
         s.name::text,
         i.revoked_at,
         CASE WHEN i.used_at IS NOT NULL THEN 'used'
              WHEN i.revoked_at IS NOT NULL THEN 'revoked'
              WHEN i.expires_at <= now() THEN 'expired'
              ELSE 'unused' END
  FROM app_private.admin_invites i
  LEFT JOIN public.users u ON u.id = i.used_by
  LEFT JOIN public.institutions s ON s.id = u.institution_id
  ORDER BY i.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_revoke_invite(p_code text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_platform_admin();
  UPDATE app_private.admin_invites SET revoked_at = now()
  WHERE code = p_code AND used_at IS NULL AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That invite has already been used or cancelled' USING ERRCODE = 'P0002';
  END IF;
  PERFORM app_private.log_platform_action('invite_revoked', 'invite', p_code, '{}'::jsonb);
END;
$$;

-- ---- Overview ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_overview()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_result json;
BEGIN
  PERFORM app_private.require_platform_admin();
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

-- ---- Schools ----------------------------------------------------------------
-- One row per school with its people, activity and results. Submission rate
-- is submissions / (assignments x enrolled students) per class, summed.
CREATE OR REPLACE FUNCTION public.platform_schools()
RETURNS TABLE (
  id uuid, name text, status text, institution_type text, size_band text,
  contact_name text, contact_email text, admins text,
  teachers bigint, students bigint, classes bigint, assignments bigint,
  submissions bigint, submission_rate numeric, average_grade numeric,
  last_activity timestamptz, created_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_platform_admin();
  RETURN QUERY
  WITH cls AS (
    SELECT c.institution_id, c.id,
           (SELECT count(*) FROM public.enrollments e
            WHERE e.class_id = c.id AND e.status IN ('enrolled', 'active')) AS enrolled,
           (SELECT count(*) FROM public.assignments a WHERE a.class_id = c.id) AS assignment_count
    FROM public.classes c
  ),
  subs AS (
    SELECT c.institution_id, s.submitted_at, s.grade, a.points_possible
    FROM public.submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
    JOIN public.classes c ON c.id = a.class_id
  )
  SELECT i.id, i.name::text, i.status::text, i.institution_type, i.size_band,
         i.contact_name, i.contact_email,
         (SELECT string_agg(coalesce(nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''), u.email), ', ')
          FROM public.users u WHERE u.institution_id = i.id AND u.role = 'institution_admin'),
         (SELECT count(*) FROM public.users u WHERE u.institution_id = i.id AND u.role = 'teacher'),
         (SELECT count(*) FROM public.users u WHERE u.institution_id = i.id AND u.role = 'student'),
         (SELECT count(*) FROM cls WHERE cls.institution_id = i.id),
         (SELECT coalesce(sum(cls.assignment_count), 0)::bigint FROM cls WHERE cls.institution_id = i.id),
         (SELECT count(*) FROM subs WHERE subs.institution_id = i.id),
         (SELECT CASE WHEN sum(cls.enrolled * cls.assignment_count) > 0
                      THEN round(100.0 * (SELECT count(*) FROM subs WHERE subs.institution_id = i.id)
                                 / sum(cls.enrolled * cls.assignment_count), 1) END
          FROM cls WHERE cls.institution_id = i.id),
         (SELECT round(avg(100.0 * subs.grade / nullif(subs.points_possible, 0)), 1)
          FROM subs WHERE subs.institution_id = i.id AND subs.grade IS NOT NULL),
         greatest(
           (SELECT max(subs.submitted_at) FROM subs WHERE subs.institution_id = i.id),
           (SELECT max(au.last_sign_in_at) FROM auth.users au
            JOIN public.users u ON u.id = au.id WHERE u.institution_id = i.id)),
         i.created_at
  FROM public.institutions i
  ORDER BY i.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_school_detail(p_school uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_result json;
BEGIN
  PERFORM app_private.require_platform_admin();
  SELECT json_build_object(
    'school', (SELECT row_to_json(s) FROM (
       SELECT i.id, i.name, i.status, i.institution_type, i.size_band, i.contact_name,
              i.contact_title, i.contact_email, i.contact_phone, i.created_at
       FROM public.institutions i WHERE i.id = p_school) s),
    'admins', (SELECT coalesce(json_agg(json_build_object(
                 'id', u.id, 'email', u.email,
                 'name', nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''))
                 ORDER BY u.last_name), '[]'::json)
               FROM public.users u WHERE u.institution_id = p_school AND u.role = 'institution_admin'),
    'departments', (SELECT coalesce(json_agg(d.name ORDER BY d.name), '[]'::json)
                    FROM public.departments d WHERE d.institution_id = p_school),
    'classes', (SELECT coalesce(json_agg(json_build_object(
                  'id', c.id, 'name', c.name, 'status', c.status, 'created_at', c.created_at,
                  'teacher', (SELECT nullif(btrim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')), '')
                              FROM public.users t WHERE t.id = c.teacher_id),
                  'students', (SELECT count(*) FROM public.enrollments e
                               WHERE e.class_id = c.id AND e.status IN ('enrolled', 'active')),
                  'assignments', (SELECT count(*) FROM public.assignments a WHERE a.class_id = c.id),
                  'submissions_7d', (SELECT count(*) FROM public.submissions s
                                     JOIN public.assignments a ON a.id = s.assignment_id
                                     WHERE a.class_id = c.id AND s.submitted_at > now() - interval '7 days')
                ) ORDER BY c.name), '[]'::json)
                FROM public.classes c WHERE c.institution_id = p_school)
  ) INTO v_result;
  IF v_result->'school' IS NULL OR json_typeof(v_result->'school') = 'null' THEN
    RAISE EXCEPTION 'School not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_result;
END;
$$;

-- Suspending a school stops its join and teacher codes; members keep their
-- accounts and work.
CREATE OR REPLACE FUNCTION public.platform_set_school_status(p_school uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_platform_admin();
  UPDATE public.institutions
  SET status = CASE WHEN p_active THEN 'active' ELSE 'inactive' END, updated_at = now()
  WHERE id = p_school;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'School not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM app_private.log_platform_action(
    CASE WHEN p_active THEN 'school_reactivated' ELSE 'school_suspended' END,
    'school', p_school::text, '{}'::jsonb);
END;
$$;

-- ---- People -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_search_people(p_query text, p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid, email text, name text, role text, school_id uuid, school_name text,
  last_sign_in_at timestamptz, email_confirmed boolean, disabled boolean,
  created_at timestamptz
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
         u.created_at
  FROM public.users u
  LEFT JOIN auth.users au ON au.id = u.id
  LEFT JOIN public.institutions i ON i.id = u.institution_id
  WHERE u.email ILIKE v_term
     OR (coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) ILIKE v_term
  ORDER BY u.last_name NULLS LAST, u.first_name NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
END;
$$;

-- Support fix: change someone's role. system_admin is only granted in the SQL
-- editor, never here.
CREATE OR REPLACE FUNCTION public.platform_set_role(p_user uuid, p_role text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old text;
BEGIN
  PERFORM app_private.require_platform_admin();
  IF p_role NOT IN ('student', 'teacher', 'institution_admin') THEN
    RAISE EXCEPTION 'Role must be student, teacher or institution admin' USING ERRCODE = '22023';
  END IF;
  SELECT role INTO v_old FROM public.users WHERE id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_old = 'system_admin' THEN
    RAISE EXCEPTION 'Platform admins are changed in the SQL editor' USING ERRCODE = '42501';
  END IF;
  UPDATE public.users SET role = p_role, updated_at = now() WHERE id = p_user;
  PERFORM app_private.log_platform_action('role_changed', 'user', p_user::text,
    jsonb_build_object('from', v_old, 'to', p_role));
END;
$$;

-- Support fix: put someone in a school (or none). Their department is
-- cleared because departments belong to a school.
CREATE OR REPLACE FUNCTION public.platform_move_user(p_user uuid, p_school uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old uuid;
BEGIN
  PERFORM app_private.require_platform_admin();
  SELECT institution_id INTO v_old FROM public.users WHERE id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_school IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.institutions WHERE id = p_school) THEN
    RAISE EXCEPTION 'School not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.users
  SET institution_id = p_school, department_id = NULL, updated_at = now()
  WHERE id = p_user;
  PERFORM app_private.log_platform_action('user_moved', 'user', p_user::text,
    jsonb_build_object('from', v_old, 'to', p_school));
END;
$$;

-- ---- Announcements ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_private.platform_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL,
  school_id uuid REFERENCES public.institutions (id) ON DELETE SET NULL,
  title text NOT NULL,
  message text NOT NULL,
  recipients integer NOT NULL,
  sent_by uuid,
  -- clock_timestamp: distinct even for several sends in one transaction.
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON app_private.platform_announcements FROM PUBLIC, anon, authenticated;

-- Sends a system_message notification to everyone in the audience
-- (optionally one school). People who turned off "General messages" don't
-- get it. Returns how many were sent.
CREATE OR REPLACE FUNCTION public.platform_send_announcement(
  p_audience text, p_title text, p_message text, p_school uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_title text := btrim(coalesce(p_title, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_sent integer;
BEGIN
  PERFORM app_private.require_platform_admin();
  IF p_audience NOT IN ('admins', 'teachers', 'students', 'everyone') THEN
    RAISE EXCEPTION 'Unknown audience %', p_audience USING ERRCODE = '22023';
  END IF;
  IF length(v_title) < 2 OR length(v_title) > 200 THEN
    RAISE EXCEPTION 'Title must be 2 to 200 characters' USING ERRCODE = '22023';
  END IF;
  IF length(v_message) < 2 OR length(v_message) > 2000 THEN
    RAISE EXCEPTION 'Message must be 2 to 2000 characters' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, priority, metadata)
  SELECT u.id, 'system_message', v_title, v_message, 'medium',
         jsonb_build_object('announcement', true)
  FROM public.users u
  WHERE u.role <> 'system_admin'
    AND (p_school IS NULL OR u.institution_id = p_school)
    AND CASE p_audience
          WHEN 'admins' THEN u.role = 'institution_admin'
          WHEN 'teachers' THEN u.role = 'teacher'
          WHEN 'students' THEN u.role = 'student'
          ELSE true
        END;
  GET DIAGNOSTICS v_sent = ROW_COUNT;

  INSERT INTO app_private.platform_announcements
    (audience, school_id, title, message, recipients, sent_by)
  VALUES (p_audience, p_school, v_title, v_message, v_sent, auth.uid());
  PERFORM app_private.log_platform_action('announcement_sent', 'announcement', NULL,
    jsonb_build_object('audience', p_audience, 'school', p_school, 'title', v_title, 'recipients', v_sent));
  RETURN v_sent;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_list_announcements()
RETURNS TABLE (id uuid, audience text, school_name text, title text, message text,
               recipients integer, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_platform_admin();
  RETURN QUERY
  SELECT a.id, a.audience, i.name::text, a.title, a.message, a.recipients, a.created_at
  FROM app_private.platform_announcements a
  LEFT JOIN public.institutions i ON i.id = a.school_id
  ORDER BY a.created_at DESC
  LIMIT 50;
END;
$$;

-- ---- Health -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_health()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_result json;
BEGIN
  PERFORM app_private.require_platform_admin();
  WITH objects AS (
    SELECT o.bucket_id, o.name,
           coalesce((o.metadata ->> 'size')::bigint, 0) AS bytes,
           CASE o.bucket_id
             WHEN 'class-materials' THEN app_private.material_path_class(o.name)
             WHEN 'submissions' THEN (
               SELECT a.class_id FROM public.assignments a
               WHERE a.id::text = split_part(o.name, '/', 2))
           END AS class_id
    FROM storage.objects o
  )
  SELECT json_build_object(
    'database_bytes', pg_database_size(current_database()),
    'storage_bytes', (SELECT coalesce(sum(bytes), 0) FROM objects),
    'files', (SELECT count(*) FROM objects),
    'buckets', (SELECT coalesce(json_agg(json_build_object('bucket', b.bucket_id, 'bytes', b.bytes, 'files', b.files)
                                         ORDER BY b.bytes DESC), '[]'::json)
                FROM (SELECT bucket_id, sum(bytes) AS bytes, count(*) AS files
                      FROM objects GROUP BY bucket_id) b),
    'top_classes', (SELECT coalesce(json_agg(json_build_object(
                      'class_id', t.class_id, 'class', c.name, 'school', i.name,
                      'bytes', t.bytes, 'files', t.files) ORDER BY t.bytes DESC), '[]'::json)
                    FROM (SELECT class_id, sum(bytes) AS bytes, count(*) AS files
                          FROM objects WHERE class_id IS NOT NULL
                          GROUP BY class_id ORDER BY sum(bytes) DESC LIMIT 10) t
                    JOIN public.classes c ON c.id = t.class_id
                    LEFT JOIN public.institutions i ON i.id = c.institution_id)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- ---- Grants -----------------------------------------------------------------
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.platform_create_invite(text, integer)',
    'public.platform_list_invites()',
    'public.platform_revoke_invite(text)',
    'public.platform_overview()',
    'public.platform_schools()',
    'public.platform_school_detail(uuid)',
    'public.platform_set_school_status(uuid, boolean)',
    'public.platform_search_people(text, integer)',
    'public.platform_set_role(uuid, text)',
    'public.platform_move_user(uuid, uuid)',
    'public.platform_send_announcement(text, text, text, uuid)',
    'public.platform_list_announcements()',
    'public.platform_health()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- Disabling accounts and password resets go through the server (they need
-- Supabase's admin API); it records them here with the service-role key.
CREATE OR REPLACE FUNCTION public.platform_record_action(
  p_actor uuid, p_action text, p_target_type text, p_target_id text, p_details jsonb DEFAULT '{}')
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO app_private.platform_audit (actor_id, action, target_type, target_id, details)
  VALUES (p_actor, p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb))
$$;
REVOKE ALL ON FUNCTION public.platform_record_action(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_record_action(uuid, text, text, text, jsonb) TO service_role;


NOTIFY pgrst, 'reload schema';

COMMIT;
