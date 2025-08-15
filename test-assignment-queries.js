const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAssignmentQueries() {
  console.log('Testing assignment queries...');
  
  try {
    const assignmentId = 'ba5baac4-deba-4ec3-8f5f-0d68a1080b81';
    
    // Test 1: Basic assignment query (new structure)
    console.log('\n1. Testing basic assignment query...');
    const { data: assignmentData, error: assignmentError } = await supabase
      .from('assignments')
      .select('id, title, description, due_date, points, created_at, class_id, teacher_id')
      .eq('id', assignmentId)
      .single();
      
    if (assignmentError) {
      console.log('❌ Assignment query error:', assignmentError);
      console.log('Error details:', JSON.stringify(assignmentError, null, 2));
    } else {
      console.log('✅ Assignment query successful');
      console.log('Assignment:', assignmentData.title);
      console.log('Class ID:', assignmentData.class_id);
      console.log('Teacher ID:', assignmentData.teacher_id);
    }
    
    if (assignmentData) {
      // Test 2: Get class name separately
      console.log('\n2. Testing class name query...');
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('id, name')
        .eq('id', assignmentData.class_id)
        .single();
        
      if (classError) {
        console.log('❌ Class query error:', classError);
      } else {
        console.log('✅ Class query successful');
        console.log('Class name:', classData.name);
      }
      
      // Test 3: Check teacher access
      console.log('\n3. Testing teacher access...');
      const { data: teacherAssignment, error: teacherError } = await supabase
        .from('assignments')
        .select('id, title, class_id, teacher_id')
        .eq('id', assignmentId)
        .eq('teacher_id', assignmentData.teacher_id)
        .single();
        
      if (teacherError) {
        console.log('❌ Teacher access error:', teacherError);
      } else {
        console.log('✅ Teacher access successful');
      }
      
      // Test 4: Check submissions
      console.log('\n4. Testing submissions query...');
      const { data: submissions, error: submissionsError } = await supabase
        .from('submissions')
        .select('id, student_id, status, grade')
        .eq('assignment_id', assignmentId);
        
      if (submissionsError) {
        console.log('❌ Submissions query error:', submissionsError);
      } else {
        console.log('✅ Submissions query successful');
        console.log('Found', submissions.length, 'submissions');
      }
    }
    
    console.log('\n🎉 Assignment query tests completed!');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testAssignmentQueries().catch(console.error);