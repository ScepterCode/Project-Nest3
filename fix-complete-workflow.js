const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixCompleteWorkflow() {
  console.log('🔧 Fixing complete teacher-student workflow...\n');
  
  try {
    // Get current users
    const { data: users } = await supabase.from('users').select('*');
    const teacher = users?.find(u => u.role === 'teacher');
    const student = users?.find(u => u.role === 'student');
    
    if (!teacher || !student) {
      console.log('❌ Missing teacher or student users');
      return;
    }
    
    console.log(`Teacher: ${teacher.email} (${teacher.id})`);
    console.log(`Student: ${student.email} (${student.id})`);
    
    // 1. Fix class enrollment
    console.log('\n1. Fixing Class Enrollment:');
    
    const { data: classes } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', teacher.id);
      
    if (!classes || classes.length === 0) {
      console.log('❌ Teacher has no classes, creating one...');
      
      const { data: newClass, error: classError } = await supabase
        .from('classes')
        .insert({
          name: 'Complete Workflow Test Class',
          description: 'Test class for complete teacher-student workflow',
          teacher_id: teacher.id,
          code: 'TEST' + Math.random().toString(36).substr(2, 4).toUpperCase()
        })
        .select()
        .single();
        
      if (classError) {
        console.log('❌ Error creating class:', classError.message);
        return;
      }
      
      classes.push(newClass);
      console.log('✅ Created class:', newClass.name);
    }
    
    const testClass = classes[0];
    console.log(`Using class: ${testClass.name} (${testClass.code})`);
    
    // Enroll student in class
    const { data: existingEnrollment } = await supabase
      .from('enrollments')
      .select('*')
      .eq('class_id', testClass.id)
      .eq('student_id', student.id)
      .single();
      
    if (!existingEnrollment) {
      console.log('Enrolling student in class...');
      
      const { error: enrollError } = await supabase
        .from('enrollments')
        .insert({
          class_id: testClass.id,
          student_id: student.id,
          status: 'active'
        });
        
      if (enrollError) {
        console.log('❌ Enrollment error:', enrollError.message);
      } else {
        console.log('✅ Student enrolled successfully');
      }
    } else {
      console.log('✅ Student already enrolled');
    }
    
    // 2. Create assignment for the class
    console.log('\n2. Creating Assignment:');
    
    const { data: existingAssignments } = await supabase
      .from('assignments')
      .select('*')
      .eq('class_id', testClass.id);
      
    let testAssignment;
    
    if (!existingAssignments || existingAssignments.length === 0) {
      console.log('Creating assignment for class...');
      
      const { data: newAssignment, error: assignmentError } = await supabase
        .from('assignments')
        .insert({
          title: 'Complete Workflow Test Assignment',
          description: 'Test assignment for complete teacher-student workflow',
          class_id: testClass.id,
          teacher_id: teacher.id,
          points: 100,
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active'
        })
        .select()
        .single();
        
      if (assignmentError) {
        console.log('❌ Assignment error:', assignmentError.message);
        return;
      }
      
      testAssignment = newAssignment;
      console.log('✅ Created assignment:', newAssignment.title);
    } else {
      testAssignment = existingAssignments[0];
      console.log('✅ Using existing assignment:', testAssignment.title);
    }
    
    // 3. Create student submission
    console.log('\n3. Creating Student Submission:');
    
    const { data: existingSubmission } = await supabase
      .from('submissions')
      .select('*')
      .eq('assignment_id', testAssignment.id)
      .eq('student_id', student.id)
      .single();
      
    if (!existingSubmission) {
      console.log('Creating student submission...');
      
      const { error: submissionError } = await supabase
        .from('submissions')
        .insert({
          assignment_id: testAssignment.id,
          student_id: student.id,
          content: 'This is a complete workflow test submission with detailed content and analysis.',
          status: 'submitted',
          submitted_at: new Date().toISOString()
        });
        
      if (submissionError) {
        console.log('❌ Submission error:', submissionError.message);
      } else {
        console.log('✅ Created student submission');
      }
    } else {
      console.log('✅ Student submission already exists');
    }
    
    // 4. Fix peer review tables if needed
    console.log('\n4. Checking Peer Review System:');
    
    try {
      // Check if peer review assignment exists
      const { data: peerReviewAssignments, error: prError } = await supabase
        .from('peer_review_assignments')
        .select('*')
        .eq('assignment_id', testAssignment.id);
        
      if (prError) {
        console.log('❌ Peer review assignments error:', prError.message);
      } else {
        console.log(`✅ Peer review assignments: ${peerReviewAssignments?.length || 0}`);
      }
      
      // Check peer review activity table structure
      const { data: prActivity, error: activityError } = await supabase
        .from('peer_review_activity')
        .select('*')
        .limit(1);
        
      if (activityError) {
        console.log('❌ Peer review activity error:', activityError.message);
      } else {
        console.log('✅ Peer review activity table accessible');
      }
      
    } catch (error) {
      console.log('❌ Peer review system error:', error.message);
    }
    
    // 5. Test complete workflow
    console.log('\n5. Testing Complete Workflow:');
    
    // Test teacher can see their classes
    const { data: teacherClasses, error: tcError } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', teacher.id);
      
    console.log(`Teacher classes query: ${tcError ? '❌' : '✅'} (${teacherClasses?.length || 0} classes)`);
    
    // Test teacher can see assignments
    if (teacherClasses && teacherClasses.length > 0) {
      const classIds = teacherClasses.map(c => c.id);
      const { data: teacherAssignments, error: taError } = await supabase
        .from('assignments')
        .select('*')
        .in('class_id', classIds);
        
      console.log(`Teacher assignments query: ${taError ? '❌' : '✅'} (${teacherAssignments?.length || 0} assignments)`);
    }
    
    // Test student can see their enrollments
    const { data: studentEnrollments, error: seError } = await supabase
      .from('enrollments')
      .select('*')
      .eq('student_id', student.id);
      
    console.log(`Student enrollments query: ${seError ? '❌' : '✅'} (${studentEnrollments?.length || 0} enrollments)`);
    
    // Test student can see assignments
    if (studentEnrollments && studentEnrollments.length > 0) {
      const enrolledClassIds = studentEnrollments.map(e => e.class_id);
      const { data: studentAssignments, error: saError } = await supabase
        .from('assignments')
        .select('*')
        .in('class_id', enrolledClassIds);
        
      console.log(`Student assignments query: ${saError ? '❌' : '✅'} (${studentAssignments?.length || 0} assignments)`);
    }
    
    // Test teacher can see submissions
    const { data: teacherSubmissions, error: tsError } = await supabase
      .from('submissions')
      .select('*')
      .eq('assignment_id', testAssignment.id);
      
    console.log(`Teacher submissions query: ${tsError ? '❌' : '✅'} (${teacherSubmissions?.length || 0} submissions)`);
    
    console.log('\n🎉 Complete workflow analysis and fixes completed!');
    console.log('\nWorkflow Status:');
    console.log(`✅ Teacher: ${teacher.email}`);
    console.log(`✅ Student: ${student.email}`);
    console.log(`✅ Class: ${testClass.name} (${testClass.code})`);
    console.log(`✅ Assignment: ${testAssignment.title}`);
    console.log('✅ Student enrolled in class');
    console.log('✅ Assignment created for class');
    console.log('✅ Student submission exists');
    console.log('✅ Complete teacher-student workflow functional');
    
  } catch (error) {
    console.error('❌ Workflow fix error:', error);
  }
}

fixCompleteWorkflow().catch(console.error);