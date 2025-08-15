// Debug script to check assignment routing
// Run this to see what assignment IDs are available

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugAssignmentRouting() {
  console.log('🔍 Debugging Assignment Routing...\n');

  try {
    // Check if assignments table exists and has data
    console.log('1. Checking assignments table...');
    const { data: assignments, error: assignmentError } = await supabase
      .from('assignments')
      .select('id, title, class_id')
      .limit(5);

    if (assignmentError) {
      console.error('❌ Error accessing assignments:', assignmentError.message);
      return;
    }

    if (!assignments || assignments.length === 0) {
      console.log('⚠️  No assignments found in database');
      console.log('💡 Create some assignments first as a teacher');
      return;
    }

    console.log(`✅ Found ${assignments.length} assignments:`);
    assignments.forEach((assignment, index) => {
      console.log(`   ${index + 1}. ID: ${assignment.id} - Title: ${assignment.title}`);
    });

    // Check if classes table exists
    console.log('\n2. Checking classes table...');
    const { data: classes, error: classError } = await supabase
      .from('classes')
      .select('id, name')
      .limit(3);

    if (classError) {
      console.error('❌ Error accessing classes:', classError.message);
    } else {
      console.log(`✅ Found ${classes?.length || 0} classes`);
    }

    // Check if enrollments table exists
    console.log('\n3. Checking enrollments table...');
    const { data: enrollments, error: enrollmentError } = await supabase
      .from('enrollments')
      .select('student_id, class_id')
      .limit(3);

    if (enrollmentError) {
      console.error('❌ Error accessing enrollments:', enrollmentError.message);
    } else {
      console.log(`✅ Found ${enrollments?.length || 0} enrollments`);
    }

    // Test a specific route
    if (assignments.length > 0) {
      const testAssignmentId = assignments[0].id;
      console.log(`\n4. Testing route for assignment ID: ${testAssignmentId}`);
      console.log(`   Expected URL: /dashboard/student/assignments/${testAssignmentId}/submit`);
      console.log(`   File should exist at: app/dashboard/student/assignments/[id]/submit/page.tsx`);
    }

    console.log('\n📋 Debugging Summary:');
    console.log('- If no assignments found: Create assignments as a teacher first');
    console.log('- If assignments exist but 404 occurs: Check Next.js routing');
    console.log('- If routing works but page errors: Check component imports');

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

debugAssignmentRouting();