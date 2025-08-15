const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeCompleteWorkflow() {
  console.log('🔍 Analyzing complete teacher-student workflow...\n');
  
  try {
    // 1. Check current data state
    console.log('1. Current Data State:');
    
    const { data: users } = await supabase.from('users').select('id, email, role');
    const teachers = users?.filter(u => u.role === 'teacher') || [];
    const students = users?.filter(u => u.role === 'student') || [];
    
    console.log(`   Teachers: ${teachers.length}`);
    console.log(`   Students: ${students.length}`);
    
    const { data: classes } = await supabase.from('classes').select('*');
    console.log(`   Classes: ${classes?.length || 0}`);
    
    const { data: assignments } = await supabase.from('assignments').select('*');
    console.log(`   Assignments: ${assignments?.length || 0}`);
    
    const { data: enrollments } = await supabase.from('enrollments').select('*');
    console.log(`   Enrollments: ${enrollments?.length || 0}`);
    
    const { data: submissions } = await supabase.from('submissions').select('*');
    console.log(`   Submissions: ${submissions?.length || 0}`);
    
    // 2. Test complete workflow
    console.log('\n2. Testing Complete Workflow:');
    
    if (teachers.length > 0 && students.length > 0) {
      const teacher = teachers[0];
      const student = students[0];
      
      console.log(`   Using Teacher: ${teacher.email}`);
      console.log(`   Using Student: ${student.email}`);
      
      // Check if teacher has classes
      const teacherClasses = classes?.filter(c => c.teacher_id === teacher.id) || [];
      console.log(`   Teacher's classes: ${teacherClasses.length}`);
      
      if (teacherClasses.length > 0) {
        const testClass = teacherClasses[0];
        console.log(`   Test class: ${testClass.name} (${testClass.code})`);
        
        // Check if student is enrolled
        const studentEnrollment = enrollments?.find(e => 
          e.class_id === testClass.id && e.student_id === student.id
        );
        console.log(`   Student enrolled: ${studentEnrollment ? 'Yes' : 'No'}`);
        
        // Check assignments for this class
        const classAssignments = assignments?.filter(a => a.class_id === testClass.id) || [];
        console.log(`   Class assignments: ${classAssignments.length}`);
        
        if (classAssignments.length > 0) {
          const testAssignment = classAssignments[0];
          console.log(`   Test assignment: ${testAssignment.title}`);
          
          // Check submissions for this assignment
          const assignmentSubmissions = submissions?.filter(s => 
            s.assignment_id === testAssignment.id
          ) || [];
          console.log(`   Assignment submissions: ${assignmentSubmissions.length}`);
          
          // Check if student has submitted
          const studentSubmission = assignmentSubmissions.find(s => 
            s.student_id === student.id
          );
          console.log(`   Student submitted: ${studentSubmission ? 'Yes' : 'No'}`);
          
          if (studentSubmission) {
            console.log(`   Submission status: ${studentSubmission.status}`);
            console.log(`   Grade: ${studentSubmission.grade || 'Not graded'}`);
          }
        }
      }
    }
    
    // 3. Check for missing tables/relationships
    console.log('\n3. Checking Missing Components:');
    
    const tablesToCheck = [
      'peer_reviews',
      'peer_review_assignments', 
      'peer_review_activity',
      'rubrics',
      'notifications',
      'user_profiles'
    ];
    
    for (const table of tablesToCheck) {
      try {
        const { error } = await supabase.from(table).select('count').limit(1);
        console.log(`   ${table}: ${error ? '❌ Missing/Inaccessible' : '✅ Available'}`);
        if (error) console.log(`     Error: ${error.message}`);
      } catch (e) {
        console.log(`   ${table}: ❌ Error - ${e.message}`);
      }
    }
    
    // 4. Identify workflow gaps
    console.log('\n4. Workflow Gaps Identified:');
    
    const gaps = [];
    
    if (!classes || classes.length === 0) {
      gaps.push('No classes created - teachers cannot create assignments');
    }
    
    if (!enrollments || enrollments.length === 0) {
      gaps.push('No enrollments - students cannot see assignments');
    }
    
    if (!assignments || assignments.length === 0) {
      gaps.push('No assignments - no grading workflow possible');
    }
    
    if (!submissions || submissions.length === 0) {
      gaps.push('No submissions - teachers have nothing to grade');
    }
    
    // Check for orphaned data
    const orphanedAssignments = assignments?.filter(a => 
      !classes?.find(c => c.id === a.class_id)
    ) || [];
    
    if (orphanedAssignments.length > 0) {
      gaps.push(`${orphanedAssignments.length} assignments reference non-existent classes`);
    }
    
    const orphanedSubmissions = submissions?.filter(s => 
      !assignments?.find(a => a.id === s.assignment_id)
    ) || [];
    
    if (orphanedSubmissions.length > 0) {
      gaps.push(`${orphanedSubmissions.length} submissions reference non-existent assignments`);
    }
    
    if (gaps.length === 0) {
      console.log('   ✅ No major workflow gaps found');
    } else {
      gaps.forEach(gap => console.log(`   ❌ ${gap}`));
    }
    
    console.log('\n5. Recommended Fixes:');
    console.log('   1. Ensure complete data relationships exist');
    console.log('   2. Create missing peer review tables if needed');
    console.log('   3. Fix foreign key constraints');
    console.log('   4. Add proper RLS policies for all tables');
    console.log('   5. Create test data for complete workflow');
    
  } catch (error) {
    console.error('❌ Analysis error:', error);
  }
}

analyzeCompleteWorkflow().catch(console.error);