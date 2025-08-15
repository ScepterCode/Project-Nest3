/**
 * Test script to verify the class join flow
 */

console.log('🔍 Testing class join flow...')

async function testClassJoinFlow() {
  try {
    const { createClient } = await import('./lib/supabase/client.ts')
    const supabase = createClient()
    
    console.log('1. Testing classes table access...')
    
    // Test reading all classes
    const { data: allClasses, error: allError } = await supabase
      .from('classes')
      .select('id, name, code, status, teacher_id')
      .limit(5)
    
    if (allError) {
      console.error('❌ Cannot read classes table:', allError.message)
      return false
    }
    
    console.log(`✅ Found ${allClasses?.length || 0} classes`)
    allClasses?.forEach(c => {
      console.log(`   - ${c.name} (${c.code}) - Status: ${c.status}`)
    })
    
    if (!allClasses || allClasses.length === 0) {
      console.log('⚠️ No classes found. Create a class first.')
      return false
    }
    
    // Test finding a specific class by code
    const testClass = allClasses[0]
    console.log(`\n2. Testing lookup for class code: ${testClass.code}`)
    
    const { data: foundClass, error: findError } = await supabase
      .from('classes')
      .select('id, name, code, status')
      .eq('code', testClass.code)
      .single()
    
    if (findError) {
      console.error('❌ Cannot find class by code:', findError.message)
      return false
    }
    
    console.log('✅ Successfully found class by code:', foundClass.name)
    
    return true
    
  } catch (error) {
    console.error('❌ Test error:', error.message)
    return false
  }
}

testClassJoinFlow().then(success => {
  if (success) {
    console.log('\n✨ Class join flow test passed!')
  } else {
    console.log('\n⚠️ Class join flow has issues. Check the output above.')
  }
})