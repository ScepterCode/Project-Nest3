const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixConsoleErrorsSimple() {
  console.log('🔧 Applying simple fixes for console errors...\n');
  
  try {
    // Test 1: Check if peer_review_activity table exists
    console.log('1. Checking peer_review_activity table...');
    const { data: peerReviewTest, error: peerReviewError } = await supabase
      .from('peer_review_activity')
      .select('count')
      .limit(1);
      
    if (peerReviewError) {
      console.log('❌ peer_review_activity table not accessible:', peerReviewError.message);
      console.log('💡 This explains the foreign key relationship error');
    } else {
      console.log('✅ peer_review_activity table exists');
    }
    
    // Test 2: Check analytics data availability
    console.log('\n2. Checking analytics data availability...');
    const teacherId = '11795caa-fb02-480c-b67e-f0087b356dc7';
    
    const { data: teacherClasses, error: classError } = await supabase
      .from('classes')
      .select('id, name')
      .eq('teacher_id', teacherId);
      
    if (classError) {
      console.log('❌ Classes query failed:', classError.message);
    } else {
      console.log('✅ Found', teacherClasses?.length || 0, 'classes for teacher');
      
      if (teacherClasses && teacherClasses.length > 0) {
        const classIds = teacherClasses.map(c => c.id);
        
        const { data: assignments, error: assignmentError } = await supabase
          .from('assignments')
          .select('id, title')
          .in('class_id', classIds);
          
        if (assignmentError) {
          console.log('❌ Assignments query failed:', assignmentError.message);
        } else {
          console.log('✅ Found', assignments?.length || 0, 'assignments');
        }
      }
    }
    
    console.log('\n📋 Simple Fix Strategy:');
    console.log('1. Add graceful error handling for missing tables');
    console.log('2. Provide fallback empty data when queries fail');
    console.log('3. Disable problematic features temporarily');
    console.log('4. Show user-friendly messages instead of errors');
    
    console.log('\n🎯 Recommended Actions:');
    console.log('- Wrap analytics queries in try-catch with fallbacks');
    console.log('- Check table existence before complex queries');
    console.log('- Show "No data available" instead of errors');
    console.log('- Disable peer review features until tables are ready');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

fixConsoleErrorsSimple().catch(console.error);