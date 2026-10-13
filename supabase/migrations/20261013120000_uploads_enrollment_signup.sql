-- =============================================================================
-- Animation uploads, leaving/removing students, and sign-up codes
-- =============================================================================
-- 1. Submissions bucket: 50 MB per file (the free plan's maximum) and an
--    explicit list of types that adds video, GIF and project files. Still no
--    HTML, SVG or scripts, which signed URLs would serve inline. ZIPs from
--    Windows browsers arrive as application/x-zip-compressed, so materials
--    accept that too.
-- 2. Students can leave a class (leave_class); teachers remove students by
--    setting the enrollment to 'dropped' (already allowed by RLS).
--    classes.enrollment_count only changed on INSERT/DELETE, so drops and
--    re-joins never moved it; it's now recounted from current enrollments.
-- 3. Sign-up roles: the role chosen on the sign-up form was trusted, so
--    anyone could become a teacher or institution admin. Now:
--      - everyone signs up as a student, unless they give a valid code;
--      - an institution's teacher code makes them a teacher in it;
--      - a single-use admin invite (created by the operator with
--        create_admin_invite() in the SQL editor) makes them an
--        institution admin.
--    Existing accounts keep their roles.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Upload limits
-- -----------------------------------------------------------------------------
UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.presentation',
      'application/rtf',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-msvideo',
      'audio/mpeg',
      'audio/wav',
      'application/zip',
      'application/x-zip-compressed',
      -- Project files browsers can't name (.blend, .aep, .fla, ...).
      'application/octet-stream'
    ]
WHERE id = 'submissions';

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'application/x-zip-compressed')
WHERE id = 'class-materials'
  AND NOT ('application/x-zip-compressed' = ANY (allowed_mime_types));

-- -----------------------------------------------------------------------------
-- 2. Enrollment count, leaving a class
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_enrollment_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_class uuid;
BEGIN
  FOREACH v_class IN ARRAY ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.class_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.class_id END
  ] LOOP
    IF v_class IS NOT NULL THEN
      UPDATE public.classes
      SET enrollment_count = (
        SELECT count(*) FROM public.enrollments
        WHERE class_id = v_class AND status IN ('enrolled', 'active'))
      WHERE id = v_class;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.update_enrollment_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_enrollment_count ON public.enrollments;
CREATE TRIGGER trigger_enrollment_count
  AFTER INSERT OR DELETE OR UPDATE OF status, class_id ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_enrollment_count();

-- Correct the counts that drifted.
UPDATE public.classes c
SET enrollment_count = (
  SELECT count(*) FROM public.enrollments e
  WHERE e.class_id = c.id AND e.status IN ('enrolled', 'active'));

