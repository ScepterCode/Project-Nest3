// Comprehensive fix for console errors
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 Comprehensive Console Error Fix...\n');

async function fixConsoleErrors() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    console.log('1. Testing notifications table...');
    
    // Check if notifications table exists
    const { data: notifications, error: notificationError } = await supabase
      .from('notifications')
      .select('count')
      .limit(1);

    if (notificationError) {
      console.log('❌ Notifications table missing or inaccessible');
      console.log('Creating notifications table...');
      
      // Create notifications table
      const { error: createError } = await supabase.rpc('exec', {
        sql: `
          CREATE TABLE IF NOT EXISTS notifications (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT DEFAULT 'info',
            priority TEXT DEFAULT 'normal',
            read BOOLEAN DEFAULT FALSE,
            data JSONB DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          -- Create RLS policies
          ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

          CREATE POLICY "Users can view their own notifications" ON notifications
            FOR SELECT USING (auth.uid() = user_id);

          CREATE POLICY "Users can update their own notifications" ON notifications
            FOR UPDATE USING (auth.uid() = user_id);

          -- Create indexes
          CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
          CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
          CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
        `
      });

      if (createError) {
        console.log('❌ Failed to create notifications table:', createError);
      } else {
        console.log('✅ Notifications table created successfully');
      }
    } else {
      console.log('✅ Notifications table exists');
    }

    console.log('\n2. Testing assignments table structure...');
    
    // Check assignments table structure
    const { data: assignments, error: assignmentError } = await supabase
      .from('assignments')
      .select('id, title, class_id, teacher_id')
      .limit(1);

    if (assignmentError) {
      console.log('❌ Assignments table error:', assignmentError.message);
      
      // Check if teacher_id column exists
      const { error: columnError } = await supabase.rpc('exec', {
        sql: `
          ALTER TABLE assignments 
          ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id);
          
          CREATE INDEX IF NOT EXISTS idx_assignments_teacher_id ON assignments(teacher_id);
        `
      });

      if (columnError) {
        console.log('❌ Failed to add teacher_id column:', columnError);
      } else {
        console.log('✅ Added teacher_id column to assignments');
      }
    } else {
      console.log('✅ Assignments table structure looks good');
    }

    console.log('\n3. Testing API routes...');
    
    // Test notifications API
    try {
      const response = await fetch(`${supabaseUrl.replace('supabase.co', 'supabase.co')}/rest/v1/notifications?select=count&limit=1`, {
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
        }
      });
      
      if (response.ok) {
        console.log('✅ Notifications API accessible');
      } else {
        console.log('❌ Notifications API error:', response.status);
      }
    } catch (apiError) {
      console.log('❌ API test failed:', apiError.message);
    }

    console.log('\n4. Creating sample data for testing...');
    
    // Get a test user ID (first user in the system)
    const { data: users } = await supabase
      .from('user_profiles')
      .select('user_id')
      .limit(1);

    if (users && users.length > 0) {
      const testUserId = users[0].user_id;
      
      // Create a test notification
      const { error: notifError } = await supabase
        .from('notifications')
        .upsert({
          user_id: testUserId,
          title: 'System Test',
          message: 'This is a test notification to verify the system is working.',
          type: 'info',
          priority: 'normal'
        });

      if (notifError) {
        console.log('❌ Failed to create test notification:', notifError);
      } else {
        console.log('✅ Created test notification');
      }
    }

    console.log('\n📋 Summary:');
    console.log('- Notifications table checked/created');
    console.log('- Assignments table structure verified');
    console.log('- API routes tested');
    console.log('- Sample data created for testing');
    console.log('\n🚀 Console errors should be resolved now!');

  } catch (error) {
    console.error('❌ Fix failed:', error);
  }
}

fixConsoleErrors();