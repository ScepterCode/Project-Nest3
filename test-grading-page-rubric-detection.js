const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testGradingPageRubricDetection() {
  console.log('🔍 Testing Grading Page Rubric Detection...\n');
  
  try {
    // Get teacher
    const { data: users } = await supabase.from('users').select('*');
    const teacher = users?.find(u => u.role === 'teacher');
    
    if (!teacher) {
      console.log('❌ No teacher found');
      return;
    }
    
    console.log(`Teacher: ${teacher.email} (${teacher.id})\n`);
    
    // Get teacher's assignments
    const { data: assignments } = await supabase
      .from('assignments')
      .select('*')
      .eq('teacher_id', teacher.id);
      
    if (!assignments || assignments.length === 0) {
      console.log('❌ No assignments found for teacher');
      return;
    }
    
    const assignment = assignments[0];
    console.log(`Testing assignment: ${assignment.title} (${assignment.id})\n`);
    
    // Test the exact query used in the grading page
    console.log('1. Testing Assignment Query (with rubric field):');
    const { data: assignmentData, error: assignmentError } = await supabase
      .from('assignments')
      .select('id, title, description, due_date, points, class_id, teacher_id, rubric')
      .eq('id', assignment.id)
      .eq('teacher_id', teacher.id)
      .single();
      
    if (assignmentError) {
      console.log('❌ Assignment query error:', assignmentError.message);
      return;
    }
    
    console.log('✅ Assignment query successful');
    console.log('Assignment data keys:', Object.keys(assignmentData));
    
    // Check rubric field specifically
    console.log('\n2. Checking Rubric Field:');
    console.log('Rubric field exists:', assignmentData.hasOwnProperty('rubric'));
    console.log('Rubric value:', assignmentData.rubric);
    console.log('Rubric type:', typeof assignmentData.rubric);
    
    if (assignmentData.rubric && typeof assignmentData.rubric === 'object') {
      console.log('✅ Rubric detected!');
      console.log('Rubric name:', assignmentData.rubric.name);
      console.log('Rubric description:', assignmentData.rubric.description);
      console.log('Criteria count:', assignmentData.rubric.criteria?.length || 0);
      
      if (assignmentData.rubric.criteria) {
        console.log('\n3. Rubric Criteria:');
        assignmentData.rubric.criteria.forEach((criterion, index) => {
          console.log(`  ${index + 1}. ${criterion.name} (${criterion.weight}%)`);
          console.log(`     ID: ${criterion.id}`);
          console.log(`     Levels: ${criterion.levels?.length || 0}`);
        });
      }
      
      console.log('\n🎯 TOGGLE SHOULD BE VISIBLE');
      console.log('The grading mode toggle should appear because:');
      console.log('- assignmentRubric will be set to:', assignmentData.rubric.name);
      console.log('- Condition {assignmentRubric && ...} will be true');
      
    } else {
      console.log('❌ No rubric detected');
      console.log('Rubric is:', assignmentData.rubric);
      console.log('\n🎯 TOGGLE WILL NOT BE VISIBLE');
      console.log('The grading mode toggle will not appear because assignmentRubric is null');
    }
    
    // Test submissions for this assignment
    console.log('\n4. Testing Submissions:');
    const { data: submissions } = await supabase
      .from('submissions')
      .select('id, student_id, status, grade')
      .eq('assignment_id', assignment.id);
      
    console.log(`Found ${submissions?.length || 0} submissions for this assignment`);
    
    if (submissions && submissions.length > 0) {
      console.log('Sample submission:', submissions[0].id);
      console.log('You can test the grading page with this submission');
    }
    
    console.log('\n🔧 DEBUGGING STEPS:');
    console.log('1. Go to the grading page for this assignment');
    console.log('2. Open browser console');
    console.log('3. Look for these console logs:');
    console.log('   - "Assignment rubric field: [object]"');
    console.log('   - "✅ Assignment has rubric: [rubric name]"');
    console.log('4. If you see "❌ Assignment has no rubric", the toggle won\'t show');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testGradingPageRubricDetection().catch(console.error);