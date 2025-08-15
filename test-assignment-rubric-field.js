const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAssignmentRubricField() {
  console.log('🔍 Testing Assignment Rubric Field...\n');

  try {
    // Check if assignments table has rubric field
    console.log('1. Checking assignments table structure...');
    const { data: assignments, error: assignmentsError } = await supabase
      .from('assignments')
      .select('id, title, rubric')
      .limit(5);

    if (assignmentsError) {
      console.error('❌ Error fetching assignments:', assignmentsError);
      return;
    }

    console.log('✅ Assignments table accessible');
    console.log(`📊 Found ${assignments.length} assignments`);

    if (assignments.length > 0) {
      console.log('\n2. Checking rubric field values...');
      assignments.forEach((assignment, index) => {
        console.log(`Assignment ${index + 1}:`);
        console.log(`  - ID: ${assignment.id}`);
        console.log(`  - Title: ${assignment.title}`);
        console.log(`  - Rubric: ${assignment.rubric ? 'EXISTS' : 'NULL'}`);
        console.log(`  - Rubric type: ${typeof assignment.rubric}`);
        if (assignment.rubric) {
          console.log(`  - Rubric content: ${JSON.stringify(assignment.rubric).substring(0, 100)}...`);
        }
        console.log('');
      });
    }

    // Check if there are any rubrics in the rubrics table
    console.log('3. Checking rubrics table...');
    const { data: rubrics, error: rubricsError } = await supabase
      .from('rubrics')
      .select('id, name, teacher_id')
      .limit(5);

    if (rubricsError) {
      console.error('❌ Error fetching rubrics:', rubricsError);
    } else {
      console.log('✅ Rubrics table accessible');
      console.log(`📊 Found ${rubrics.length} rubrics`);
      
      if (rubrics.length > 0) {
        console.log('\nExisting rubrics:');
        rubrics.forEach((rubric, index) => {
          console.log(`  ${index + 1}. ${rubric.name} (ID: ${rubric.id})`);
        });
      }
    }

    // Test creating an assignment with a rubric
    console.log('\n4. Testing assignment-rubric relationship...');
    
    if (rubrics && rubrics.length > 0) {
      const testRubric = rubrics[0];
      console.log(`Using rubric: ${testRubric.name}`);
      
      // Get the full rubric data
      const { data: fullRubric, error: fullRubricError } = await supabase
        .from('rubrics')
        .select(`
          id, name, description,
          rubric_criteria (
            id, name, description, weight, order_index,
            rubric_levels (
              id, name, description, points, order_index
            )
          )
        `)
        .eq('id', testRubric.id)
        .single();

      if (fullRubricError) {
        console.error('❌ Error fetching full rubric:', fullRubricError);
      } else {
        console.log('✅ Full rubric data retrieved');
        console.log(`📋 Rubric has ${fullRubric.rubric_criteria?.length || 0} criteria`);
        
        // Show how the rubric should be stored in assignment
        const rubricForAssignment = {
          id: fullRubric.id,
          name: fullRubric.name,
          description: fullRubric.description,
          criteria: fullRubric.rubric_criteria?.map(criterion => ({
            id: criterion.id,
            name: criterion.name,
            description: criterion.description,
            weight: criterion.weight,
            levels: criterion.rubric_levels?.map(level => ({
              id: level.id,
              name: level.name,
              description: level.description,
              points: level.points
            }))
          }))
        };
        
        console.log('\n📝 Rubric data structure for assignment:');
        console.log(JSON.stringify(rubricForAssignment, null, 2));
      }
    } else {
      console.log('⚠️ No rubrics found to test with');
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

testAssignmentRubricField();