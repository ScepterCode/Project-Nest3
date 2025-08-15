const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAssignmentRubricField() {
  console.log('🔍 Checking Assignment Rubric Field Content...\n');
  
  try {
    // Get assignments and examine their rubric field
    const { data: assignments } = await supabase
      .from('assignments')
      .select('*');
      
    if (assignments) {
      assignments.forEach(assignment => {
        console.log(`Assignment: ${assignment.title}`);
        console.log(`Rubric field type: ${typeof assignment.rubric}`);
        console.log(`Rubric content:`, assignment.rubric);
        console.log('---');
      });
    }
    
    // Check if there's a rubrics table and what it should contain
    console.log('\nChecking rubrics table structure...');
    const { data: rubricSample } = await supabase
      .from('rubrics')
      .select('*')
      .limit(1);
      
    if (rubricSample && rubricSample.length > 0) {
      console.log('Rubrics table columns:', Object.keys(rubricSample[0]));
    } else {
      console.log('No rubrics found, checking table structure...');
      
      // Try to insert a test rubric to see the expected structure
      const testRubric = {
        title: 'Test Rubric',
        description: 'Test rubric for checking structure',
        criteria: [
          {
            name: 'Content Quality',
            description: 'Quality of content and ideas',
            points: 25,
            levels: [
              { name: 'Excellent', points: 25, description: 'Outstanding content' },
              { name: 'Good', points: 20, description: 'Good content' },
              { name: 'Fair', points: 15, description: 'Fair content' },
              { name: 'Poor', points: 10, description: 'Poor content' }
            ]
          }
        ],
        total_points: 25
      };
      
      const { data: insertedRubric, error: insertError } = await supabase
        .from('rubrics')
        .insert(testRubric)
        .select()
        .single();
        
      if (insertError) {
        console.log('❌ Error inserting test rubric:', insertError.message);
        console.log('This tells us about the expected rubrics table structure');
      } else {
        console.log('✅ Test rubric inserted successfully');
        console.log('Rubrics table structure:', Object.keys(insertedRubric));
        
        // Clean up test rubric
        await supabase
          .from('rubrics')
          .delete()
          .eq('id', insertedRubric.id);
      }
    }
    
  } catch (error) {
    console.error('❌ Check error:', error);
  }
}

checkAssignmentRubricField().catch(console.error);