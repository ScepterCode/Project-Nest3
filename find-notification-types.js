const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findNotificationTypes() {
  console.log('🔍 Finding valid notification types...\n');
  
  try {
    // Check the notifications schema to see what types are allowed
    // Since we can't query the schema directly, let's try common notification types
    
    const commonTypes = [
      // Basic types
      'info', 'success', 'warning', 'error', 'notification',
      // Educational types  
      'assignment', 'grade', 'announcement', 'reminder', 'message',
      // System types
      'system', 'admin', 'user', 'teacher', 'student',
      // Action types
      'created', 'updated', 'deleted', 'submitted', 'graded',
      // Simple types
      'alert', 'notice', 'update', 'news'
    ];
    
    console.log('Testing common notification types...');
    
    const testUserId = '11795caa-fb02-480c-b67e-f0087b356dc7';
    
    for (const type of commonTypes) {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .insert({
            user_id: testUserId,
            title: 'Test Notification',
            message: `Testing ${type} type`,
            type: type,
            is_read: false
          })
          .select()
          .single();
          
        if (error) {
          console.log(`❌ ${type}: ${error.message}`);
        } else {
          console.log(`✅ ${type}: SUCCESS!`);
          
          // Clean up the test notification
          await supabase
            .from('notifications')
            .delete()
            .eq('id', data.id);
            
          // This type works, let's create a real notification
          const { data: realNotification } = await supabase
            .from('notifications')
            .insert({
              user_id: '09b1a3d5-41af-4443-ac0a-10e19155dd41', // student
              title: 'Assignment Graded',
              message: 'Your assignment "Simple Page Design" has been graded. Score: 92/100',
              type: type,
              is_read: false
            })
            .select()
            .single();
            
          console.log(`✅ Created real notification with type '${type}'`);
          
          // Test another notification for teacher
          const { data: teacherNotification } = await supabase
            .from('notifications')
            .insert({
              user_id: testUserId, // teacher
              title: 'New Submission',
              message: 'A student has submitted their assignment for review.',
              type: type,
              is_read: false
            })
            .select()
            .single();
            
          console.log(`✅ Created teacher notification with type '${type}'`);
          
          // We found a working type, let's stop here
          console.log(`\\n🎉 Found working notification type: '${type}'`);
          break;
        }
      } catch (err) {
        console.log(`❌ ${type}: Exception - ${err.message}`);
      }
    }
    
    // Check if we have any notifications now
    const { data: allNotifications } = await supabase
      .from('notifications')
      .select('*');
      
    console.log(`\\nTotal notifications in database: ${allNotifications?.length || 0}`);
    
    if (allNotifications && allNotifications.length > 0) {
      console.log('\\nNotifications created:');
      allNotifications.forEach(notif => {
        console.log(`- ${notif.title} (${notif.type}) for user ${notif.user_id}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

findNotificationTypes().catch(console.error);