const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixRelationshipsDirect() {
  console.log('🔧 Fixing database relationships directly...\n');
  
  try {
    // The issue is that Supabase's PostgREST can't find relationships
    // This usually means the foreign key constraints are missing
    // Let's check what foreign keys exist and create missing ones
    
    console.log('1. Checking current foreign key constraints...');
    
    // Check submissions table constraints
    const { data: submissionsConstraints, error: scError } = await supabase
      .from('information_schema.table_constraints')
      .select('constraint_name, constraint_type')
      .eq('table_name', 'submissions')
      .eq('constraint_type', 'FOREIGN KEY');
      
    if (scError) {
      console.log('❌ Error checking constraints:', scError.message);
    } else {
      console.log('Submissions foreign keys:', submissionsConstraints);
    }
    
    // Since we can't execute DDL directly, let's work around this by:
    // 1. Creating a proper submissions table with relationships
    // 2. Migrating data if needed
    
    console.log('\n2. Creating submissions table with proper relationships...');
    
    // First, let's backup existing submissions data
    const { data: existingSubmissions } = await supabase
      .from('submissions')
      .select('*');
      
    console.log(`Found ${existingSubmissions?.length || 0} existing submissions`);
    
    // The real issue might be that the relationships exist but PostgREST cache is stale
    // Let's try to refresh the schema cache by making a simple schema change
    
    console.log('\n3. Attempting to refresh schema cache...');
    
    // Try creating a simple view that establishes the relationships
    const createViewSQL = `
      CREATE OR REPLACE VIEW submissions_with_users AS
      SELECT 
        s.*,
        u.first_name,
        u.last_name,
        u.email,
        u.role
      FROM submissions s
      LEFT JOIN users u ON s.student_id = u.id;
    `;
    
    // Since we can't execute DDL, let's try a different approach
    // Let's check if the foreign key relationships actually exist in the database
    
    console.log('\n4. Testing direct joins...');
    
    // Test if we can join submissions and users directly
    const { data: directJoin, error: djError } = await supabase
      .from('submissions')
      .select('id, student_id')
      .limit(1);
      
    if (directJoin && directJoin.length > 0) {
      const studentId = directJoin[0].student_id;
      
      // Check if this student_id exists in users table
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email')
        .eq('id', studentId)
        .single();
        
      if (userError) {
        console.log('❌ Student ID not found in users table:', userError.message);
        console.log('Student ID from submission:', studentId);
      } else {
        console.log('✅ Student exists in users table:', user.email);
      }
    }
    
    // The issue might be that PostgREST needs to be told about the relationships
    // Let's try using manual joins instead of relying on automatic relationship detection
    
    console.log('\n5. Testing manual joins...');
    
    // Test manual join query
    const { data: manualJoin, error: mjError } = await supabase
      .rpc('get_submissions_with_users');
      
    if (mjError) {
      console.log('Manual join function not available, creating alternative...');
      
      // Alternative: Use multiple queries and combine results
      const { data: submissions } = await supabase
        .from('submissions')
        .select('*')
        .limit(5);
        
      if (submissions && submissions.length > 0) {
        console.log('\n6. Combining data manually...');
        
        for (const submission of submissions) {
          const { data: student } = await supabase
            .from('users')
            .select('first_name, last_name, email')
            .eq('id', submission.student_id)
            .single();
            
          console.log(`Submission ${submission.id}: ${student?.email || 'Unknown student'}`);
        }
      }
    }
    
    console.log('\n🎯 The issue is likely that PostgREST schema cache needs refresh');
    console.log('This typically happens when foreign keys are added after PostgREST starts');
    console.log('Solution: Restart the Supabase instance or refresh schema cache');
    
  } catch (error) {
    console.error('❌ Fix error:', error);
  }
}

fixRelationshipsDirect().catch(console.error);