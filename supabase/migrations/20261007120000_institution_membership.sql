-- =============================================================================
-- Institution membership: setup, join codes, and linking students via classes
-- =============================================================================
-- Nothing could put anyone into an institution: the route that created one
-- for a new institution admin had been deleted, and teachers and students had
-- no way to join. Every users.institution_id stayed NULL, so institution
-- admins saw nobody.
--
-- - create_my_institution(name): an institution admin without one creates it
--   and becomes its admin.
-- - Each institution gets a join code, readable only by its admins through
--   get_my_institution(); regenerate_institution_join_code() replaces it.
--   Codes live in app_private because public.institutions is readable by
--   every signed-in user.
-- - join_institution_by_code(code): a student or teacher without an
--   institution joins one. A teacher's classes and their enrolled students
--   (those without an institution) come along.
-- - join_class_by_code() now also puts a student without an institution into
--   the institution of the class's teacher.
--
-- The users guard trigger only lets an institution change come from an
-- admin of that institution or the institution's creator. These functions run
-- as the signed-in user, so they record a one-transaction grant in
-- app_private.institution_join_grants that the guard accepts. Clients can't
-- write that table (no grants, and app_private isn't exposed by the API).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Join codes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_private.institution_join_codes (
  institution_id uuid PRIMARY KEY REFERENCES public.institutions (id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON app_private.institution_join_codes FROM PUBLIC, anon, authenticated;

-- 8 characters from an alphabet without look-alikes (0/O, 1/I/L), drawn from
-- gen_random_uuid()'s random bytes.
CREATE OR REPLACE FUNCTION app_private.new_join_code()
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
BEGIN
  LOOP
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    FOR i IN 0..7 LOOP
      v_code := v_code || substr(v_alphabet, 1 + get_byte(v_bytes, i) % length(v_alphabet), 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM app_private.institution_join_codes WHERE code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.ensure_join_code(p_institution uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_code text;
BEGIN
  INSERT INTO app_private.institution_join_codes (institution_id, code)
  VALUES (p_institution, app_private.new_join_code())
  ON CONFLICT (institution_id) DO NOTHING;
  SELECT code INTO v_code FROM app_private.institution_join_codes
  WHERE institution_id = p_institution;
  RETURN v_code;
END;
$$;

-- -----------------------------------------------------------------------------
-- One-transaction grants the users guard accepts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_private.institution_join_grants (
  user_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  txid xid8 NOT NULL DEFAULT pg_current_xact_id(),
  PRIMARY KEY (user_id, institution_id)
);
REVOKE ALL ON app_private.institution_join_grants FROM PUBLIC, anon, authenticated;

-- Moves users with no institution into p_institution. Only called from the
-- functions below, after they've checked the caller may do it.
CREATE OR REPLACE FUNCTION app_private.link_users_to_institution(
  p_users uuid[], p_institution uuid)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO app_private.institution_join_grants (user_id, institution_id)
  SELECT u.id, p_institution FROM public.users u
  WHERE u.id = ANY (p_users) AND u.institution_id IS NULL
  ON CONFLICT (user_id, institution_id) DO UPDATE SET txid = pg_current_xact_id();

  UPDATE public.users
  SET institution_id = p_institution, updated_at = now()
  WHERE id = ANY (p_users) AND institution_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM app_private.institution_join_grants
  WHERE user_id = ANY (p_users) AND institution_id = p_institution;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION app_private.new_join_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.ensure_join_code(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.link_users_to_institution(uuid[], uuid) FROM PUBLIC, anon, authenticated;

-- Same as 20260930140000_no_department_admin_assignment.sql, plus the
-- "institution join" branch.
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

-- -----------------------------------------------------------------------------
-- Functions the app calls
-- -----------------------------------------------------------------------------

-- An institution admin without an institution creates one and becomes its admin.
CREATE OR REPLACE FUNCTION public.create_my_institution(p_name text)
RETURNS json LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_inst uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_institution public.institutions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501';
  END IF;
  SELECT role, institution_id INTO v_role, v_inst FROM public.users WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'institution_admin' THEN
    RAISE EXCEPTION 'Only institution admins can create an institution' USING ERRCODE = '42501';
  END IF;
  IF v_inst IS NOT NULL THEN
    RAISE EXCEPTION 'You already belong to an institution' USING ERRCODE = '23505';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 200 THEN
    RAISE EXCEPTION 'Institution name must be 2 to 200 characters' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.institutions (name, status, created_by)
  VALUES (v_name, 'active', v_uid)
  RETURNING * INTO v_institution;

  -- Allowed by the guard's "institution setup" branch (created_by = caller).
  UPDATE public.users SET institution_id = v_institution.id, updated_at = now()
  WHERE id = v_uid;

  RETURN json_build_object(
    'id', v_institution.id,
    'name', v_institution.name,
    'join_code', app_private.ensure_join_code(v_institution.id)
  );
END;
$$;

-- The caller's institution; the join code only for its admins.
CREATE OR REPLACE FUNCTION public.get_my_institution()
RETURNS json LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_id uuid;
  v_name text;
BEGIN
  SELECT u.role, i.id, i.name INTO v_role, v_id, v_name
  FROM public.users u JOIN public.institutions i ON i.id = u.institution_id
  WHERE u.id = v_uid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN json_build_object(
    'id', v_id,
    'name', v_name,
    'join_code', CASE WHEN v_role = 'institution_admin'
                      THEN app_private.ensure_join_code(v_id) END
  );
END;
$$;

-- Replaces the join code (e.g. after it leaked). Old code stops working.
CREATE OR REPLACE FUNCTION public.regenerate_institution_join_code()
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_inst uuid;
  v_code text := app_private.new_join_code();
BEGIN
  SELECT role, institution_id INTO v_role, v_inst FROM public.users WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'institution_admin' OR v_inst IS NULL THEN
    RAISE EXCEPTION 'Only an institution''s admins can change its join code'
      USING ERRCODE = '42501';
  END IF;
  INSERT INTO app_private.institution_join_codes (institution_id, code)
  VALUES (v_inst, v_code)
  ON CONFLICT (institution_id) DO UPDATE SET code = EXCLUDED.code, created_at = now();
  RETURN v_code;
END;
$$;

-- A student or teacher without an institution joins one with its code. A
-- teacher's classes, and their enrolled students without an institution,
-- join too.
CREATE OR REPLACE FUNCTION public.join_institution_by_code(p_code text)
RETURNS json LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_current uuid;
  v_institution public.institutions%ROWTYPE;
  v_students uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501';
  END IF;
  SELECT role, institution_id INTO v_role, v_current FROM public.users WHERE id = v_uid;
  IF v_role NOT IN ('student', 'teacher') THEN
    RAISE EXCEPTION 'Only teachers and students join an institution with a code'
      USING ERRCODE = '42501';
  END IF;

  SELECT i.* INTO v_institution
  FROM app_private.institution_join_codes c
  JOIN public.institutions i ON i.id = c.institution_id
  WHERE c.code = upper(regexp_replace(coalesce(p_code, ''), '[\s-]+', '', 'g'))
    AND i.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active institution found with that code' USING ERRCODE = 'P0002';
  END IF;

  IF v_current = v_institution.id THEN
    RAISE EXCEPTION 'You already belong to this institution' USING ERRCODE = '23505';
  ELSIF v_current IS NOT NULL THEN
    RAISE EXCEPTION 'You already belong to another institution' USING ERRCODE = '23505';
  END IF;

  PERFORM app_private.link_users_to_institution(ARRAY[v_uid], v_institution.id);

  IF v_role = 'teacher' THEN
    UPDATE public.classes SET institution_id = v_institution.id, updated_at = now()
    WHERE teacher_id = v_uid AND institution_id IS NULL;

    SELECT array_agg(DISTINCT e.student_id) INTO v_students
    FROM public.enrollments e
    JOIN public.classes c ON c.id = e.class_id
    JOIN public.users s ON s.id = e.student_id
    WHERE c.teacher_id = v_uid AND e.status IN ('enrolled', 'active')
      AND s.role = 'student' AND s.institution_id IS NULL;
    IF v_students IS NOT NULL THEN
      PERFORM app_private.link_users_to_institution(v_students, v_institution.id);
    END IF;
  END IF;

  RETURN json_build_object('id', v_institution.id, 'name', v_institution.name);
END;
$$;

REVOKE ALL ON FUNCTION public.create_my_institution(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_institution() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.regenerate_institution_join_code() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_institution_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_institution(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_institution() TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_institution_join_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_institution_by_code(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- join_class_by_code: same as 20260930120000_lock_down_rls.sql, plus a student
-- without an institution joins the teacher's.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_class_by_code(p_code text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_class public.classes%ROWTYPE;
  v_enrollment public.enrollments%ROWTYPE;
  v_has_enrollment boolean;
  v_active_count integer;
  v_teacher_name text;
  v_teacher_inst uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join a class' USING ERRCODE = '42501';
  END IF;

  -- Lock the class row so two students can't both take the last seat.
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

  SELECT * INTO v_enrollment
  FROM public.enrollments
  WHERE class_id = v_class.id AND student_id = v_uid;
  v_has_enrollment := FOUND;

  IF v_has_enrollment AND v_enrollment.status IN ('enrolled', 'active') THEN
    RAISE EXCEPTION 'You are already enrolled in this class' USING ERRCODE = '23505';
  END IF;

  IF v_class.max_enrollment IS NOT NULL THEN
    SELECT count(*) INTO v_active_count
    FROM public.enrollments
    WHERE class_id = v_class.id AND status IN ('enrolled', 'active');
    IF v_active_count >= v_class.max_enrollment THEN
      RAISE EXCEPTION 'This class has reached its maximum enrollment' USING ERRCODE = '53400';
    END IF;
  END IF;

  IF v_has_enrollment THEN
    -- Re-joining after dropping.
    UPDATE public.enrollments
    SET status = 'enrolled', enrolled_at = now(), updated_at = now()
    WHERE id = v_enrollment.id
    RETURNING * INTO v_enrollment;
  ELSE
    INSERT INTO public.enrollments (class_id, student_id, status, enrolled_at)
    VALUES (v_class.id, v_uid, 'enrolled', now())
    RETURNING * INTO v_enrollment;
  END IF;

  SELECT nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''),
         institution_id
  INTO v_teacher_name, v_teacher_inst
  FROM public.users WHERE id = v_class.teacher_id;

  -- A student without an institution joins the teacher's, so the
  -- institution's admins see them. Students already elsewhere stay put.
  IF v_teacher_inst IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.users
       WHERE id = v_uid AND role = 'student' AND institution_id IS NULL) THEN
    PERFORM app_private.link_users_to_institution(ARRAY[v_uid], v_teacher_inst);
  END IF;

  RETURN json_build_object(
    'enrollment_id', v_enrollment.id,
    'class_id', v_class.id,
    'class_name', v_class.name,
    'class_description', v_class.description,
    'teacher_name', v_teacher_name,
    'enrolled_at', v_enrollment.enrolled_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.join_class_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_class_by_code(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
