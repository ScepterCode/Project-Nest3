const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyCleanRubricSchema() {
  console.log('🔧 Applying Clean Rubric Schema...\n');

  try {
    const sql = fs.readFileSync('recreate-rubric-schema-clean.sql', 'utf8');
    
    // Split SQL into individual statements and execute them
    const statements = sql.split(';').filter(stmt => stmt.trim() && !stmt.trim().startsWith('--'));
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement) {
        console.log(`Executing statement ${i + 1}...`);
        try {
          const { error } = await supabase.rpc('exec', { sql: statement + ';' });
          if (error) {
            console.error(`❌ Error in statement ${i + 1}:`, error);
          } else {
            console.log(`✅ Statement ${i + 1} executed successfully`);
          }
        } catch (err) {
          console.error(`💥 Exception in statement ${i + 1}:`, err);
        }
      }
    }

    console.log('\n🎉 Clean rubric schema applied!');

  } catch (error) {
    console.error('💥 Error reading or applying SQL:', error);
  }
}

applyCleanRubricSchema();