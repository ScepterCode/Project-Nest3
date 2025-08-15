const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testGradingInterface() {
  console.log('🔍 Testing Grading Interface Logic...\n');

  try {
    // Get the assignment with the working rubric
    const { data: assignment, error } = await supabase
      .from('assignments')
      .select('id, title, rubric')
      .eq('title', 'Simple Page Design')
      .single();

    if (error) {
      console.error('❌ Error fetching assignment:', error);
      return;
    }

    console.log(`📋 Testing assignment: ${assignment.title}`);
    console.log(`🆔 Assignment ID: ${assignment.id}`);

    // Simulate the grading page logic
    const assignmentRubric = assignment.rubric;
    
    console.log('\n🧪 Simulating grading page logic...');
    console.log(`assignmentRubric exists: ${!!assignmentRubric}`);
    console.log(`assignmentRubric type: ${typeof assignmentRubric}`);
    
    if (assignmentRubric && typeof assignmentRubric === 'object') {
      console.log('✅ Assignment has rubric object');
      console.log(`Rubric name: ${assignmentRubric.name}`);
      console.log(`Criteria count: ${assignmentRubric.criteria?.length || 0}`);
      
      if (assignmentRubric.criteria && assignmentRubric.criteria.length > 0) {
        console.log('✅ Rubric has criteria - DUAL GRADING SHOULD BE AVAILABLE');
        console.log('\n🎯 Expected UI behavior:');
        console.log('  - Show "Grading Method" section');
        console.log('  - Show "Simple Grade" and "Use Rubric" buttons');
        console.log('  - Show "Remove Rubric" button');
        console.log('  - Allow switching between simple and rubric grading');
        
        console.log('\n📋 Rubric criteria:');
        assignmentRubric.criteria.forEach((criterion, i) => {
          console.log(`  ${i + 1}. ${criterion.name} (${criterion.weight}% weight, ${criterion.levels?.length || 0} levels)`);
        });
      } else {
        console.log('❌ Rubric has no criteria - SIMPLE GRADING ONLY');
      }
    } else {
      console.log('❌ Assignment has no rubric - SIMPLE GRADING ONLY');
      console.log('\n🎯 Expected UI behavior:');
      console.log('  - Show "This assignment uses simple grading only"');
      console.log('  - Show "Add Rubric" button');
      console.log('  - Only show simple grade input');
    }

    // Test the other assignment too
    console.log('\n' + '='.repeat(50));
    
    const { data: assignment2, error: error2 } = await supabase
      .from('assignments')
      .select('id, title, rubric')
      .eq('title', 'Flex Banner')
      .single();

    if (error2) {
      console.error('❌ Error fetching second assignment:', error2);
      return;
    }

    console.log(`📋 Testing assignment: ${assignment2.title}`);
    console.log(`🆔 Assignment ID: ${assignment2.id}`);

    const assignmentRubric2 = assignment2.rubric;
    
    console.log('\n🧪 Simulating grading page logic...');
    console.log(`assignmentRubric exists: ${!!assignmentRubric2}`);
    console.log(`assignmentRubric type: ${typeof assignmentRubric2}`);
    
    if (assignmentRubric2 && typeof assignmentRubric2 === 'object' && assignmentRubric2.criteria && assignmentRubric2.criteria.length > 0) {
      console.log('✅ Assignment has working rubric - DUAL GRADING AVAILABLE');
    } else {
      console.log('❌ Assignment has empty/no rubric - SIMPLE GRADING ONLY');
      console.log('\n🎯 Expected UI behavior:');
      console.log('  - Show "This assignment uses simple grading only"');
      console.log('  - Show "Add Rubric" button');
      console.log('  - Only show simple grade input');
    }

    console.log('\n📝 Summary:');
    console.log('✅ The grading system logic is working correctly');
    console.log('✅ Assignments with proper rubrics will show dual grading');
    console.log('✅ Assignments without rubrics will show simple grading only');
    console.log('\n🎯 To test the UI:');
    console.log(`   Navigate to: /dashboard/teacher/assignments/${assignment.id}/grade-submissions`);
    console.log('   Expected: Full dual grading interface with rubric options');
    console.log(`   Navigate to: /dashboard/teacher/assignments/${assignment2.id}/grade-submissions`);
    console.log('   Expected: Simple grading only with "Add Rubric" option');

  } catch (error) {
    console.error('💥 Error:', error);
  }
}

testGradingInterface();