const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testGradingAccess() {
  console.log('Testing grading access...');
  
  try {
    // Test 1: Check if we can access assignments
    console.log('\n1. Testing assignments access...');
    const { data: assignments, error: assignmentsError } = await supabase
      .from('assignments')
      .select('id, title, teacher_id, class_id')
      .limit(5);
      
    if (assignmentsError) {
      console.log('❌ Assignments error:', assignmentsError.message);
    } else {
      console.log('✅ Found', assignments.length, 'assignments');
      if (assignments.length > 0) {
        console.log('Sample assignment:', assignments[0]);
      }
    }
    
    // Test 2: Check if we can access submissions
    console.log('\n2. Testing submissions access...');
    const { data: submissions, error: submissionsError } = await supabase
      .from('submissions')
      .select('id, assignment_id, student_id, status, grade')
      .limit(5);
      
    if (submissionsError) {
      console.log('❌ Submissions error:', submissionsError.message);
    } else {
      console.log('✅ Found', submissions.length, 'submissions');
      if (submissions.length > 0) {
        console.log('Sample submission:', submissions[0]);
      }
    }
    
    // Test 3: Try to update a submission (grading)
    if (submissions && submissions.length > 0) {
      console.log('\n3. Testing submission update (grading)...');
      const testSubmission = submissions[0];
      
      const { data: updateData, error: updateError } = await supabase
        .from('submissions')
        .update({
          grade: 85,
          feedback: 'Test feedback from grading access test',
          status: 'graded',
          graded_at: new Date().toISOString()
        })
        .eq('id', testSubmission.id)
        .select();
        
      if (updateError) {
        console.log('❌ Update error:', updateError.message);
        console.log('Error details:', updateError);
      } else {
        console.log('✅ Successfully updated submission');
        console.log('Updated data:', updateData);
      }
    }
    
    // Test 4: Check current user context
    console.log('\n4. Checking user context...');
    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.log('❌ User error:', userError.message);
    } else {
      console.log('✅ Current user ID:', user.user?.id);
      console.log('User email:', user.user?.email);
    }
    
    // Test 5: Check RLS policies
    console.log('\n5. Checking RLS policies...');
    const { data: policies, error: policiesError } = await supabase
      .rpc('get_policies', { table_name: 'submissions' })
      .select();
      
    if (policiesError) {
      console.log('❌ Policies check failed:', policiesError.message);
    } else {
      console.log('✅ RLS policies found:', policies?.length || 0);
    }
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testGradingAccess().catch(console.error);