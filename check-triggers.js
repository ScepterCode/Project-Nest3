const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTriggers() {
  console.log('🔍 Checking Database Triggers...\n');

  try {
    // Check triggers on rubric_levels table
    const { data: triggers, error } = await supabase.rpc('exec', {
      sql: `
        SELECT 
          trigger_name,
          event_manipulation,
          action_statement,
          action_timing
        FROM information_schema.triggers 
        WHERE event_object_table = 'rubric_levels'
        AND event_object_schema = 'public';
      `
    });

    if (error) {
      console.error('❌ Error checking triggers:', error);
    } else {
      console.log('📋 Triggers on rubric_levels table:');
      if (triggers && triggers.length > 0) {
        triggers.forEach(trigger => {
          console.log(`  - ${trigger.trigger_name}: ${trigger.event_manipulation} ${trigger.action_timing}`);
          console.log(`    Action: ${trigger.action_statement}`);
        });
      } else {
        console.log('  No triggers found');
      }
    }

    // Also check functions that might be called
    const { data: functions, error: funcError } = await supabase.rpc('exec', {
      sql: `
        SELECT 
          routine_name,
          routine_definition
        FROM information_schema.routines 
        WHERE routine_schema = 'public'
        AND routine_name LIKE '%rubric%';
      `
    });

    if (funcError) {
      console.error('❌ Error checking functions:', funcError);
    } else {
      console.log('\n📋 Rubric-related functions:');
      if (functions && functions.length > 0) {
        functions.forEach(func => {
          console.log(`  - ${func.routine_name}`);
        });
      } else {
        console.log('  No rubric functions found');
      }
    }

  } catch (error) {
    console.error('💥 Error:', error);
  }
}

checkTriggers();