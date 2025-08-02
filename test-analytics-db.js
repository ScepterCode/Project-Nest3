// Simple test to check database connectivity for analytics
const { createClient } = require('@supabase/supabase-js')

async function testAnalyticsDB() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables')
    return
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  console.log('Testing database connectivity for analytics...')
  
  // Test classes table
  try {
    const { data: classes, error: classError } = await supabase
      .from('classes')
      .select('id, name, teacher_id')
      .limit(5)
    
    if (classError) {
      console.error('Classes table error:', classError)
    } else {
      console.log('✅ Classes table accessible:', classes?.length || 0, 'records found')
    }
  } catch (error) {
    console.error('❌ Classes table test failed:', error)
  }
  
  // Test enrollments table
  try {
    const { data: enrollments, error: enrollmentError } = await supabase
      .from('enrollments')
      .select('id, student_id, class_id, status')
      .limit(5)
    
    if (enrollmentError) {
      console.error('Enrollments table error:', enrollmentError)
    } else {
      console.log('✅ Enrollments table accessible:', enrollments?.length || 0, 'records found')
    }
  } catch (error) {
    console.error('❌ Enrollments table test failed:', error)
  }
  
  // Test assignments table
  try {
    const { data: assignments, error: assignmentError } = await supabase
      .from('assignments')
      .select('id, title, teacher_id, points')
      .limit(5)
    
    if (assignmentError) {
      console.error('Assignments table error:', assignmentError)
    } else {
      console.log('✅ Assignments table accessible:', assignments?.length || 0, 'records found')
    }
  } catch (error) {
    console.error('❌ Assignments table test failed:', error)
  }
  
  // Test submissions table
  try {
    const { data: submissions, error: submissionError } = await supabase
      .from('submissions')
      .select('id, assignment_id, student_id, points_earned')
      .limit(5)
    
    if (submissionError) {
      console.error('Submissions table error:', submissionError)
    } else {
      console.log('✅ Submissions table accessible:', submissions?.length || 0, 'records found')
    }
  } catch (error) {
    console.error('❌ Submissions table test failed:', error)
  }
  
  // Test users table
  try {
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, role, first_name, last_name')
      .limit(5)
    
    if (userError) {
      console.error('Users table error:', userError)
    } else {
      console.log('✅ Users table accessible:', users?.length || 0, 'records found')
    }
  } catch (error) {
    console.error('❌ Users table test failed:', error)
  }
  
  console.log('\nDatabase connectivity test completed.')
}

testAnalyticsDB().catch(console.error)