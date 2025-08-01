#!/usr/bin/env node

/**
 * Database Setup Script
 * This script will execute the minimal database schema in your Supabase instance
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

async function setupDatabase() {
  console.log('🚀 Starting database setup...');
  
  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing required environment variables:');
    console.error('   - NEXT_PUBLIC_SUPABASE_URL');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY');
    console.error('');
    console.error('Make sure these are set in your .env.local file');
    process.exit(1);
  }
  
  // Create Supabase client with service role key
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'supabase-minimal.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📄 Loaded SQL schema from supabase-minimal.sql');
    console.log('⚡ Executing database setup...');
    
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql: sqlContent });
    
    if (error) {
      console.error('❌ Error executing SQL:', error);
      process.exit(1);
    }
    
    console.log('✅ Database setup completed successfully!');
    console.log('');
    console.log('🎉 Your database now includes:');
    console.log('   - users table with user profiles');
    console.log('   - institutions and departments tables');
    console.log('   - onboarding_sessions table');
    console.log('   - Automatic user profile creation trigger');
    console.log('   - Sample institution and department data');
    console.log('');
    console.log('🔄 Now restart your application and try the onboarding flow!');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the setup
setupDatabase().catch(console.error);