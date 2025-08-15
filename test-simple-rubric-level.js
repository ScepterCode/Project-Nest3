const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testSimpleRubricLevel() {
  console.log('🔍 Testing Simple Rubric Level Creation...\n');

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

    // Create a simple rubric
    console.log('\n1. Creating simple rubric...');
    const { data: rubric, error: rubricError } = await supabase
      .from('rubrics')
      .insert({
        name: 'Simple Test Rubric',
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

    // Create a simple criterion
    console.log('\n2. Creating simple criterion...');
    const { data: criterion, error: criterionError } = await supabase
      .from('rubric_criteria')
      .insert({
        rubric_id: rubric.id,
        name: 'Test Criterion',
        weight: 100.0,
        order_index: 0
      })
      .select()
      .single();

    if (criterionError) {
      console.error('❌ Criterion creation failed:', criterionError);
      return;
    }
    console.log('✅ Criterion created:', criterion.id);

    // Try to create a level with minimal data
    console.log('\n3. Creating simple level...');
    console.log('   Attempting to insert level with criterion_id:', criterion.id);
    
    const levelData = {
      criterion_id: criterion.id,
      name: 'Test Level',
      points: 4,
      order_index: 0
    };
    
    console.log('   Level data:', JSON.stringify(levelData, null, 2));
    
    const { data: level, error: levelError } = await supabase
      .from('rubric_levels')
      .insert(levelData)
      .select()
      .single();

    if (levelError) {
      console.error('❌ Level creation failed:', levelError);
      console.error('   Full error details:', JSON.stringify(levelError, null, 2));
    } else {
      console.log('✅ Level created successfully:', level.id);
    }

    // Clean up
    console.log('\n🧹 Cleaning up...');
    await supabase.from('rubrics').delete().eq('id', rubric.id);
    console.log('✅ Cleaned up');

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

testSimpleRubricLevel();