const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixGradingAccess() {
  console.log('Fixing grading access policies...');
  
  const sqlCommands = [
    'DROP POLICY IF EXISTS "Teachers can view submissions for their assignments" ON submissions;',
    'DROP POLICY IF EXISTS "Teachers can grade submissions for their assignments" ON submissions;',
    'DROP POLICY IF EXISTS "Teachers can manage their assignments" ON assignments;',
    
    `CREATE POLICY "Teachers can access submissions" ON submissions 
     FOR ALL USING (
       EXISTS (
         SELECT 1 FROM assignments 
         WHERE assignments.id = submissions.assignment_id 
         AND assignments.teacher_id = auth.uid()
       )
     );`,
     
    'CREATE POLICY "Teachers manage assignments" ON assignments FOR ALL USING (teacher_id = auth.uid());',
    
    'GRANT ALL ON assignments TO authenticated;',
    'GRANT ALL ON submissions TO authenticated;',
    'GRANT ALL ON enrollments TO authenticated;',
    
    'ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;',
    'ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;',
    'ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;'
  ];
  
  for (let i = 0; i < sqlCommands.length; i++) {
    const sql = sqlCommands[i];
    try {
      console.log(`Executing command ${i + 1} of ${sqlCommands.length}`);
      console.log('SQL:', sql.substring(0, 60) + '...');
      
      const { error } = await supabase.rpc('exec', { sql });
      if (error) {
        console.log('❌ Error:', error.message);
      } else {
        console.log('✅ Success');
      }
    } catch (e) {
      console.log('❌ Exception:', e.message);
    }
  }
  
  console.log('\nTesting access after policy update...');
  
  // Test assignments access
  try {
    const { data, error } = await supabase.from('assignments').select('id, title').limit(1);
    if (error) {
      console.log('❌ Assignments access test failed:', error.message);
    } else {
      console.log('✅ Assignments access test passed');
    }
  } catch (e) {
    console.log('❌ Assignments test error:', e.message);
  }
  
  // Test submissions access
  try {
    const { data, error } = await supabase.from('submissions').select('id').limit(1);
    if (error) {
      console.log('❌ Submissions access test failed:', error.message);
    } else {
      console.log('✅ Submissions access test passed');
    }
  } catch (e) {
    console.log('❌ Submissions test error:', e.message);
  }
  
  console.log('Policy update complete!');
}

fixGradingAccess().catch(console.error);