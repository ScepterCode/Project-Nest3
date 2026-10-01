-- Store grades as points earned, not percent.
--
-- submissions.grade was capped at 0-100 by submissions_grade_check, while the
-- grading page already saved points (and shows "grade / points_possible").
-- Any assignment worth more than 100 points therefore couldn't be graded
-- above 100, and some pages read the grade as a percent. From now on:
--
--   submissions.grade = points earned, 0 .. assignments.points_possible
--
-- Percentages are computed when displayed. All existing assignments are
-- worth 100 points, so existing grades mean the same thing on both scales
-- and need no conversion.
--
-- assignments also has a legacy `points` column next to points_possible;
-- the create form only set points_possible, so pages reading `points` saw
-- the default 100. points_possible is the source of truth; `points` is kept
-- equal to it for anything still reading the old column.

BEGIN;

-- 1. Grade range follows the assignment instead of a fixed 0-100.
ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_grade_check;
ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_grade_non_negative CHECK (grade >= 0);

COMMENT ON COLUMN public.submissions.grade IS
  'Points earned, from 0 to the assignment''s points_possible.';

CREATE OR REPLACE FUNCTION app_private.check_grade_within_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_points integer;
BEGIN
  IF NEW.grade IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT points_possible INTO v_points
  FROM public.assignments WHERE id = NEW.assignment_id;
  IF v_points IS NOT NULL AND NEW.grade > v_points THEN
    RAISE EXCEPTION 'Grade % is more than the % points this assignment is worth',
      NEW.grade, v_points USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_grade_within_points ON public.submissions;
CREATE TRIGGER check_grade_within_points
  BEFORE INSERT OR UPDATE OF grade, assignment_id ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION app_private.check_grade_within_points();

-- 2. points_possible can't drop below grades already given, and the legacy
--    `points` column mirrors it.
CREATE OR REPLACE FUNCTION app_private.sync_assignment_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_max_grade integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.points_possible IS DISTINCT FROM OLD.points_possible THEN
    SELECT max(grade) INTO v_max_grade
    FROM public.submissions WHERE assignment_id = NEW.id;
    IF v_max_grade IS NOT NULL AND NEW.points_possible < v_max_grade THEN
      RAISE EXCEPTION 'A submission already has % points; points possible can''t be lower',
        v_max_grade USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.points := NEW.points_possible;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_assignment_points ON public.assignments;
CREATE TRIGGER sync_assignment_points
  BEFORE INSERT OR UPDATE OF points, points_possible ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION app_private.sync_assignment_points();

UPDATE public.assignments
SET points = points_possible
WHERE points IS DISTINCT FROM points_possible;

ALTER TABLE public.assignments ALTER COLUMN points_possible SET NOT NULL;

REVOKE ALL ON FUNCTION app_private.check_grade_within_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.sync_assignment_points() FROM PUBLIC, anon, authenticated;

COMMIT;
