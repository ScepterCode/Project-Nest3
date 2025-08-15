-- Fix the rubric total points update function
CREATE OR REPLACE FUNCTION update_rubric_total_points()
RETURNS TRIGGER AS $$
DECLARE
    target_rubric_id UUID;
BEGIN
    -- Determine the rubric_id based on the table being modified
    IF TG_TABLE_NAME = 'rubric_criteria' THEN
        target_rubric_id := COALESCE(NEW.rubric_id, OLD.rubric_id);
    ELSIF TG_TABLE_NAME = 'rubric_levels' THEN
        -- For rubric_levels, we need to get the rubric_id through the criterion
        SELECT rc.rubric_id INTO target_rubric_id
        FROM public.rubric_criteria rc
        WHERE rc.id = COALESCE(NEW.criterion_id, OLD.criterion_id);
    END IF;

    -- Update the rubric's total points
    UPDATE public.rubrics 
    SET total_points = (
        SELECT COALESCE(SUM(
            (SELECT MAX(points) FROM public.rubric_levels rl WHERE rl.criterion_id = rc.id)
        ), 0)
        FROM public.rubric_criteria rc 
        WHERE rc.rubric_id = target_rubric_id
    ),
    updated_at = NOW()
    WHERE id = target_rubric_id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers
DROP TRIGGER IF EXISTS update_rubric_points_on_criteria_change ON public.rubric_criteria;
DROP TRIGGER IF EXISTS update_rubric_points_on_level_change ON public.rubric_levels;

-- Recreate triggers
CREATE TRIGGER update_rubric_points_on_criteria_change
    AFTER INSERT OR UPDATE OR DELETE ON public.rubric_criteria
    FOR EACH ROW EXECUTE FUNCTION update_rubric_total_points();

CREATE TRIGGER update_rubric_points_on_level_change
    AFTER INSERT OR UPDATE OR DELETE ON public.rubric_levels
    FOR EACH ROW EXECUTE FUNCTION update_rubric_total_points();

SELECT 'Rubric triggers fixed successfully!' as status;