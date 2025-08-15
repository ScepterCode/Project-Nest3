const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runRelationshipFix() {
  console.log('🔧 Fixing database relationships...\n');
  
  try {
    // Read the SQL file
    const sql = fs.readFileSync('fix-submissions-relationships.sql', 'utf8');
    
    // Split into individual statements and execute them
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement) {
        console.log(`Executing statement ${i + 1}/${statements.length}...`);
        
        try {
          const { error } = await supabase.rpc('exec_sql', { 
            sql_query: statement + ';' 
          });
          
          if (error) {
            // Some constraints might already exist, that's okay
            if (error.message.includes('already exists')) {
              console.log(`⚠️  Constraint already exists (skipping)`);
            } else {
              console.log(`❌ Error: ${error.message}`);
            }
          } else {
            console.log(`✅ Success`);
          }
        } catch (err) {
          console.log(`❌ Exception: ${err.message}`);
        }
      }
    }
    
    console.log('\n🔍 Testing relationships after fix...');
    
    // Test submissions -> users relationship
    const { data: submissionsWithUsers, error: subError } = await supabase
      .from('submissions')
      .select(`
        *,
        users(first_name, last_name, email)
      `)
      .limit(1);
      
    if (subError) {
      console.log('❌ Submissions -> Users relationship still broken:', subError.message);
    } else {
      console.log('✅ Submissions -> Users relationship working!');
    }
    
    // Test other key relationships
    const { data: assignmentsWithClasses, error: acError } = await supabase
      .from('assignments')
      .select(`
        *,
        classes(name, teacher_id)
      `)
      .limit(1);
      
    if (acError) {
      console.log('❌ Assignments -> Classes relationship issue:', acError.message);
    } else {
      console.log('✅ Assignments -> Classes relationship working!');
    }
    
    const { data: enrollmentsWithUsers, error: euError } = await supabase
      .from('enrollments')
      .select(`
        *,
        users(email),
        classes(name)
      `)
      .limit(1);
      
    if (euError) {
      console.log('❌ Enrollments relationships issue:', euError.message);
    } else {
      console.log('✅ Enrollments relationships working!');
    }
    
    console.log('\n🎉 Database relationship fix completed!');
    
  } catch (error) {
    console.error('❌ Fix error:', error);
  }
}

runRelationshipFix().catch(console.error);