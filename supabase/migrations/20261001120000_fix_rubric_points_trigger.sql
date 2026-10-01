-- Fix the rubric total-points trigger so rubrics can be saved.
--
-- update_rubric_total_points() is attached to both rubric_criteria and
-- rubric_levels, but it reads NEW.rubric_id / OLD.rubric_id. rubric_levels
-- has no rubric_id column (levels hang off criterion_id), so every insert,
-- update or delete of a level failed with
--   record "new" has no field "rubric_id"
-- and no rubric with levels could ever be stored. The app worked around it by
-- keeping rubrics in the browser's localStorage.
--
-- rubric_quality_indicators also had RLS enabled with no policies, so nobody
-- could read or write them; they now follow their level's criterion.
--
-- The function now resolves the rubric for whichever table fired it, and
-- recalculates both rubrics when a criterion or level moves between parents.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_rubric_total_points()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_rubric_ids uuid[];
BEGIN
  IF TG_TABLE_NAME = 'rubric_criteria' THEN
    v_rubric_ids := ARRAY[
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.rubric_id END,
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.rubric_id END
    ];
  ELSE
    SELECT array_agg(rc.rubric_id) INTO v_rubric_ids
    FROM public.rubric_criteria rc
    WHERE rc.id IN (
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.criterion_id END,
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.criterion_id END
    );
  END IF;

  UPDATE public.rubrics r
  SET total_points = (
        SELECT COALESCE(SUM(
          (SELECT MAX(l.points) FROM public.rubric_levels l WHERE l.criterion_id = rc.id)
        ), 0)
        FROM public.rubric_criteria rc
        WHERE rc.rubric_id = r.id
      ),
      updated_at = now()
  WHERE r.id = ANY (v_rubric_ids);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger functions don't need to be callable directly.
REVOKE ALL ON FUNCTION public.update_rubric_total_points() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS rubric_quality_indicators_select ON public.rubric_quality_indicators;
CREATE POLICY rubric_quality_indicators_select ON public.rubric_quality_indicators
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rubric_levels l
    WHERE l.id = level_id AND app_private.can_view_criterion(l.criterion_id)
  ));

DROP POLICY IF EXISTS rubric_quality_indicators_write ON public.rubric_quality_indicators;
CREATE POLICY rubric_quality_indicators_write ON public.rubric_quality_indicators
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rubric_levels l
    WHERE l.id = level_id AND app_private.owns_criterion(l.criterion_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.rubric_levels l
    WHERE l.id = level_id AND app_private.owns_criterion(l.criterion_id)
  ));

REVOKE ALL ON TABLE public.rubric_quality_indicators FROM anon;

COMMIT;
