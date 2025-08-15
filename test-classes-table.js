/**
 * Simple test to check if classes table exists and is accessible
 */

console.log('🔍 Testing classes table...')

// Test the class code generation directly
async function testClassCodeGeneration() {
  try {
    // Import the class code generator
    const { generateUniqueClassCode, generateSimpleClassCode } = await import('./lib/utils/class-code-generator.ts')
    
    console.log('📝 Testing class code generation...')
    
    // Test simple fallback generation first
    const simpleCode = generateSimpleClassCode('Test Biology Class')
    console.log('✅ Simple code generated:', simpleCode)
    
    // Test unique code generation
    try {
      const uniqueCode = await generateUniqueClassCode({ 
        className: 'Test Biology Class',
        maxRetries: 3 
      })
      console.log('✅ Unique code generated:', uniqueCode)
    } catch (error) {
      console.error('❌ Unique code generation failed:', error.message)
      console.log('🔄 This is expected if database is not accessible')
    }
    
  } catch (error) {
    console.error('❌ Error importing class code generator:', error)
  }
}

// Test database connection using a simple query
async function testDatabaseConnection() {
  try {
    // Import Supabase client
    const { createClient } = await import('./lib/supabase/client.ts')
    const supabase = createClient()
    
    console.log('🔗 Testing database connection...')
    
    // Try to query the classes table
    const { data, error } = await supabase
      .from('classes')
      .select('count')
      .limit(1)
    
    if (error) {
      console.error('❌ Database query error:', {
        message: error.message,
        code: error.code,
        details: error.details
      })
      
      if (error.message.includes('relation "classes" does not exist')) {
        console.log('📋 Classes table does not exist')
        return false
      }
    } else {
      console.log('✅ Database connection successful')
      console.log('📊 Classes table is accessible')
      return true
    }
    
  } catch (error) {
    console.error('❌ Error testing database:', error.message)
    return false
  }
}

async function main() {
  console.log('🚀 Starting diagnostics...\n')
  
  await testClassCodeGeneration()
  console.log('')
  
  await testDatabaseConnection()
  
  console.log('\n✨ Diagnostics complete!')
}

main().catch(console.error)