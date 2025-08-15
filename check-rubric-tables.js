const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRubricTables() {
  console.log('🔍 Checking Rubric Tables...\n');

  const tables = ['rubrics', 'rubric_criteria', 'rubric_levels', 'rubric_quality_indicators', 'rubric_templates'];

  for (const table of tables) {
    try {
      console.log(`Checking table: ${table}`);
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        console.error(`❌ ${table}:`, error.message);
      } else {
        console.log(`✅ ${table}: Table exists and accessible`);
      }
    } catch (err) {
      console.error(`💥 ${table}:`, err.message);
    }
  }

  // Test creating a rubric
  console.log('\n🧪 Testing rubric creation...');
  
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

    const { data: rubric, error: rubricError } = await supabase
      .from('rubrics')
      .insert({
        name: 'Debug Test Rubric',
        description: 'Testing rubric creation',
        teacher_id: testUserId,
        status: 'active'
      })
      .select()
      .single();

    if (rubricError) {
      console.error('❌ Rubric creation failed:', rubricError);
    } else {
      console.log('✅ Rubric created:', rubric.id);
      
      // Clean up
      await supabase.from('rubrics').delete().eq('id', rubric.id);
      console.log('🧹 Cleaned up test rubric');
    }

  } catch (error) {
    console.error('💥 Error in rubric creation test:', error);
  }
}

checkRubricTables();