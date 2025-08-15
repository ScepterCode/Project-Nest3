const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function disableRubricTriggers() {
  console.log('🔧 Disabling Rubric Triggers...\n');

  try {
    // Drop the problematic triggers
    await supabase.rpc('exec', {
      sql: 'DROP TRIGGER IF EXISTS update_rubric_points_on_criteria_change ON public.rubric_criteria;'
    });
    
    await supabase.rpc('exec', {
      sql: 'DROP TRIGGER IF EXISTS update_rubric_points_on_level_change ON public.rubric_levels;'
    });
    
    console.log('✅ Triggers disabled');
    console.log('🎯 Now test rubric creation - it should work without the triggers');

  } catch (error) {
    console.error('💥 Error disabling triggers:', error);
  }
}

disableRubricTriggers();