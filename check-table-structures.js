const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTableStructures() {
  console.log('🔍 Checking actual table structures...\n');
  
  try {
    // 1. Check assignments table structure
    console.log('1. ASSIGNMENTS TABLE:');
    const { data: assignments } = await supabase
      .from('assignments')
      .select('*')
      .limit(1);
      
    if (assignments && assignments.length > 0) {
      console.log('Columns in assignments table:', Object.keys(assignments[0]));
    } else {
      console.log('No assignments found');
    }
    
    // 2. Check notifications table structure
    console.log('\n2. NOTIFICATIONS TABLE:');
    const { data: notifications } = await supabase
      .from('notifications')
      .select('*')
      .limit(1);
      
    if (notifications && notifications.length > 0) {
      console.log('Columns in notifications table:', Object.keys(notifications[0]));
    } else {
      console.log('No notifications found, checking if table exists...');
      
      // Try to insert a simple notification to see what types are allowed
      const { error: insertError } = await supabase
        .from('notifications')
        .insert({
          user_id: '11795caa-fb02-480c-b67e-f0087b356dc7',
          title: 'Test',
          message: 'Test message',
          type: 'info',
          is_read: false
        });
        
      if (insertError) {
        console.log('Insert error:', insertError.message);
        
        // Try different types
        const typesToTry = ['info', 'success', 'warning', 'error', 'notification'];
        
        for (const type of typesToTry) {
          const { error } = await supabase
            .from('notifications')
            .insert({
              user_id: '11795caa-fb02-480c-b67e-f0087b356dc7',
              title: 'Test',
              message: 'Test message',
              type: type,
              is_read: false
            });
            
          if (!error) {
            console.log(`✅ Type '${type}' works`);
            
            // Clean up
            await supabase
              .from('notifications')
              .delete()
              .eq('title', 'Test');
            break;
          } else {
            console.log(`❌ Type '${type}': ${error.message}`);
          }
        }
      }
    }
    
    // 3. Check classes table structure
    console.log('\n3. CLASSES TABLE:');
    const { data: classes } = await supabase
      .from('classes')
      .select('*')
      .limit(1);
      
    if (classes && classes.length > 0) {
      console.log('Columns in classes table:', Object.keys(classes[0]));
    }
    
    // 4. Check submissions table structure
    console.log('\n4. SUBMISSIONS TABLE:');
    const { data: submissions } = await supabase
      .from('submissions')
      .select('*')
      .limit(1);
      
    if (submissions && submissions.length > 0) {
      console.log('Columns in submissions table:', Object.keys(submissions[0]));
    }
    
    // 5. Check users table structure
    console.log('\n5. USERS TABLE:');
    const { data: users } = await supabase
      .from('users')
      .select('*')
      .limit(1);
      
    if (users && users.length > 0) {
      console.log('Columns in users table:', Object.keys(users[0]));
    }
    
    // 6. Check enrollments table structure
    console.log('\n6. ENROLLMENTS TABLE:');
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('*')
      .limit(1);
      
    if (enrollments && enrollments.length > 0) {
      console.log('Columns in enrollments table:', Object.keys(enrollments[0]));
    }
    
    console.log('\n🎯 Table structure analysis complete!');
    
  } catch (error) {
    console.error('❌ Check error:', error);
  }
}

checkTableStructures().catch(console.error);