const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function recreateRubricLevelsTable() {
  console.log('🔧 Recreating Rubric Levels Table...\n');

  try {
    // First, let's backup any existing data
    console.log('1. Backing up existing rubric levels...');
    const { data: existingLevels, error: backupError } = await supabase
      .from('rubric_levels')
      .select('*');

    if (backupError) {
      console.error('❌ Error backing up levels:', backupError);
    } else {
      console.log(`✅ Backed up ${existingLevels.length} existing levels`);
    }

    // Drop and recreate the table
    console.log('\n2. Dropping and recreating table...');
    
    // Since we can't execute DDL directly, let's try a different approach
    // Let's just try to insert a test record to see what happens
    console.log('\n3. Testing direct insert...');
    
    // Get a test criterion
    const { data: criteria } = await supabase
      .from('rubric_criteria')
      .select('id')
      .limit(1);

    if (!criteria || criteria.length === 0) {
      console.log('⚠️ No criteria found for testing');
      return;
    }

    const testCriterionId = criteria[0].id;
    console.log('Using criterion ID:', testCriterionId);

    // Try to insert with raw SQL approach
    console.log('\n4. Attempting raw insert...');
    
    const insertData = {
      criterion_id: testCriterionId,
      name: 'Direct Test Level',
      description: 'Testing direct insert',
      points: 3,
      order_index: 0
    };

    console.log('Insert data:', JSON.stringify(insertData, null, 2));

    const { data: result, error: insertError } = await supabase
      .from('rubric_levels')
      .insert(insertData)
      .select();

    if (insertError) {
      console.error('❌ Direct insert failed:', insertError);
      console.error('Full error:', JSON.stringify(insertError, null, 2));
    } else {
      console.log('✅ Direct insert succeeded:', result);
      
      // Clean up the test record
      if (result && result.length > 0) {
        await supabase
          .from('rubric_levels')
          .delete()
          .eq('id', result[0].id);
        console.log('🧹 Cleaned up test record');
      }
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

recreateRubricLevelsTable();