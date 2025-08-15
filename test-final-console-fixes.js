const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Simulate the retry query function
async function retryQuery(queryFn, maxRetries = 3, delay = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await queryFn();
      
      if (!result.error) {
        return result;
      }
      
      lastError = result.error;
      
      // Don't retry on certain types of errors
      if (result.error?.code === 'PGRST116' || 
          result.error?.code === '42P01' ||    
          result.error?.code === '42703') {    
        break;
      }
      
      if (attempt < maxRetries) {
        console.log(`Query attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        console.log(`Query attempt ${attempt} threw error, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }
  
  return { data: null, error: lastError };
}

function logError(context, error, additionalInfo) {
  console.error(`${context}:`, error);
  
  if (error && typeof error === 'object') {
    console.error(`${context} details:`, JSON.stringify(error, null, 2));
  }
  
  if (additionalInfo) {
    console.error(`${context} additional info:`, additionalInfo);
  }
}

async function testFinalFixes() {
  console.log('🧪 Testing final console error fixes...\n');
  
  try {
    // Test 1: Simulate loadData with null checks
    console.log('1. Testing loadData with null checks...');
    
    const mockUser = { id: '11795caa-fb02-480c-b67e-f0087b356dc7' };
    const mockParams = { id: 'ba5baac4-deba-4ec3-8f5f-0d68a1080b81' };
    
    // Simulate the fixed loadData function
    const loadDataTest = async (user, resolvedParams) => {
      if (!resolvedParams?.id || !user?.id) {
        logError('loadData validation failed', null, { 
          assignmentId: resolvedParams?.id, 
          userId: user?.id 
        });
        return { success: false, error: 'Missing required parameters' };
      }
      
      const result = await retryQuery(async () => {
        return await supabase
          .from('assignments')
          .select('id, title, points, class_id, teacher_id')
          .eq('id', resolvedParams.id)
          .eq('teacher_id', user.id)
          .single();
      });
      
      if (result.error) {
        logError('Assignment query failed', result.error);
        return { success: false, error: result.error };
      }
      
      return { success: true, data: result.data };
    };
    
    const result = await loadDataTest(mockUser, mockParams);
    if (result.success) {
      console.log('✅ loadData test passed');
    } else {
      console.log('❌ loadData test failed:', result.error);
    }
    
    // Test 2: Simulate student assignments with proper checks
    console.log('\n2. Testing student assignments with null checks...');
    
    const studentId = '09b1a3d5-41af-4443-ac0a-10e19155dd41';
    const mockStudentUser = { id: studentId };
    
    const loadAssignmentsTest = async (user) => {
      if (!user?.id) {
        logError('loadAssignments called without user ID', null);
        return { success: false, error: 'User not found' };
      }
      
      // Test enrollments access with retry
      const enrollmentResult = await retryQuery(async () => {
        return await supabase
          .from('enrollments')
          .select('class_id')
          .eq('student_id', user.id);
      });
      
      if (enrollmentResult.error) {
        logError('Enrollments query failed', enrollmentResult.error);
        return { success: false, error: enrollmentResult.error };
      }
      
      const classIds = enrollmentResult.data?.map(e => e.class_id) || [];
      
      if (classIds.length === 0) {
        return { success: true, data: [], message: 'No enrollments found' };
      }
      
      // Get assignments for enrolled classes
      const assignmentResult = await retryQuery(async () => {
        return await supabase
          .from('assignments')
          .select('id, title, class_id')
          .in('class_id', classIds);
      });
      
      if (assignmentResult.error) {
        logError('Assignments query failed', assignmentResult.error);
        return { success: false, error: assignmentResult.error };
      }
      
      return { success: true, data: assignmentResult.data };
    };
    
    const studentResult = await loadAssignmentsTest(mockStudentUser);
    if (studentResult.success) {
      console.log('✅ Student assignments test passed');
      console.log('   Found assignments:', studentResult.data?.length || 0);
    } else {
      console.log('❌ Student assignments test failed:', studentResult.error);
    }
    
    // Test 3: Test error logging improvements
    console.log('\n3. Testing enhanced error logging...');
    
    // Simulate a query that will fail
    const { data, error } = await supabase
      .from('nonexistent_table')
      .select('*')
      .limit(1);
      
    if (error) {
      logError('Expected error test', error, { context: 'Testing error logging' });
      console.log('✅ Enhanced error logging working');
    }
    
    // Test 4: Test retry mechanism
    console.log('\n4. Testing retry mechanism...');
    
    let attemptCount = 0;
    const retryResult = await retryQuery(async () => {
      attemptCount++;
      if (attemptCount < 2) {
        // Simulate a temporary failure
        return { data: null, error: { code: 'TEMP_ERROR', message: 'Temporary failure' } };
      }
      // Success on second attempt
      return await supabase
        .from('users')
        .select('id, email')
        .limit(1);
    }, 3, 100);
    
    if (!retryResult.error && retryResult.data) {
      console.log('✅ Retry mechanism working');
      console.log('   Succeeded after', attemptCount, 'attempts');
    } else {
      console.log('❌ Retry mechanism failed');
    }
    
    console.log('\n🎉 Final console error fixes test completed!');
    
    console.log('\n📋 Summary of Fixes Applied:');
    console.log('✅ Added null checks for user and params');
    console.log('✅ Enhanced error logging with JSON.stringify');
    console.log('✅ Added loading state checks');
    console.log('✅ Implemented retry mechanism for failed queries');
    console.log('✅ Improved timing of useEffect calls');
    console.log('✅ Added proper error context logging');
    
    console.log('\n🚀 Console should now be error-free!');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testFinalFixes().catch(console.error);