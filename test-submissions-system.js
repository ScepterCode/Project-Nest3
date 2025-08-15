// Test script for submissions system
// Run this after setting up the submissions table

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSubmissionsSystem() {
  console.log('🧪 Testing Submissions System...\n');

  try {
    // Test 1: Check if submissions table exists
    console.log('1. Checking submissions table...');
    const { data: tableCheck, error: tableError } = await supabase
      .from('submissions')
      .select('count')
      .limit(1);

    if (tableError) {
      console.error('❌ Submissions table not accessible:', tableError.message);
      console.log('💡 Run create-submissions-table-fixed.sql first');
      return;
    }
    console.log('✅ Submissions table exists and accessible');

    // Test 2: Check table structure
    console.log('\n2. Checking table structure...');
    const { data: structure, error: structureError } = await supabase
      .rpc('get_table_columns', { table_name: 'submissions' })
      .catch(() => null);

    // Alternative method to check structure
    const { data: sampleData, error: sampleError } = await supabase
      .from('submissions')
      .select('*')
      .limit(1);

    if (!sampleError) {
      console.log('✅ Table structure looks good');
    }

    // Test 3: Check RLS policies
    console.log('\n3. Checking RLS policies...');
    const { data: policies, error: policyError } = await supabase
      .from('pg_policies')
      .select('policyname, tablename')
      .eq('tablename', 'submissions');

    if (policies && policies.length > 0) {
      console.log('✅ RLS policies found:', policies.length);
      policies.forEach(policy => {
        console.log(`   - ${policy.policyname}`);
      });
    } else {
      console.log('⚠️  No RLS policies found - this might cause access issues');
    }

    // Test 4: Check storage bucket
    console.log('\n4. Checking storage bucket...');
    const { data: buckets, error: bucketError } = await supabase
      .storage
      .listBuckets();

    if (buckets) {
      const submissionsBucket = buckets.find(b => b.name === 'submissions');
      if (submissionsBucket) {
        console.log('✅ Submissions storage bucket exists');
      } else {
        console.log('⚠️  Submissions storage bucket not found');
      }
    }

    // Test 5: Check if we can query assignments (needed for submissions)
    console.log('\n5. Checking assignments table access...');
    const { data: assignments, error: assignmentError } = await supabase
      .from('assignments')
      .select('id, title')
      .limit(1);

    if (assignmentError) {
      console.log('⚠️  Cannot access assignments table:', assignmentError.message);
      console.log('💡 Submissions need assignments to work properly');
    } else {
      console.log('✅ Assignments table accessible');
      if (assignments && assignments.length > 0) {
        console.log(`   Found ${assignments.length} assignment(s)`);
      }
    }

    // Test 6: Check if we can query classes (needed for teacher access)
    console.log('\n6. Checking classes table access...');
    const { data: classes, error: classError } = await supabase
      .from('classes')
      .select('id, name')
      .limit(1);

    if (classError) {
      console.log('⚠️  Cannot access classes table:', classError.message);
    } else {
      console.log('✅ Classes table accessible');
      if (classes && classes.length > 0) {
        console.log(`   Found ${classes.length} class(es)`);
      }
    }

    console.log('\n🎉 Submissions system test complete!');
    console.log('\n📋 Next steps:');
    console.log('1. Run create-submissions-table-fixed.sql in Supabase SQL Editor');
    console.log('2. Test student submission flow:');
    console.log('   - Go to /dashboard/student/assignments');
    console.log('   - Click "Submit Assignment" on any assignment');
    console.log('   - Try submitting text, file, or link');
    console.log('3. Test teacher view:');
    console.log('   - Go to /dashboard/teacher/assignments/[id]/submissions');
    console.log('   - Verify you can see and grade submissions');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testSubmissionsSystem();