-- A student leaves a class. Their submissions and grades are kept; joining
-- again with the class code re-enrolls them.
CREATE OR REPLACE FUNCTION public.leave_class(p_class uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501';
  END IF;
  UPDATE public.enrollments
  SET status = 'dropped', updated_at = now()
  WHERE class_id = p_class AND student_id = auth.uid()
    AND status IN ('enrolled', 'active');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not enrolled in this class' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.leave_class(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_class(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Sign-up codes
-- -----------------------------------------------------------------------------

-- Teacher code per institution, next to the student join code.
ALTER TABLE app_private.institution_join_codes
  ADD COLUMN IF NOT EXISTS staff_code text UNIQUE;

CREATE TABLE IF NOT EXISTS app_private.admin_invites (
  code text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  used_at timestamptz
);
REVOKE ALL ON app_private.admin_invites FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.code_in_use(p_code text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM app_private.institution_join_codes
                 WHERE code = p_code OR staff_code = p_code)
      OR EXISTS (SELECT 1 FROM app_private.admin_invites WHERE code = p_code)
$$;

-- Same alphabet as before; now unique across student, teacher and admin codes.
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
    EXIT WHEN NOT app_private.code_in_use(v_code);
  END LOOP;
  RETURN v_code;
END;
$$;
REVOKE ALL ON FUNCTION app_private.new_join_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.code_in_use(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.normalize_code(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT upper(regexp_replace(coalesce(p_code, ''), '[\s-]+', '', 'g'))
$$;

-- Both codes for an institution, creating whichever is missing.
CREATE OR REPLACE FUNCTION app_private.ensure_join_codes(p_institution uuid)
RETURNS app_private.institution_join_codes
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row app_private.institution_join_codes;
BEGIN
  INSERT INTO app_private.institution_join_codes (institution_id, code, staff_code)
  VALUES (p_institution, app_private.new_join_code(), app_private.new_join_code())
  ON CONFLICT (institution_id) DO NOTHING;
  UPDATE app_private.institution_join_codes
  SET staff_code = app_private.new_join_code()
  WHERE institution_id = p_institution AND staff_code IS NULL;
  SELECT * INTO v_row FROM app_private.institution_join_codes
  WHERE institution_id = p_institution;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION app_private.ensure_join_codes(uuid) FROM PUBLIC, anon, authenticated;

-- Kept for create_my_institution (20261007120000).
CREATE OR REPLACE FUNCTION app_private.ensure_join_code(p_institution uuid)
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (app_private.ensure_join_codes(p_institution)).code
$$;

-- The caller's institution; both codes only for its admins.
CREATE OR REPLACE FUNCTION public.get_my_institution()
RETURNS json LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_id uuid;
  v_name text;
  v_codes app_private.institution_join_codes;
BEGIN
  SELECT u.role, i.id, i.name INTO v_role, v_id, v_name
  FROM public.users u JOIN public.institutions i ON i.id = u.institution_id
  WHERE u.id = v_uid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_role = 'institution_admin' THEN
    v_codes := app_private.ensure_join_codes(v_id);
  END IF;
  RETURN json_build_object(
    'id', v_id,
    'name', v_name,
    'join_code', v_codes.code,
    'staff_code', v_codes.staff_code
  );
END;
$$;

-- Replaces the student code ('student', the default) or the teacher code
-- ('staff'). The old code stops working.
DROP FUNCTION IF EXISTS public.regenerate_institution_join_code();
CREATE OR REPLACE FUNCTION public.regenerate_institution_join_code(p_kind text DEFAULT 'student')
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_inst uuid;
  v_code text := app_private.new_join_code();
BEGIN
  SELECT role, institution_id INTO v_role, v_inst FROM public.users WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'institution_admin' OR v_inst IS NULL THEN
    RAISE EXCEPTION 'Only an institution''s admins can change its codes'
      USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('student', 'staff') THEN
    RAISE EXCEPTION 'Unknown code kind %', p_kind USING ERRCODE = '22023';
  END IF;
  PERFORM app_private.ensure_join_codes(v_inst);
  IF p_kind = 'staff' THEN
    UPDATE app_private.institution_join_codes SET staff_code = v_code WHERE institution_id = v_inst;
  ELSE
    UPDATE app_private.institution_join_codes SET code = v_code, created_at = now() WHERE institution_id = v_inst;
  END IF;
  RETURN v_code;
END;
$$;
REVOKE ALL ON FUNCTION public.regenerate_institution_join_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_institution_join_code(text) TO authenticated;

-- Operator only (SQL editor / service role): a single-use code that lets one
-- person sign up as an institution admin.
--   select public.create_admin_invite();      -- valid 14 days
--   select public.create_admin_invite(30);    -- valid 30 days
CREATE OR REPLACE FUNCTION public.create_admin_invite(p_valid_days integer DEFAULT 14)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_code text := app_private.new_join_code();
BEGIN
  IF NOT app_private.is_trusted_caller() THEN
    RAISE EXCEPTION 'Admin invites are created by the programme operator'
      USING ERRCODE = '42501';
  END IF;
  INSERT INTO app_private.admin_invites (code, expires_at)
  VALUES (v_code, now() + make_interval(days => greatest(1, least(p_valid_days, 365))));
  RETURN v_code;
END;
$$;
REVOKE ALL ON FUNCTION public.create_admin_invite(integer) FROM PUBLIC, anon, authenticated;

-- What a sign-up code would make you: 'teacher', 'institution_admin' or NULL.
-- Lets the sign-up form say "that code isn't valid" before creating the
-- account. Reveals nothing about the institution.
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
        AND used_at IS NULL AND expires_at > now())
      THEN 'institution_admin'
  END
$$;
REVOKE ALL ON FUNCTION public.check_signup_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_signup_code(text) TO anon, authenticated;

-- Sign-up: the role comes from a valid code, never from the form's choice.
-- (search_path must include public: the users insert fires
-- create_default_notification_preferences, which uses unqualified names.)
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
      WHERE code = v_code AND used_at IS NULL AND expires_at > now();
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
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
