const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createTestData() {
  console.log('Creating test data for grading...');
  
  try {
    // First, get existing assignment
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, title, teacher_id, class_id')
      .limit(1);
      
    if (!assignments || assignments.length === 0) {
      console.log('No assignments found. Creating test assignment...');
      
      // Get a teacher user
      const { data: users } = await supabase
        .from('users')
        .select('id, email, role')
        .eq('role', 'teacher')
        .limit(1);
        
      if (!users || users.length === 0) {
        console.log('No teacher found. Creating test teacher...');
        
        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert({
            email: 'teacher@test.com',
            first_name: 'Test',
            last_name: 'Teacher',
            role: 'teacher'
          })
          .select()
          .single();
          
        if (userError) {
          console.log('Error creating teacher:', userError.message);
          return;
        }
        
        users.push(newUser);
      }
      
      const teacherId = users[0].id;
      
      // Create test class
      const { data: newClass, error: classError } = await supabase
        .from('classes')
        .insert({
          name: 'Test Class for Grading',
          description: 'Test class for grading functionality',
          teacher_id: teacherId,
          code: 'TEST' + Math.random().toString(36).substr(2, 4).toUpperCase()
        })
        .select()
        .single();
        
      if (classError) {
        console.log('Error creating class:', classError.message);
        return;
      }
      
      // Create test assignment
      const { data: newAssignment, error: assignmentError } = await supabase
        .from('assignments')
        .insert({
          title: 'Test Assignment for Grading',
          description: 'This is a test assignment to test the grading functionality',
          class_id: newClass.id,
          teacher_id: teacherId,
          points_possible: 100,
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();
        
      if (assignmentError) {
        console.log('Error creating assignment:', assignmentError.message);
        return;
      }
      
      assignments.push(newAssignment);
      console.log('✅ Created test assignment:', newAssignment.title);
    }
    
    const assignment = assignments[0];
    console.log('Using assignment:', assignment.title);
    
    // Create test students
    const testStudents = [
      { email: 'student1@test.com', first_name: 'Alice', last_name: 'Johnson' },
      { email: 'student2@test.com', first_name: 'Bob', last_name: 'Smith' },
      { email: 'student3@test.com', first_name: 'Carol', last_name: 'Davis' }
    ];
    
    const studentIds = [];
    
    for (const student of testStudents) {
      // Check if student exists
      let { data: existingStudent } = await supabase
        .from('users')
        .select('id')
        .eq('email', student.email)
        .single();
        
      if (!existingStudent) {
        const { data: newStudent, error: studentError } = await supabase
          .from('users')
          .insert({
            id: crypto.randomUUID(),
            ...student,
            role: 'student'
          })
          .select()
          .single();
          
        if (studentError) {
          console.log('Error creating student:', studentError.message);
          continue;
        }
        existingStudent = newStudent;
        console.log('✅ Created student:', student.first_name, student.last_name);
      }
      
      studentIds.push(existingStudent.id);
      
      // Enroll student in class
      const { error: enrollError } = await supabase
        .from('enrollments')
        .upsert({
          class_id: assignment.class_id,
          student_id: existingStudent.id,
          status: 'active'
        });
        
      if (enrollError) {
        console.log('Error enrolling student:', enrollError.message);
      }
    }
    
    // Create test submissions
    const submissionContents = [
      'This is Alice\'s submission. She did a great job explaining the concepts and provided detailed examples.',
      'Bob\'s submission covers the basic requirements but could use more detail in the analysis section.',
      'Carol\'s submission is excellent with thorough research and well-structured arguments.'
    ];
    
    for (let i = 0; i < studentIds.length; i++) {
      const { data: submission, error: submissionError } = await supabase
        .from('submissions')
        .insert({
          assignment_id: assignment.id,
          student_id: studentIds[i],
          content: submissionContents[i],
          status: 'submitted',
          submitted_at: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();
        
      if (submissionError) {
        console.log('Error creating submission:', submissionError.message);
      } else {
        console.log('✅ Created submission for student', i + 1);
      }
    }
    
    console.log('\\n✅ Test data creation complete!');
    console.log('Assignment ID:', assignment.id);
    console.log('You can now test grading at: /dashboard/teacher/assignments/' + assignment.id + '/grade');
    
  } catch (error) {
    console.error('Error creating test data:', error);
  }
}

createTestData().catch(console.error);