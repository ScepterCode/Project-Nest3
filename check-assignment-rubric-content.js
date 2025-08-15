const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAssignmentRubricContent() {
  console.log('🔍 Checking Assignment Rubric Content...\n');

  try {
    // Get the assignment with rubric content
    const { data: assignments, error } = await supabase
      .from('assignments')
      .select('id, title, rubric')
      .not('rubric', 'is', null)
      .limit(2);

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    assignments.forEach((assignment, index) => {
      console.log(`\n📋 Assignment ${index + 1}: ${assignment.title}`);
      console.log('Rubric content:');
      console.log(JSON.stringify(assignment.rubric, null, 2));
      
      if (assignment.rubric && assignment.rubric.criteria) {
        console.log(`✅ Has ${assignment.rubric.criteria.length} criteria`);
        assignment.rubric.criteria.forEach((criterion, i) => {
          console.log(`  Criterion ${i + 1}: ${criterion.name} (${criterion.levels?.length || 0} levels)`);
        });
      } else {
        console.log('❌ No criteria found in rubric');
      }
    });

  } catch (error) {
    console.error('💥 Error:', error);
  }
}

checkAssignmentRubricContent();