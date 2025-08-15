const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSubmissionsTable() {
  console.log('🔍 Checking submissions table structure...\n');
  
  try {
    // Check if submissions table exists and its structure
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .limit(1);
      
    if (error) {
      console.log('❌ Submissions table error:', error.message);
      console.log('Error details:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ Submissions table accessible');
      console.log('Sample data structure:', data);
    }
    
    // Try to get submissions with user relationship
    console.log('\n🔍 Testing user relationship...');
    const { data: withUsers, error: userError } = await supabase
      .from('submissions')
      .select(`
        *,
        users(first_name, last_name, email)
      `)
      .limit(1);
      
    if (userError) {
      console.log('❌ User relationship error:', userError.message);
      console.log('Error details:', JSON.stringify(userError, null, 2));
    } else {
      console.log('✅ User relationship works');
    }
    
    // Check what columns exist in submissions
    console.log('\n🔍 Checking submissions table columns...');
    const { data: submissions } = await supabase
      .from('submissions')
      .select('*')
      .limit(1);
      
    if (submissions && submissions.length > 0) {
      console.log('Columns in submissions table:', Object.keys(submissions[0]));
    }
    
    // Check users table
    console.log('\n🔍 Checking users table...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, role')
      .limit(2);
      
    if (usersError) {
      console.log('❌ Users table error:', usersError.message);
    } else {
      console.log('✅ Users table accessible');
      console.log('Sample users:', users);
    }
    
  } catch (error) {
    console.error('❌ Check error:', error);
  }
}

checkSubmissionsTable().catch(console.error);