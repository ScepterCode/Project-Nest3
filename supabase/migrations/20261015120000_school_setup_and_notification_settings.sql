-- =============================================================================
-- School setup from admin onboarding, and notification settings that work
-- =============================================================================
-- 1. Admin onboarding asked for the school's name, type and size, a contact,
--    and its departments, then threw the answers away (they only landed in
--    users.onboarding_data). set_up_my_institution() now creates the school
--    (or updates the admin's existing one) with those details and creates
--    the chosen departments. get_my_institution() returns the details.
-- 2. notification_preferences had switches nothing read. A trigger on
--    notifications now skips a notification whose category the recipient
--    turned off. Account and class-membership notices (join requests and
--    answers, role changes) always go through: they need action.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. School details
-- -----------------------------------------------------------------------------
ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS institution_type text
    CHECK (institution_type IS NULL OR length(institution_type) <= 100),
  ADD COLUMN IF NOT EXISTS size_band text
    CHECK (size_band IS NULL OR length(size_band) <= 100),
  ADD COLUMN IF NOT EXISTS contact_name text
    CHECK (contact_name IS NULL OR length(contact_name) <= 200),
  ADD COLUMN IF NOT EXISTS contact_title text
    CHECK (contact_title IS NULL OR length(contact_title) <= 200),
  ADD COLUMN IF NOT EXISTS contact_email text
    CHECK (contact_email IS NULL OR (length(contact_email) <= 320 AND contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  ADD COLUMN IF NOT EXISTS contact_phone text
    CHECK (contact_phone IS NULL OR length(contact_phone) <= 40);

-- Creates the caller's school (institution admins without one) or updates
-- the one they administer, then adds any departments it doesn't have yet.
-- Blank details are left as they were.
CREATE OR REPLACE FUNCTION public.set_up_my_institution(
  p_name text,
  p_type text DEFAULT NULL,
  p_size text DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_title text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_departments text[] DEFAULT '{}'
)
RETURNS json LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_inst uuid;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_dept text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501';
  END IF;
  SELECT role, institution_id INTO v_role, v_inst FROM public.users WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'institution_admin' THEN
    RAISE EXCEPTION 'Only institution admins can set up a school' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NOT NULL AND (length(v_name) < 2 OR length(v_name) > 200) THEN
    RAISE EXCEPTION 'School name must be 2 to 200 characters' USING ERRCODE = '22023';
  END IF;
  IF coalesce(array_length(p_departments, 1), 0) > 30 THEN
    RAISE EXCEPTION 'Add up to 30 departments at a time' USING ERRCODE = '22023';
  END IF;

  IF v_inst IS NULL THEN
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Enter your school''s name' USING ERRCODE = '22023';
    END IF;
    -- create_my_institution checks the role again and links the admin.
    v_inst := (public.create_my_institution(v_name) ->> 'id')::uuid;
  ELSIF v_name IS NOT NULL THEN
    UPDATE public.institutions SET name = v_name, updated_at = now() WHERE id = v_inst;
  END IF;

  UPDATE public.institutions
  SET institution_type = coalesce(nullif(btrim(p_type), ''), institution_type),
      size_band        = coalesce(nullif(btrim(p_size), ''), size_band),
      contact_name     = coalesce(nullif(btrim(p_contact_name), ''), contact_name),
      contact_title    = coalesce(nullif(btrim(p_contact_title), ''), contact_title),
      contact_email    = coalesce(nullif(lower(btrim(p_contact_email)), ''), contact_email),
      contact_phone    = coalesce(nullif(btrim(p_contact_phone), ''), contact_phone),
      updated_at = now()
  WHERE id = v_inst;

  FOREACH v_dept IN ARRAY coalesce(p_departments, '{}') LOOP
    v_dept := btrim(v_dept);
    CONTINUE WHEN v_dept = '' OR length(v_dept) > 100;
    IF NOT EXISTS (SELECT 1 FROM public.departments
                   WHERE institution_id = v_inst AND lower(name) = lower(v_dept)) THEN
      INSERT INTO public.departments (name, institution_id) VALUES (v_dept, v_inst);
    END IF;
  END LOOP;

  RETURN public.get_my_institution();
END;
$$;
REVOKE ALL ON FUNCTION public.set_up_my_institution(text, text, text, text, text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_up_my_institution(text, text, text, text, text, text, text, text[]) TO authenticated;

-- Same as 20261013120000, plus the school's details for its admins.
CREATE OR REPLACE FUNCTION public.get_my_institution()
RETURNS json LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_inst public.institutions%ROWTYPE;
  v_codes app_private.institution_join_codes;
  v_departments integer;
BEGIN
  SELECT u.role INTO v_role FROM public.users u WHERE u.id = v_uid;
  SELECT i.* INTO v_inst
  FROM public.users u JOIN public.institutions i ON i.id = u.institution_id
  WHERE u.id = v_uid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_role <> 'institution_admin' THEN
    RETURN json_build_object('id', v_inst.id, 'name', v_inst.name,
                             'join_code', NULL, 'staff_code', NULL);
  END IF;
  v_codes := app_private.ensure_join_codes(v_inst.id);
  SELECT count(*) INTO v_departments FROM public.departments WHERE institution_id = v_inst.id;
  RETURN json_build_object(
    'id', v_inst.id,
    'name', v_inst.name,
    'join_code', v_codes.code,
    'staff_code', v_codes.staff_code,
    'institution_type', v_inst.institution_type,
    'size_band', v_inst.size_band,
    'contact_name', v_inst.contact_name,
    'contact_title', v_inst.contact_title,
    'contact_email', v_inst.contact_email,
    'contact_phone', v_inst.contact_phone,
    'department_count', v_departments
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Notification preferences
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.respect_notification_preferences()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_prefs public.notification_preferences%ROWTYPE;
  v_wanted boolean;
BEGIN
  SELECT * INTO v_prefs FROM public.notification_preferences WHERE user_id = NEW.user_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  v_wanted := CASE NEW.type
    WHEN 'assignment_created'   THEN v_prefs.assignment_notifications
    WHEN 'assignment_due_soon'  THEN v_prefs.assignment_notifications
    WHEN 'assignment_submitted' THEN v_prefs.assignment_notifications
    WHEN 'assignment_graded'    THEN v_prefs.grade_notifications
    WHEN 'class_announcement'   THEN v_prefs.announcement_notifications
    WHEN 'class_created'        THEN v_prefs.announcement_notifications
    WHEN 'system_message'       THEN v_prefs.system_notifications
    -- Join requests and answers, role changes: always delivered.
    ELSE true
  END;
  IF v_wanted IS FALSE THEN
    RETURN NULL; -- skip this notification
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.respect_notification_preferences() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS respect_notification_preferences ON public.notifications;
CREATE TRIGGER respect_notification_preferences
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION app_private.respect_notification_preferences();

-- Users manage only their own row (the baseline policy had no WITH CHECK
-- target role; make it explicit) and signed-out visitors get nothing.
REVOKE ALL ON public.notification_preferences FROM anon;
DROP POLICY IF EXISTS "Users can manage their own preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS notification_preferences_own ON public.notification_preferences;
CREATE POLICY notification_preferences_own ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

NOTIFY pgrst, 'reload schema';

COMMIT;
