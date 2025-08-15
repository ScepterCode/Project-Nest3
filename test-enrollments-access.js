const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testEnrollmentsAccess() {
  console.log('🔍 Testing enrollments table access...\n');
  
  try {
    // Test 1: Basic table access
    console.log('1. Testing basic enrollments table access...');
    const { data: enrollmentTest, error: enrollmentError } = await supabase
      .from('enrollments')
      .select('count')
      .limit(1);
      
    if (enrollmentError) {
      console.log('❌ Enrollments table error:', enrollmentError.message);
      console.log('Error details:', JSON.stringify(enrollmentError, null, 2));
    } else {
      console.log('✅ Enrollments table accessible');
    }
    
    // Test 2: Check table structure
    console.log('\n2. Checking enrollments table structure...');
    const { data: enrollments, error: structureError } = await supabase
      .from('enrollments')
      .select('*')
      .limit(1);
      
    if (structureError) {
      console.log('❌ Structure check failed:', structureError.message);
    } else {
      console.log('✅ Structure check passed');
      if (enrollments && enrollments.length > 0) {
        console.log('Sample enrollment columns:');
        Object.keys(enrollments[0]).forEach(col => console.log('-', col));
      } else {
        console.log('No enrollments found in table');
      }
    }
    
    // Test 3: Check with anon key (client-side access)
    console.log('\n3. Testing client-side access (anon key)...');
    const clientSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    const { data: clientTest, error: clientError } = await clientSupabase
      .from('enrollments')
      .select('count')
      .limit(1);
      
    if (clientError) {
      console.log('❌ Client access failed:', clientError.message);
      console.log('Client error details:', JSON.stringify(clientError, null, 2));
    } else {
      console.log('✅ Client access successful');
    }
    
    // Test 4: Check RLS policies
    console.log('\n4. Testing RLS policies...');
    const { data: policyTest, error: policyError } = await supabase
      .rpc('get_table_policies', { table_name: 'enrollments' })
      .select();
      
    if (policyError) {
      console.log('⚠️  Cannot check policies:', policyError.message);
    } else {
      console.log('✅ RLS policies found:', policyTest?.length || 0);
    }
    
    // Test 5: Create test enrollment if none exist
    console.log('\n5. Checking enrollment data...');
    const { data: allEnrollments, error: allError } = await supabase
      .from('enrollments')
      .select('id, class_id, student_id, status')
      .limit(5);
      
    if (allError) {
      console.log('❌ Cannot query enrollments:', allError.message);
    } else {
      console.log('✅ Found enrollments:', allEnrollments?.length || 0);
      if (allEnrollments && allEnrollments.length > 0) {
        allEnrollments.forEach(enrollment => {
          console.log(`- Enrollment ${enrollment.id}: Student ${enrollment.student_id} in Class ${enrollment.class_id}`);
        });
      }
    }
    
    // Test 6: Test specific student query
    console.log('\n6. Testing student-specific query...');
    const studentId = 'bomaboy1996@gmail.com'; // Using email as ID for test
    
    const { data: studentEnrollments, error: studentError } = await supabase
      .from('enrollments')
      .select('class_id')
      .eq('student_id', studentId);
      
    if (studentError) {
      console.log('❌ Student query failed:', studentError.message);
    } else {
      console.log('✅ Student query successful');
      console.log('Student enrollments:', studentEnrollments?.length || 0);
    }
    
    console.log('\n🎉 Enrollments access test completed!');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testEnrollmentsAccess().catch(console.error);