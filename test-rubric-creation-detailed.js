const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDetailedRubricCreation() {
  console.log('🔍 Testing Detailed Rubric Creation...\n');

  try {
    // Get a test user
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'teacher')
      .limit(1);

    if (!users || users.length === 0) {
      console.log('⚠️ No teacher users found');
      return;
    }

    const testUserId = users[0].id;
    console.log('👤 Test user ID:', testUserId);

    // Step 1: Create main rubric
    console.log('\n1. Creating main rubric...');
    const { data: rubric, error: rubricError } = await supabase
      .from('rubrics')
      .insert({
        name: 'Test Essay Rubric',
        description: 'A test rubric for essays',
        teacher_id: testUserId,
        status: 'active'
      })
      .select()
      .single();

    if (rubricError) {
      console.error('❌ Rubric creation failed:', rubricError);
      return;
    }

    console.log('✅ Rubric created:', rubric.id);

    // Step 2: Create criterion
    console.log('\n2. Creating criterion...');
    const { data: criterion, error: criterionError } = await supabase
      .from('rubric_criteria')
      .insert({
        rubric_id: rubric.id,
        name: 'Content Quality',
        description: 'Quality of ideas and content',
        weight: 50.0,
        order_index: 0
      })
      .select()
      .single();

    if (criterionError) {
      console.error('❌ Criterion creation failed:', criterionError);
      return;
    }

    console.log('✅ Criterion created:', criterion.id);

    // Step 3: Create levels
    console.log('\n3. Creating levels...');
    const levels = [
      { name: 'Excellent', description: 'Outstanding work', points: 4, order_index: 0 },
      { name: 'Good', description: 'Good work', points: 3, order_index: 1 },
      { name: 'Fair', description: 'Acceptable work', points: 2, order_index: 2 },
      { name: 'Poor', description: 'Needs improvement', points: 1, order_index: 3 }
    ];

    for (const levelData of levels) {
      const { data: level, error: levelError } = await supabase
        .from('rubric_levels')
        .insert({
          criterion_id: criterion.id,
          ...levelData
        })
        .select()
        .single();

      if (levelError) {
        console.error('❌ Level creation failed:', levelError);
        return;
      }

      console.log(`✅ Level created: ${level.name} (${level.id})`);

      // Step 4: Create quality indicators
      if (levelData.name === 'Excellent') {
        console.log('   Adding quality indicators...');
        const { error: indicatorError } = await supabase
          .from('rubric_quality_indicators')
          .insert([
            { level_id: level.id, indicator: 'Original ideas', order_index: 0 },
            { level_id: level.id, indicator: 'Well-developed arguments', order_index: 1 }
          ]);

        if (indicatorError) {
          console.error('❌ Quality indicator creation failed:', indicatorError);
        } else {
          console.log('   ✅ Quality indicators added');
        }
      }
    }

    // Step 5: Verify the complete rubric
    console.log('\n5. Verifying complete rubric...');
    const { data: completeRubric, error: fetchError } = await supabase
      .from('rubrics')
      .select(`
        *,
        rubric_criteria (
          *,
          rubric_levels (
            *,
            rubric_quality_indicators (*)
          )
        )
      `)
      .eq('id', rubric.id)
      .single();

    if (fetchError) {
      console.error('❌ Error fetching complete rubric:', fetchError);
    } else {
      console.log('✅ Complete rubric structure:');
      console.log(`   Name: ${completeRubric.name}`);
      console.log(`   Criteria: ${completeRubric.rubric_criteria.length}`);
      completeRubric.rubric_criteria.forEach(c => {
        console.log(`     - ${c.name}: ${c.rubric_levels.length} levels`);
      });
    }

    // Clean up
    console.log('\n🧹 Cleaning up...');
    await supabase.from('rubrics').delete().eq('id', rubric.id);
    console.log('✅ Test rubric cleaned up');

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

testDetailedRubricCreation();