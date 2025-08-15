// Debug script to identify analytics issues
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugAnalyticsIssues() {
  console.log('🔍 Debugging Analytics Issues...\n');

  try {
    // Test 1: Check classes table structure
    console.log('1. Testing classes table...');
    const { data: classes, error: classError } = await supabase
      .from('classes')
      .select('*')
      .limit(3);

    if (classError) {
      console.error('❌ Classes table error:', classError);
    } else {
      console.log('✅ Classes table accessible');
      console.log('   Sample data:', classes?.length || 0, 'classes found');
      if (classes && classes.length > 0) {
        console.log('   Columns:', Object.keys(classes[0]));
      }
    }

    // Test 2: Check assignments table structure
    console.log('\n2. Testing assignments table...');
    const { data: assignments, error: assignmentError } = await supabase
      .from('assignments')
      .select('*')
      .limit(3);

    if (assignmentError) {
      console.error('❌ Assignments table error:', assignmentError);
    } else {
      console.log('✅ Assignments table accessible');
      console.log('   Sample data:', assignments?.length || 0, 'assignments found');
      if (assignments && assignments.length > 0) {
        console.log('   Columns:', Object.keys(assignments[0]));
      }
    }

    // Test 3: Check enrollments table
    console.log('\n3. Testing enrollments table...');
    const { data: enrollments, error: enrollmentError } = await supabase
      .from('enrollments')
      .select('*')
      .limit(3);

    if (enrollmentError) {
      console.error('❌ Enrollments table error:', enrollmentError);
    } else {
      console.log('✅ Enrollments table accessible');
      console.log('   Sample data:', enrollments?.length || 0, 'enrollments found');
      if (enrollments && enrollments.length > 0) {
        console.log('   Columns:', Object.keys(enrollments[0]));
      }
    }

    // Test 4: Check user_profiles table
    console.log('\n4. Testing user_profiles table...');
    const { data: profiles, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .limit(3);

    if (profileError) {
      console.error('❌ User profiles table error:', profileError);
    } else {
      console.log('✅ User profiles table accessible');
      console.log('   Sample data:', profiles?.length || 0, 'profiles found');
      if (profiles && profiles.length > 0) {
        console.log('   Columns:', Object.keys(profiles[0]));
      }
    }

    // Test 5: Check submissions table
    console.log('\n5. Testing submissions table...');
    const { data: submissions, error: submissionError } = await supabase
      .from('submissions')
      .select('*')
      .limit(3);

    if (submissionError) {
      console.error('❌ Submissions table error:', submissionError);
    } else {
      console.log('✅ Submissions table accessible');
      console.log('   Sample data:', submissions?.length || 0, 'submissions found');
      if (submissions && submissions.length > 0) {
        console.log('   Columns:', Object.keys(submissions[0]));
      }
    }

    // Test 6: Check current user
    console.log('\n6. Testing current user...');
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError) {
      console.error('❌ User auth error:', userError);
    } else if (user) {
      console.log('✅ User authenticated');
      console.log('   User ID:', user.id);
      console.log('   Email:', user.email);
    } else {
      console.log('⚠️  No authenticated user');
    }

    console.log('\n📋 Summary:');
    console.log('- Check if assignments table has teacher_id column');
    console.log('- Verify user_profiles table exists and has data');
    console.log('- Ensure proper RLS policies are in place');
    console.log('- Check if there are actual assignments created by the teacher');

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugAnalyticsIssues();