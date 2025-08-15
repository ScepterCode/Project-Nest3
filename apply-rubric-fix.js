const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyRubricFix() {
  console.log('🔧 Applying Rubric Trigger Fix...\n');

  try {
    const sql = fs.readFileSync('fix-rubric-trigger.sql', 'utf8');
    
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.error('❌ Error applying fix:', error);
    } else {
      console.log('✅ Rubric trigger fix applied successfully');
    }

  } catch (error) {
    console.error('💥 Error reading or applying SQL:', error);
  }
}

applyRubricFix();