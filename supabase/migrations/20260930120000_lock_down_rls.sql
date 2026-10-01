-- =============================================================================
-- Lock down row-level security on the core tables
-- =============================================================================
-- Replaces the debugging-era "Allow authenticated users full access" policies
-- (and every other overlapping policy) on the core tables with one coherent,
-- least-privilege set, and closes the self-promotion-to-admin hole.
--
-- What changes:
--   * users         - you see yourself, your students, your teachers, and (as an
--                     institution admin) members of your institution. Nobody can
--                     change their own role/institution; signup can only create
--                     student / teacher / institution_admin.
--   * classes       - visible to the teacher, enrolled students, and the
--                     institution admin. Only the teacher can change them.
--   * assignments   - visible to the class teacher and enrolled students.
--   * enrollments   - students join ONLY via public.join_class_by_code(code).
--   * submissions   - students can't touch grade/feedback/rubric_scores or submit
--                     for someone else; teachers see only their own classes.
--   * institutions  - RLS turned ON (was off). Adds created_by.
--   * departments   - RLS turned ON (was off).
--   * notifications - no more "anyone can insert a notification for anyone".
--   * rubrics / rubric_criteria / rubric_levels - criteria and levels had RLS on
--                     with zero policies (always empty); now usable.
--   * storage       - teachers can open files submitted to their assignments.
--   * anon (signed-out) role loses all access to these tables.
--   * handle_new_user() is actually attached to auth.users now (it wasn't).
--
-- The whole migration runs in one transaction: it either fully applies or not
-- at all. Run it in the Supabase SQL editor, or with `supabase db push`.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Schema additions
-- -----------------------------------------------------------------------------

-- Lets the institution-setup flow prove "I created this institution" before the
-- creator's users.institution_id is set.
ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid()
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 1. Private helper schema (not exposed through the REST API)
-- -----------------------------------------------------------------------------
-- Policies call these SECURITY DEFINER helpers instead of querying other tables
-- directly. That avoids RLS recursion (policy on A reads B whose policy reads A)
-- and keeps each check to a single indexed lookup.

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE OR REPLACE FUNCTION app_private.my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION app_private.my_institution_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT institution_id FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION app_private.is_institution_admin_of(p_institution uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_institution IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'institution_admin' AND institution_id = p_institution
  )
$$;

CREATE OR REPLACE FUNCTION app_private.created_institution(p_institution uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.institutions WHERE id = p_institution AND created_by = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION app_private.teaches_class(p_class uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.classes WHERE id = p_class AND teacher_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION app_private.is_enrolled_in(p_class uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE class_id = p_class AND student_id = auth.uid() AND status IN ('enrolled', 'active')
  )
$$;

CREATE OR REPLACE FUNCTION app_private.administers_class(p_class uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = p_class AND app_private.is_institution_admin_of(c.institution_id)
  )
$$;

-- Current user teaches a class that p_student is enrolled in.
CREATE OR REPLACE FUNCTION app_private.teaches_student(p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.classes c ON c.id = e.class_id
    WHERE e.student_id = p_student AND c.teacher_id = auth.uid()
  )
$$;

-- p_teacher teaches a class the current user is enrolled in.
CREATE OR REPLACE FUNCTION app_private.is_my_teacher(p_teacher uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.classes c ON c.id = e.class_id
    WHERE e.student_id = auth.uid() AND e.status IN ('enrolled', 'active')
      AND c.teacher_id = p_teacher
  )
$$;

-- Current user is an institution admin of p_user's institution.
CREATE OR REPLACE FUNCTION app_private.administers_user(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user AND app_private.is_institution_admin_of(u.institution_id)
  )
$$;

CREATE OR REPLACE FUNCTION app_private.teaches_assignment(p_assignment uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignments a
    JOIN public.classes c ON c.id = a.class_id
    WHERE a.id = p_assignment AND c.teacher_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION app_private.is_enrolled_for_assignment(p_assignment uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignments a
    JOIN public.enrollments e ON e.class_id = a.class_id
    WHERE a.id = p_assignment AND e.student_id = auth.uid() AND e.status IN ('enrolled', 'active')
  )
$$;

-- Current user was assigned to peer-review this submission.
CREATE OR REPLACE FUNCTION app_private.reviews_submission(p_submission uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.peer_reviews WHERE submission_id = p_submission AND reviewer_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION app_private.owns_rubric(p_rubric uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.rubrics WHERE id = p_rubric AND teacher_id = auth.uid())
$$;

-- Rubric is attached to an assignment the current user teaches or is enrolled for.
CREATE OR REPLACE FUNCTION app_private.can_view_rubric(p_rubric uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.owns_rubric(p_rubric) OR EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.rubric_id = p_rubric
      AND (app_private.teaches_class(a.class_id) OR app_private.is_enrolled_in(a.class_id))
  )
$$;

CREATE OR REPLACE FUNCTION app_private.can_view_criterion(p_criterion uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rubric_criteria rc
    WHERE rc.id = p_criterion AND app_private.can_view_rubric(rc.rubric_id)
  )
$$;

CREATE OR REPLACE FUNCTION app_private.owns_criterion(p_criterion uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rubric_criteria rc
    WHERE rc.id = p_criterion AND app_private.owns_rubric(rc.rubric_id)
  )
$$;

-- Storage paths are "<student_id>/<assignment_id>/<file>".
CREATE OR REPLACE FUNCTION app_private.teaches_submission_path(p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_folder text := split_part(p_name, '/', 2);
BEGIN
  IF v_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  RETURN app_private.teaches_assignment(v_folder::uuid);
END;
$$;

-- Trusted callers (service-role key, SQL editor, auth server) have no end-user JWT.
CREATE OR REPLACE FUNCTION app_private.is_trusted_caller()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT auth.uid() IS NULL OR coalesce(auth.role(), '') = 'service_role'
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Drop every existing policy on the tables we're rebuilding
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('users', 'classes', 'assignments', 'enrollments', 'submissions',
                        'institutions', 'departments', 'notifications',
                        'rubrics', 'rubric_criteria', 'rubric_levels')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institutions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubrics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_levels   ENABLE ROW LEVEL SECURITY;

-- Signed-out visitors get nothing. TRUNCATE/TRIGGER/REFERENCES bypass RLS, so
-- nobody outside the service role needs them.
REVOKE ALL ON public.users, public.classes, public.assignments, public.enrollments,
              public.submissions, public.institutions, public.departments,
              public.notifications, public.rubrics, public.rubric_criteria,
              public.rubric_levels
  FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES
  ON public.users, public.classes, public.assignments, public.enrollments,
     public.submissions, public.institutions, public.departments,
     public.notifications, public.rubrics, public.rubric_criteria,
     public.rubric_levels
  FROM authenticated;

-- -----------------------------------------------------------------------------
-- 3. users
-- -----------------------------------------------------------------------------

CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR app_private.teaches_student(id)
    OR app_private.is_my_teacher(id)
    OR app_private.is_institution_admin_of(institution_id)
  );

-- Fallback for accounts created before the auth trigger existed. The guard
-- trigger below restricts which roles can be self-inserted.
CREATE POLICY users_insert_self ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY users_update_by_institution_admin ON public.users
  FOR UPDATE TO authenticated
  USING (app_private.is_institution_admin_of(institution_id))
  WITH CHECK (institution_id IS NULL OR app_private.is_institution_admin_of(institution_id));

-- RLS can't restrict individual columns, so a trigger guards the privileged ones.
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
  -- They can never grant system_admin, and can't pull in users from elsewhere.
  IF v_my_role = 'institution_admin' AND v_my_inst IS NOT NULL
     AND OLD.institution_id = v_my_inst
     AND (NEW.institution_id IS NULL OR NEW.institution_id = v_my_inst)
     AND NEW.role IN ('student', 'teacher', 'department_admin', 'institution_admin')
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

DROP TRIGGER IF EXISTS guard_users_privileged_columns ON public.users;
CREATE TRIGGER guard_users_privileged_columns
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_users_privileged_columns();

-- Signup: only student / teacher / institution_admin can come from the client.
-- (search_path must include public: the users insert fires
-- create_default_notification_preferences, which uses unqualified names.)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := CASE lower(coalesce(NEW.raw_user_meta_data->>'role', ''))
                   WHEN 'teacher' THEN 'teacher'
                   WHEN 'institution' THEN 'institution_admin'
                   WHEN 'institution_admin' THEN 'institution_admin'
                   ELSE 'student'
                 END;
BEGIN
  BEGIN
    INSERT INTO public.users (id, email, first_name, last_name, role, onboarding_completed)
    VALUES (
      NEW.id,
      NEW.email,
      coalesce(NEW.raw_user_meta_data->>'first_name', ''),
      coalesce(NEW.raw_user_meta_data->>'last_name', ''),
      v_role,
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.create_default_notification_preferences()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. institutions & departments (RLS was OFF on both)
-- -----------------------------------------------------------------------------

-- Names/domains are directory information the setup flow needs to check.
CREATE POLICY institutions_select ON public.institutions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY institutions_insert ON public.institutions
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY institutions_update ON public.institutions
  FOR UPDATE TO authenticated
  USING (app_private.is_institution_admin_of(id) OR created_by = (SELECT auth.uid()))
  WITH CHECK (app_private.is_institution_admin_of(id) OR created_by = (SELECT auth.uid()));

-- Creator only (also used as the rollback in /api/institutions/create). The
-- users.institution_id foreign key blocks deleting an institution with members.
CREATE POLICY institutions_delete ON public.institutions
  FOR DELETE TO authenticated
  USING (created_by = (SELECT auth.uid()));

CREATE POLICY departments_select ON public.departments
  FOR SELECT TO authenticated
  USING (
    institution_id = app_private.my_institution_id()
    OR app_private.created_institution(institution_id)
  );

CREATE POLICY departments_write ON public.departments
  FOR ALL TO authenticated
  USING (
    app_private.is_institution_admin_of(institution_id)
    OR app_private.created_institution(institution_id)
  )
  WITH CHECK (
    app_private.is_institution_admin_of(institution_id)
    OR app_private.created_institution(institution_id)
  );

-- -----------------------------------------------------------------------------
-- 5. classes
-- -----------------------------------------------------------------------------

CREATE POLICY classes_select ON public.classes
  FOR SELECT TO authenticated
  USING (
    teacher_id = (SELECT auth.uid())
    OR app_private.is_enrolled_in(id)
    OR app_private.is_institution_admin_of(institution_id)
  );

CREATE POLICY classes_insert ON public.classes
  FOR INSERT TO authenticated
  WITH CHECK (
    teacher_id = (SELECT auth.uid())
    AND app_private.my_role() IN ('teacher', 'department_admin', 'institution_admin')
    AND (institution_id IS NULL OR institution_id = app_private.my_institution_id())
  );

CREATE POLICY classes_update ON public.classes
  FOR UPDATE TO authenticated
  USING (teacher_id = (SELECT auth.uid()))
  WITH CHECK (
    teacher_id = (SELECT auth.uid())
    AND (institution_id IS NULL OR institution_id = app_private.my_institution_id())
  );

CREATE POLICY classes_delete ON public.classes
  FOR DELETE TO authenticated
  USING (teacher_id = (SELECT auth.uid()));

-- Keeps classes.enrollment_count correct now that students can't update classes.
CREATE OR REPLACE FUNCTION public.update_enrollment_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.classes
    SET enrollment_count = coalesce(enrollment_count, 0) + 1
    WHERE id = NEW.class_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.classes
    SET enrollment_count = greatest(coalesce(enrollment_count, 1) - 1, 0)
    WHERE id = OLD.class_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.update_enrollment_count() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. assignments
-- -----------------------------------------------------------------------------

CREATE POLICY assignments_select ON public.assignments
  FOR SELECT TO authenticated
  USING (
    app_private.teaches_class(class_id)
    OR app_private.is_enrolled_in(class_id)
    OR app_private.administers_class(class_id)
  );

CREATE POLICY assignments_insert ON public.assignments
  FOR INSERT TO authenticated
  WITH CHECK (teacher_id = (SELECT auth.uid()) AND app_private.teaches_class(class_id));

CREATE POLICY assignments_update ON public.assignments
  FOR UPDATE TO authenticated
  USING (app_private.teaches_class(class_id))
  WITH CHECK (teacher_id = (SELECT auth.uid()) AND app_private.teaches_class(class_id));

CREATE POLICY assignments_delete ON public.assignments
  FOR DELETE TO authenticated
  USING (app_private.teaches_class(class_id));

-- -----------------------------------------------------------------------------
-- 7. enrollments
-- -----------------------------------------------------------------------------
-- Students no longer insert rows directly (that let them join any class by id,
-- skipping the class code). They call public.join_class_by_code() below.

CREATE POLICY enrollments_select ON public.enrollments
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR app_private.teaches_class(class_id)
    OR app_private.administers_class(class_id)
  );

CREATE POLICY enrollments_insert_by_teacher ON public.enrollments
  FOR INSERT TO authenticated
  WITH CHECK (app_private.teaches_class(class_id));

CREATE POLICY enrollments_update_by_teacher ON public.enrollments
  FOR UPDATE TO authenticated
  USING (app_private.teaches_class(class_id))
  WITH CHECK (app_private.teaches_class(class_id));

-- Teachers can remove students; students can leave a class.
CREATE POLICY enrollments_delete ON public.enrollments
  FOR DELETE TO authenticated
  USING (student_id = (SELECT auth.uid()) OR app_private.teaches_class(class_id));

CREATE OR REPLACE FUNCTION public.join_class_by_code(p_code text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_class public.classes%ROWTYPE;
  v_enrollment public.enrollments%ROWTYPE;
  v_has_enrollment boolean;
  v_active_count integer;
  v_teacher_name text;
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

  SELECT nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  INTO v_teacher_name
  FROM public.users WHERE id = v_class.teacher_id;

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

-- -----------------------------------------------------------------------------
-- 8. submissions
-- -----------------------------------------------------------------------------

CREATE POLICY submissions_select ON public.submissions
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR app_private.teaches_assignment(assignment_id)
    OR app_private.reviews_submission(id)
  );

CREATE POLICY submissions_insert_own ON public.submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = (SELECT auth.uid())
    AND app_private.is_enrolled_for_assignment(assignment_id)
  );

CREATE POLICY submissions_update_own ON public.submissions
  FOR UPDATE TO authenticated
  USING (student_id = (SELECT auth.uid()))
  WITH CHECK (
    student_id = (SELECT auth.uid())
    AND app_private.is_enrolled_for_assignment(assignment_id)
  );

CREATE POLICY submissions_update_by_teacher ON public.submissions
  FOR UPDATE TO authenticated
  USING (app_private.teaches_assignment(assignment_id))
  WITH CHECK (app_private.teaches_assignment(assignment_id));

CREATE POLICY submissions_delete_by_teacher ON public.submissions
  FOR DELETE TO authenticated
  USING (app_private.teaches_assignment(assignment_id));

-- Students must never be able to grade themselves.
CREATE OR REPLACE FUNCTION app_private.guard_submission_grading()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF app_private.is_trusted_caller() OR app_private.teaches_assignment(NEW.assignment_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.grade IS NOT NULL OR NEW.feedback IS NOT NULL OR NEW.graded_at IS NOT NULL
       OR NEW.graded_by IS NOT NULL OR NEW.rubric_scores IS NOT NULL
       OR NEW.status = 'graded' THEN
      RAISE EXCEPTION 'Only the teacher can grade a submission' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN
    RAISE EXCEPTION 'Cannot move a submission to another student or assignment'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.grade IS DISTINCT FROM OLD.grade
     OR NEW.feedback IS DISTINCT FROM OLD.feedback
     OR NEW.graded_at IS DISTINCT FROM OLD.graded_at
     OR NEW.graded_by IS DISTINCT FROM OLD.graded_by
     OR NEW.rubric_scores IS DISTINCT FROM OLD.rubric_scores
     OR (NEW.status = 'graded' AND OLD.status IS DISTINCT FROM 'graded') THEN
    RAISE EXCEPTION 'Only the teacher can grade a submission' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_submission_grading ON public.submissions;
CREATE TRIGGER guard_submission_grading
  BEFORE INSERT OR UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_submission_grading();

-- -----------------------------------------------------------------------------
-- 9. notifications
-- -----------------------------------------------------------------------------
-- Was: INSERT WITH CHECK (true) - anyone could send anyone a notification
-- (phishing links via action_url). Now only people with a real relationship.

CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR app_private.teaches_student(user_id)
    OR app_private.is_my_teacher(user_id)
    OR app_private.administers_user(user_id)
  );

CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- 10. rubrics, rubric_criteria, rubric_levels
-- -----------------------------------------------------------------------------

CREATE POLICY rubrics_select ON public.rubrics
  FOR SELECT TO authenticated
  USING (teacher_id = (SELECT auth.uid()) OR app_private.can_view_rubric(id));

CREATE POLICY rubrics_write ON public.rubrics
  FOR ALL TO authenticated
  USING (teacher_id = (SELECT auth.uid()))
  WITH CHECK (teacher_id = (SELECT auth.uid()));

CREATE POLICY rubric_criteria_select ON public.rubric_criteria
  FOR SELECT TO authenticated
  USING (app_private.can_view_rubric(rubric_id));

CREATE POLICY rubric_criteria_write ON public.rubric_criteria
  FOR ALL TO authenticated
  USING (app_private.owns_rubric(rubric_id))
  WITH CHECK (app_private.owns_rubric(rubric_id));

CREATE POLICY rubric_levels_select ON public.rubric_levels
  FOR SELECT TO authenticated
  USING (app_private.can_view_criterion(criterion_id));

CREATE POLICY rubric_levels_write ON public.rubric_levels
  FOR ALL TO authenticated
  USING (app_private.owns_criterion(criterion_id))
  WITH CHECK (app_private.owns_criterion(criterion_id));

-- -----------------------------------------------------------------------------
-- 11. Storage: submission files
-- -----------------------------------------------------------------------------
-- The old teacher policy matched `file_url LIKE '%<class name>%'`, which never
-- matches the "<student>/<assignment>/<file>" paths the app writes.

DROP POLICY IF EXISTS "Teachers can view class submissions" ON storage.objects;
CREATE POLICY "Teachers can view class submissions" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'submissions' AND app_private.teaches_submission_path(name));

-- Make PostgREST pick up the new function and column immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;
