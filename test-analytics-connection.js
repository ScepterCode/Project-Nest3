// Test analytics database connection
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('🔍 Testing Analytics Connection...\n');

async function testConnection() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Test 1: Basic connection
    console.log('1. Testing basic connection...');
    const { data, error } = await supabase.from('classes').select('count').limit(1);
    if (error) {
      console.error('❌ Connection failed:', error.message);
      return;
    }
    console.log('✅ Basic connection works');

    // Test 2: Test assignments query that's failing
    console.log('\n2. Testing assignments query...');
    const { data: assignments, error: assignmentError } = await supabase
      .from('assignments')
      .select('id, title, class_id, teacher_id')
      .limit(3);

    if (assignmentError) {
      console.error('❌ Assignments query failed:', assignmentError);
      console.log('Error details:', JSON.stringify(assignmentError, null, 2));
    } else {
      console.log('✅ Assignments query works');
      console.log('Sample data:', assignments);
    }

    // Test 3: Test with specific teacher_id
    console.log('\n3. Testing with mock teacher_id...');
    const { data: teacherAssignments, error: teacherError } = await supabase
      .from('assignments')
      .select('id, title, class_id, teacher_id')
      .eq('teacher_id', 'test-id')
      .limit(3);

    if (teacherError) {
      console.error('❌ Teacher assignments query failed:', teacherError);
    } else {
      console.log('✅ Teacher assignments query works (no results expected)');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testConnection();