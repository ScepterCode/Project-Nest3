/**
 * Test script to debug class code generation issues
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testDatabaseConnection() {
  console.log('🔍 Testing database connection...')
  
  try {
    // Test basic connection
    const { data, error } = await supabase
      .from('classes')
      .select('count')
      .limit(1)

    if (error) {
      console.error('❌ Database connection error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      
      if (error.message.includes('relation "classes" does not exist')) {
        console.log('📋 Classes table does not exist. Creating it...')
        await createClassesTable()
      }
      
      return false
    }

    console.log('✅ Database connection successful')
    console.log('📊 Classes table exists and is accessible')
    return true
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    return false
  }
}

async function createClassesTable() {
  console.log('🏗️ Creating classes table...')
  
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS classes (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      code VARCHAR(20) UNIQUE NOT NULL,
      status VARCHAR(50) DEFAULT 'active',
      teacher_id UUID NOT NULL,
      institution_id UUID,
      enrollment_count INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Create index on code for faster lookups
    CREATE INDEX IF NOT EXISTS idx_classes_code ON classes(code);
    
    -- Create index on teacher_id for faster teacher queries
    CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);
  `
  
  try {
    const { error } = await supabase.rpc('exec_sql', { sql: createTableSQL })
    
    if (error) {
      console.error('❌ Failed to create classes table:', error)
      return false
    }
    
    console.log('✅ Classes table created successfully')
    return true
  } catch (error) {
    console.error('❌ Error creating classes table:', error)
    return false
  }
}

async function testClassCodeGeneration() {
  console.log('🎲 Testing class code generation...')
  
  // Simple class code generator for testing
  function generateTestCode(className) {
    const cleanName = className.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    const prefix = cleanName.substring(0, 4).padEnd(4, 'X')
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
    return prefix + suffix
  }
  
  const testClassName = 'Test Biology Class'
  const testCode = generateTestCode(testClassName)
  
  console.log(`📝 Generated test code: ${testCode}`)
  
  // Test if code is unique
  try {
    const { data, error } = await supabase
      .from('classes')
      .select('id')
      .eq('code', testCode)
      .limit(1)

    if (error) {
      console.error('❌ Error checking code uniqueness:', error)
      return false
    }

    const isUnique = !data || data.length === 0
    console.log(`🔍 Code uniqueness check: ${isUnique ? 'UNIQUE' : 'NOT UNIQUE'}`)
    
    return true
  } catch (error) {
    console.error('❌ Error in code generation test:', error)
    return false
  }
}

async function main() {
  console.log('🚀 Starting class code generation diagnostics...\n')
  
  const dbConnected = await testDatabaseConnection()
  console.log('')
  
  if (dbConnected) {
    await testClassCodeGeneration()
  }
  
  console.log('\n✨ Diagnostics complete!')
}

main().catch(console.error)