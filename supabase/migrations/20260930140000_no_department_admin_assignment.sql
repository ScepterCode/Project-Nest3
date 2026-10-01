-- =============================================================================
-- Institution admins can no longer assign department_admin
-- =============================================================================
-- department_admin has no dashboard yet (its nav pointed at pages that don't
-- exist), so nobody should be put into that role. Same function as in
-- 20260930120000_lock_down_rls.sql with 'department_admin' removed from the
-- roles an institution admin may assign. Re-add it once the role is built.
-- =============================================================================

BEGIN;

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
  -- they just created (see /api/institutions/create).
  IF NEW.id = v_uid AND OLD.role = 'institution_admin' AND NEW.role = OLD.role
     AND OLD.institution_id IS NULL AND NEW.institution_id IS NOT NULL
     AND NEW.department_id IS NOT DISTINCT FROM OLD.department_id
     AND EXISTS (SELECT 1 FROM public.institutions i
                 WHERE i.id = NEW.institution_id AND i.created_by = v_uid) THEN
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

COMMIT;
