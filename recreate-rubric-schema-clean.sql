-- Clean recreation of rubric schema without problematic triggers

-- Drop all existing triggers and functions
DROP TRIGGER IF EXISTS update_rubric_points_on_criteria_change ON public.rubric_criteria;
DROP TRIGGER IF EXISTS update_rubric_points_on_level_change ON public.rubric_levels;
DROP FUNCTION IF EXISTS update_rubric_total_points();

-- The tables should already exist, so we'll just ensure they're clean
-- and add a simple function to manually update total points when needed

-- Create a simple function to calculate and update rubric total points
CREATE OR REPLACE FUNCTION calculate_rubric_total_points(rubric_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    total_points INTEGER := 0;
BEGIN
    SELECT COALESCE(SUM(
        (SELECT MAX(points) FROM public.rubric_levels rl WHERE rl.criterion_id = rc.id)
    ), 0) INTO total_points
    FROM public.rubric_criteria rc 
    WHERE rc.rubric_id = rubric_uuid;
    
    UPDATE public.rubrics 
    SET total_points = total_points,
        updated_at = NOW()
    WHERE id = rubric_uuid;
    
    RETURN total_points;
END;
$$ LANGUAGE plpgsql;

-- Create a simple trigger-free update function that can be called manually
CREATE OR REPLACE FUNCTION refresh_rubric_points(rubric_uuid UUID)
RETURNS void AS $$
BEGIN
    PERFORM calculate_rubric_total_points(rubric_uuid);
END;
$$ LANGUAGE plpgsql;

SELECT 'Clean rubric schema recreated successfully!' as status;