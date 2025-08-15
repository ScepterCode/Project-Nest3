const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixRubricTriggerDirect() {
  console.log('🔧 Fixing Rubric Trigger Directly...\n');

  try {
    // Step 1: Drop existing triggers
    console.log('1. Dropping existing triggers...');
    
    await supabase.rpc('exec', {
      sql: 'DROP TRIGGER IF EXISTS update_rubric_points_on_criteria_change ON public.rubric_criteria;'
    });
    
    await supabase.rpc('exec', {
      sql: 'DROP TRIGGER IF EXISTS update_rubric_points_on_level_change ON public.rubric_levels;'
    });
    
    console.log('✅ Triggers dropped');

    // Step 2: Create new function
    console.log('2. Creating new function...');
    
    const functionSQL = `
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
$$ LANGUAGE plpgsql;`;

    await supabase.rpc('exec', { sql: functionSQL });
    console.log('✅ Function created');

    // Step 3: Create new triggers
    console.log('3. Creating new triggers...');
    
    await supabase.rpc('exec', {
      sql: `CREATE TRIGGER update_rubric_points_on_criteria_change
            AFTER INSERT OR UPDATE OR DELETE ON public.rubric_criteria
            FOR EACH ROW EXECUTE FUNCTION update_rubric_total_points();`
    });
    
    await supabase.rpc('exec', {
      sql: `CREATE TRIGGER update_rubric_points_on_level_change
            AFTER INSERT OR UPDATE OR DELETE ON public.rubric_levels
            FOR EACH ROW EXECUTE FUNCTION update_rubric_total_points();`
    });
    
    console.log('✅ Triggers created');
    console.log('🎉 Rubric trigger fix completed successfully!');

  } catch (error) {
    console.error('💥 Error applying fix:', error);
  }
}

fixRubricTriggerDirect();