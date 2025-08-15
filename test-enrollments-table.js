/**
 * Simple test to verify enrollments table exists and is accessible
 */

console.log('🔍 Testing enrollments table...')

async function testEnrollmentsTable() {
  try {
    // Import Supabase client
    const { createClient } = await import('./lib/supabase/client.ts')
    const supabase = createClient()
    
    console.log('🔗 Testing enrollments table access...')
    
    // Try to query the enrollments table
    const { data, error } = await supabase
      .from('enrollments')
      .select('count')
      .limit(1)
    
    if (error) {
      console.error('❌ Enrollments table query error:', {
        message: error.message,
        code: error.code,
        details: error.details
      })
      
      if (error.message.includes('relation "enrollments" does not exist')) {
        console.log('📋 Enrollments table does not exist - you need to run the SQL script')
        return false
      }
    } else {
      console.log('✅ Enrollments table is accessible')
      console.log('📊 Query result:', data)
      return true
    }
    
  } catch (error) {
    console.error('❌ Error testing enrollments table:', error.message)
    return false
  }
}

async function testClassesTable() {
  try {
    const { createClient } = await import('./lib/supabase/client.ts')
    const supabase = createClient()
    
    console.log('🔗 Testing classes table access...')
    
    // Try to query the classes table
    const { data, error } = await supabase
      .from('classes')
      .select('id, name, code')
      .limit(3)
    
    if (error) {
      console.error('❌ Classes table query error:', error.message)
      return false
    } else {
      console.log('✅ Classes table is accessible')
      console.log('📊 Sample classes:', data)
      return true
    }
    
  } catch (error) {
    console.error('❌ Error testing classes table:', error.message)
    return false
  }
}

async function main() {
  console.log('🚀 Starting table diagnostics...\n')
  
  const enrollmentsOk = await testEnrollmentsTable()
  console.log('')
  
  const classesOk = await testClassesTable()
  console.log('')
  
  if (enrollmentsOk && classesOk) {
    console.log('✨ All tables are accessible! Student enrollment should work.')
  } else {
    console.log('⚠️ Some tables have issues. Please run the SQL scripts to fix them.')
    
    if (!enrollmentsOk) {
      console.log('   → Run: create-enrollments-table-minimal.sql')
    }
    if (!classesOk) {
      console.log('   → Check your classes table setup')
    }
  }
}

main().catch(console.error)