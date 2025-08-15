const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testRubricSystem() {
  console.log('🔍 Testing Rubric System...\n');

  try {
    // Test 1: Check if rubric tables exist
    console.log('1. Checking rubric tables...');
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .like('table_name', '%rubric%');

    if (tablesError) {
      console.error('❌ Error checking tables:', tablesError);
      return;
    }

    console.log('📋 Found rubric tables:', tables.map(t => t.table_name));

    // Test 2: Try to fetch rubrics
    console.log('\n2. Testing rubric fetch...');
    const { data: rubrics, error: rubricsError } = await supabase
      .from('rubrics')
      .select('*')
      .limit(5);

    if (rubricsError) {
      console.error('❌ Error fetching rubrics:', rubricsError);
    } else {
      console.log('✅ Rubrics table accessible');
      console.log(`📊 Found ${rubrics.length} rubrics`);
    }

    // Test 3: Try to fetch rubric templates
    console.log('\n3. Testing rubric templates...');
    const { data: templates, error: templatesError } = await supabase
      .from('rubric_templates')
      .select('*')
      .limit(5);

    if (templatesError) {
      console.error('❌ Error fetching templates:', templatesError);
    } else {
      console.log('✅ Templates table accessible');
      console.log(`📊 Found ${templates.length} templates`);
    }

    // Test 4: Test creating a simple rubric
    console.log('\n4. Testing rubric creation...');
    
    // First get a test user
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'teacher')
      .limit(1);

    if (usersError || !users.length) {
      console.log('⚠️ No teacher users found for testing');
      return;
    }

    const testUserId = users[0].id;
    console.log('👤 Using test user:', testUserId);

    const { data: newRubric, error: createError } = await supabase
      .from('rubrics')
      .insert({
        name: 'Test Rubric - ' + Date.now(),
        description: 'Test rubric for debugging',
        teacher_id: testUserId,
        status: 'active'
      })
      .select()
      .single();

    if (createError) {
      console.error('❌ Error creating rubric:', createError);
    } else {
      console.log('✅ Rubric created successfully:', newRubric.id);
      
      // Clean up - delete the test rubric
      await supabase
        .from('rubrics')
        .delete()
        .eq('id', newRubric.id);
      console.log('🧹 Test rubric cleaned up');
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

testRubricSystem();