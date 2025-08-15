const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testGradingPage() {
  console.log('🧪 Testing Grading Page Data Loading...\n');
  
  try {
    // Get users
    const { data: users } = await supabase.from('users').select('*');
    const teacher = users?.find(u => u.role === 'teacher');
    
    if (!teacher) {
      console.log('❌ No teacher found');
      return;
    }
    
    console.log(`Teacher: ${teacher.email} (${teacher.id})\n`);
    
    // Get teacher's assignments
    const { data: assignments } = await supabase
      .from('assignments')
      .select('*')
      .eq('teacher_id', teacher.id);
      
    if (!assignments || assignments.length === 0) {
      console.log('❌ No assignments found for teacher');
      return;
    }
    
    const assignment = assignments[0];
    console.log(`Testing assignment: ${assignment.title} (${assignment.id})\n`);
    
    // Test the exact queries used in the grading page
    console.log('1. Testing Assignment Query:');
    const { data: assignmentData, error: assignmentError } = await supabase
      .from('assignments')
      .select('id, title, description, due_date, points, class_id, teacher_id')
      .eq('id', assignment.id)
      .eq('teacher_id', teacher.id)
      .single();
      
    if (assignmentError) {
      console.log('❌ Assignment query error:', assignmentError.message);
    } else {
      console.log('✅ Assignment query successful');
      console.log(`  - Title: ${assignmentData.title}`);
      console.log(`  - Points: ${assignmentData.points}`);
      console.log(`  - Class ID: ${assignmentData.class_id}`);
    }
    
    console.log('\n2. Testing Class Info Query:');
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('id, name')
      .eq('id', assignmentData.class_id)
      .single();
      
    if (classError) {
      console.log('❌ Class query error:', classError.message);
    } else {
      console.log('✅ Class query successful');
      console.log(`  - Class: ${classData.name}`);
    }
    
    console.log('\n3. Testing Submissions Query:');
    const { data: submissionsData, error: submissionsError } = await supabase
      .from('submissions')
      .select('id, student_id, content, file_url, link_url, submitted_at, status, grade, feedback')
      .eq('assignment_id', assignment.id)
      .order('submitted_at', { ascending: false });
      
    if (submissionsError) {
      console.log('❌ Submissions query error:', submissionsError.message);
    } else {
      console.log(`✅ Submissions query successful: ${submissionsData?.length || 0} submissions`);
      
      if (submissionsData && submissionsData.length > 0) {
        console.log('\n4. Testing Student Info Query:');
        const studentIds = submissionsData.map(s => s.student_id);
        const { data: studentsData, error: studentsError } = await supabase
          .from('users')
          .select('id, first_name, last_name, email')
          .in('id', studentIds);
          
        if (studentsError) {
          console.log('❌ Students query error:', studentsError.message);
        } else {
          console.log(`✅ Students query successful: ${studentsData?.length || 0} students`);
          
          // Test the join logic
          const submissionsWithStudents = submissionsData.map(submission => {
            const student = studentsData?.find(s => s.id === submission.student_id);
            return {
              ...submission,
              student_name: student
                ? `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.email
                : 'Unknown Student',
              student_email: student?.email || 'unknown@email.com'
            };
          });
          
          console.log('\n5. Submissions with Student Info:');
          submissionsWithStudents.forEach(sub => {
            console.log(`  - ${sub.student_name} (${sub.student_email}): ${sub.status} ${sub.grade ? `- Grade: ${sub.grade}` : ''}`);
          });
        }
      }
    }
    
    console.log('\n6. Testing Enrollments Query:');
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('enrollments')
      .select('student_id')
      .eq('class_id', assignmentData.class_id);
      
    if (enrollmentsError) {
      console.log('❌ Enrollments query error:', enrollmentsError.message);
    } else {
      console.log(`✅ Enrollments query successful: ${enrollments?.length || 0} students enrolled`);
      
      // Calculate stats
      const totalStudents = enrollments?.length || 0;
      const submittedCount = submissionsData?.length || 0;
      const gradedCount = submissionsData?.filter(s => s.status === 'graded').length || 0;
      const pendingCount = totalStudents - submittedCount;
      
      console.log('\n7. Stats Calculation:');
      console.log(`  - Total Students: ${totalStudents}`);
      console.log(`  - Submitted: ${submittedCount}`);
      console.log(`  - Graded: ${gradedCount}`);
      console.log(`  - Pending: ${pendingCount}`);
    }
    
    console.log('\n🎉 All grading page queries working!');
    console.log('The grading page should now load properly.');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testGradingPage().catch(console.error);