-- =============================================================================
-- Set-based SELECT policies on the hot tables
-- =============================================================================
-- The 2026-09-30 policies call a helper per row, e.g. for every users row:
-- teaches_student(id) OR is_my_teacher(id) OR is_institution_admin_of(...).
-- Listing an institution's 10,000 members ran those subqueries 10,000 times.
--
-- These replacements compute the caller's context once per statement (each
-- `(SELECT ...)` / `IN (SELECT ...)` below is evaluated once as an InitPlan or
-- hashed subplan) and compare row columns against it, which Postgres can use
-- with indexes. Visibility is unchanged: same people see the same rows.
-- Write policies are untouched (they touch single rows).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Caller-context helpers (SECURITY DEFINER: they read tables whose own RLS
-- would otherwise recurse). All are scoped to auth.uid().
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_private.my_admin_institution_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT institution_id FROM public.users
  WHERE id = auth.uid() AND role = 'institution_admin'
$$;

CREATE OR REPLACE FUNCTION app_private.my_taught_class_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT id FROM public.classes WHERE teacher_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION app_private.my_enrolled_class_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT class_id FROM public.enrollments
  WHERE student_id = auth.uid() AND status IN ('enrolled', 'active')
$$;

CREATE OR REPLACE FUNCTION app_private.my_admin_class_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id FROM public.classes c
  WHERE c.institution_id IS NOT NULL
    AND c.institution_id = app_private.my_admin_institution_id()
$$;

-- Students in any class the caller teaches (matches teaches_student()).
CREATE OR REPLACE FUNCTION app_private.my_student_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT e.student_id
  FROM public.enrollments e
  JOIN public.classes c ON c.id = e.class_id
  WHERE c.teacher_id = auth.uid()
$$;

-- Teachers of classes the caller is enrolled in (matches is_my_teacher()).
CREATE OR REPLACE FUNCTION app_private.my_teacher_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT c.teacher_id
  FROM public.enrollments e
  JOIN public.classes c ON c.id = e.class_id
  WHERE e.student_id = auth.uid() AND e.status IN ('enrolled', 'active')
$$;

-- Assignments in classes the caller teaches (matches teaches_assignment()).
CREATE OR REPLACE FUNCTION app_private.my_taught_assignment_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.id
  FROM public.assignments a
  JOIN public.classes c ON c.id = a.class_id
  WHERE c.teacher_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION
  app_private.my_admin_institution_id(),
  app_private.my_taught_class_ids(),
  app_private.my_enrolled_class_ids(),
  app_private.my_admin_class_ids(),
  app_private.my_student_ids(),
  app_private.my_teacher_ids(),
  app_private.my_taught_assignment_ids()
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app_private.my_admin_institution_id(),
  app_private.my_taught_class_ids(),
  app_private.my_enrolled_class_ids(),
  app_private.my_admin_class_ids(),
  app_private.my_student_ids(),
  app_private.my_teacher_ids(),
  app_private.my_taught_assignment_ids()
TO authenticated;

-- -----------------------------------------------------------------------------
-- SELECT policies
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (institution_id IS NOT NULL AND institution_id = (SELECT app_private.my_admin_institution_id()))
    OR id IN (SELECT app_private.my_student_ids())
    OR id IN (SELECT app_private.my_teacher_ids())
  );

DROP POLICY IF EXISTS classes_select ON public.classes;
CREATE POLICY classes_select ON public.classes
  FOR SELECT TO authenticated
  USING (
    teacher_id = (SELECT auth.uid())
    OR id IN (SELECT app_private.my_enrolled_class_ids())
    OR (institution_id IS NOT NULL AND institution_id = (SELECT app_private.my_admin_institution_id()))
  );

DROP POLICY IF EXISTS assignments_select ON public.assignments;
CREATE POLICY assignments_select ON public.assignments
  FOR SELECT TO authenticated
  USING (
    class_id IN (SELECT app_private.my_taught_class_ids())
    OR class_id IN (SELECT app_private.my_enrolled_class_ids())
    OR class_id IN (SELECT app_private.my_admin_class_ids())
  );

DROP POLICY IF EXISTS enrollments_select ON public.enrollments;
CREATE POLICY enrollments_select ON public.enrollments
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR class_id IN (SELECT app_private.my_taught_class_ids())
    OR class_id IN (SELECT app_private.my_admin_class_ids())
  );

DROP POLICY IF EXISTS submissions_select ON public.submissions;
CREATE POLICY submissions_select ON public.submissions
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR assignment_id IN (SELECT app_private.my_taught_assignment_ids())
  );

COMMIT;
