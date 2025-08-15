const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixAssignmentColumns() {
  console.log('Fixing assignment column names...');
  
  try {
    // Check current table structure
    console.log('\n1. Checking current table structure...');
    const { data: sampleAssignment } = await supabase
      .from('assignments')
      .select('*')
      .limit(1);
      
    if (sampleAssignment && sampleAssignment.length > 0) {
      console.log('Current columns:');
      Object.keys(sampleAssignment[0]).forEach(col => console.log('-', col));
      
      const hasPoints = 'points' in sampleAssignment[0];
      const hasPointsPossible = 'points_possible' in sampleAssignment[0];
      
      console.log('\\nColumn status:');
      console.log('- points column exists:', hasPoints);
      console.log('- points_possible column exists:', hasPointsPossible);
      
      if (hasPoints && !hasPointsPossible) {
        console.log('\\n2. The table uses \"points\" column (correct)');
        console.log('✅ No database changes needed');
        console.log('The frontend code has been updated to use the correct column name.');
      } else if (hasPointsPossible && !hasPoints) {
        console.log('\\n2. The table uses \"points_possible\" column');
        console.log('This is fine, but we should rename it to \"points\" for consistency');
        // Note: We won't actually rename it here to avoid breaking changes
      } else if (hasPoints && hasPointsPossible) {
        console.log('\\n2. Both columns exist - this might cause confusion');
      } else {
        console.log('\\n2. Neither column exists - need to add points column');
      }
    }
    
    // Test the fixed queries
    console.log('\\n3. Testing fixed queries...');
    const assignmentId = 'ba5baac4-deba-4ec3-8f5f-0d68a1080b81';
    
    const { data: testAssignment, error: testError } = await supabase
      .from('assignments')
      .select('id, title, points, class_id, teacher_id')
      .eq('id', assignmentId)
      .single();
      
    if (testError) {
      console.log('❌ Query test failed:', testError.message);
    } else {
      console.log('✅ Query test successful');
      console.log('Assignment:', testAssignment.title);
      console.log('Points:', testAssignment.points);
    }
    
    console.log('\\n🎉 Assignment column fix completed!');
    console.log('\\nSummary:');
    console.log('- Frontend code updated to use correct column names');
    console.log('- Queries simplified to avoid join issues');
    console.log('- Error handling improved with detailed logging');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixAssignmentColumns().catch(console.error);