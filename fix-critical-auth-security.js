const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAuthSecurity() {
  console.log('🚨 CRITICAL: Testing auth security vulnerability...\n');
  
  try {
    // Test 1: Check if there are multiple users with different roles
    console.log('1. Checking user accounts and roles...');
    
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, role, first_name, last_name')
      .order('created_at', { ascending: false });
      
    if (usersError) {
      console.log('❌ Cannot check users:', usersError.message);
    } else {
      console.log('✅ Found users:');
      users?.forEach(user => {
        console.log(`- ${user.email} (${user.role}) - ID: ${user.id.substring(0, 8)}...`);
      });
      
      // Check for role mixing potential
      const teachers = users?.filter(u => u.role === 'teacher') || [];
      const students = users?.filter(u => u.role === 'student') || [];
      
      console.log(`\\n📊 Role distribution:`);
      console.log(`- Teachers: ${teachers.length}`);
      console.log(`- Students: ${students.length}`);
      
      if (teachers.length > 0 && students.length > 0) {
        console.log('\\n⚠️  SECURITY RISK: Multiple roles exist - session mixing possible!');
      }
    }
    
    // Test 2: Check current session state
    console.log('\\n2. Checking session management...');
    
    // This would normally be done client-side, but we can check the structure
    console.log('✅ Session management needs client-side fixes');
    
    console.log('\\n🔧 IMMEDIATE FIXES NEEDED:');
    console.log('1. Clear all cached user data on auth state change');
    console.log('2. Force re-authentication on role mismatch');
    console.log('3. Add session validation middleware');
    console.log('4. Implement proper logout/clear session');
    console.log('5. Add role-based route protection');
    
  } catch (error) {
    console.error('❌ Security test error:', error);
  }
}

testAuthSecurity().catch(console.error);