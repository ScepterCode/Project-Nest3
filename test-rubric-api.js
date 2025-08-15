const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testRubricAPI() {
  console.log('🔍 Testing Rubric API...\n');

  try {
    // Test creating a rubric via API
    const testRubric = {
      name: 'API Test Rubric',
      description: 'Testing rubric creation via API',
      classId: null,
      isTemplate: false,
      criteria: [
        {
          name: 'Content Quality',
          description: 'Quality of content and ideas',
          weight: 50.0,
          order_index: 0,
          levels: [
            {
              name: 'Excellent',
              description: 'Outstanding work',
              points: 4,
              order_index: 0,
              qualityIndicators: ['Original ideas', 'Well-developed']
            },
            {
              name: 'Good',
              description: 'Good work',
              points: 3,
              order_index: 1,
              qualityIndicators: ['Clear ideas']
            }
          ]
        },
        {
          name: 'Organization',
          description: 'Structure and flow',
          weight: 50.0,
          order_index: 1,
          levels: [
            {
              name: 'Excellent',
              description: 'Clear structure',
              points: 4,
              order_index: 0,
              qualityIndicators: []
            },
            {
              name: 'Good',
              description: 'Generally organized',
              points: 3,
              order_index: 1,
              qualityIndicators: []
            }
          ]
        }
      ]
    };

    console.log('📤 Sending POST request to create rubric...');
    
    // Since we can't easily test the API route directly, let's simulate what it would do
    // by using the service role client directly
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

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
    console.log('👤 Using test user:', testUserId);

    // Create the main rubric record
    console.log('\n1. Creating main rubric...');
    const { data: rubric, error: rubricError } = await supabase
      .from('rubrics')
      .insert({
        name: testRubric.name,
        description: testRubric.description,
        teacher_id: testUserId,
        class_id: testRubric.classId,
        is_template: testRubric.isTemplate,
        status: 'active'
      })
      .select()
      .single();

    if (rubricError) {
      console.error('❌ Rubric creation failed:', rubricError);
      return;
    }

    console.log('✅ Rubric created:', rubric.id);

    let totalPoints = 0;

    // Create criteria and their levels
    for (const criterion of testRubric.criteria) {
      console.log(`\n2. Creating criterion: ${criterion.name}`);
      
      const { data: criterionData, error: criterionError } = await supabase
        .from('rubric_criteria')
        .insert({
          rubric_id: rubric.id,
          name: criterion.name,
          description: criterion.description,
          weight: criterion.weight,
          order_index: criterion.order_index
        })
        .select()
        .single();

      if (criterionError) {
        console.error('❌ Criterion creation failed:', criterionError);
        await supabase.from('rubrics').delete().eq('id', rubric.id);
        return;
      }

      console.log('✅ Criterion created:', criterionData.id);

      let maxPointsForCriterion = 0;

      // Create levels for this criterion
      for (const level of criterion.levels) {
        console.log(`   Creating level: ${level.name}`);
        
        // This is where the trigger issue occurs
        const { data: levelData, error: levelError } = await supabase
          .from('rubric_levels')
          .insert({
            criterion_id: criterionData.id,
            name: level.name,
            description: level.description,
            points: level.points,
            order_index: level.order_index
          })
          .select()
          .single();

        if (levelError) {
          console.error('❌ Level creation failed:', levelError);
          await supabase.from('rubrics').delete().eq('id', rubric.id);
          return;
        }

        console.log('   ✅ Level created:', levelData.id);
        maxPointsForCriterion = Math.max(maxPointsForCriterion, level.points);

        // Create quality indicators
        if (level.qualityIndicators && level.qualityIndicators.length > 0) {
          const indicators = level.qualityIndicators.map((indicator, index) => ({
            level_id: levelData.id,
            indicator: indicator,
            order_index: index
          }));

          const { error: indicatorError } = await supabase
            .from('rubric_quality_indicators')
            .insert(indicators);

          if (indicatorError) {
            console.error('❌ Quality indicator creation failed:', indicatorError);
          } else {
            console.log(`   ✅ ${indicators.length} quality indicators created`);
          }
        }
      }

      totalPoints += maxPointsForCriterion;
    }

    // Update total points
    console.log(`\n3. Updating total points: ${totalPoints}`);
    await supabase
      .from('rubrics')
      .update({ total_points: totalPoints })
      .eq('id', rubric.id);

    console.log('✅ Rubric creation completed successfully!');
    console.log(`📊 Total points: ${totalPoints}`);

    // Clean up
    console.log('\n🧹 Cleaning up...');
    await supabase.from('rubrics').delete().eq('id', rubric.id);
    console.log('✅ Test rubric cleaned up');

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

testRubricAPI();