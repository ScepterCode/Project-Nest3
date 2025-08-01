// Simple test script to verify authentication flow
// Run this in the browser console on your app

async function testAuthFlow() {
  console.log('Testing authentication flow...');
  
  // Test 1: Check if Supabase client is available
  try {
    const { createClient } = await import('/lib/supabase/client.js');
    const supabase = createClient();
    console.log('✅ Supabase client created successfully');
    
    // Test 2: Check current user
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      console.log('❌ Auth error:', error.message);
    } else if (user) {
      console.log('✅ User authenticated:', user.email);
      
      // Test 3: Check user profile
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
        
      if (profileError) {
        console.log('❌ Profile error:', profileError.message);
      } else {
        console.log('✅ User profile found:', profile);
      }
    } else {
      console.log('ℹ️ No user authenticated');
    }
    
    // Test 4: Check database connection
    const { data: testData, error: testError } = await supabase
      .from('users')
      .select('count')
      .limit(1);
      
    if (testError) {
      console.log('❌ Database connection error:', testError.message);
    } else {
      console.log('✅ Database connection successful');
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

// Run the test
testAuthFlow();