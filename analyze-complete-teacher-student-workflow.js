const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeCompleteWorkflow() {
  console.log('🔍 Analyzing Complete Teacher-Student Workflow...\n');
  
  try {
    // Get users
    const { data: users } = await supabase.from('users').select('*');
    const teacher = users?.find(u => u.role === 'teacher');
    const student = users?.find(u => u.role === 'student');
    
    if (!teacher || !student) {
      console.log('❌ Missing users - Teacher:', !!teacher, 'Student:', !!student);
      return;
    }
    
    console.log(`Teacher: ${teacher.email} (${teacher.id})`);
    console.log(`Student: ${student.email} (${student.id})\n`);
    
    // 1. TEACHER CREATES CLASS
    console.log('1. TEACHER CREATES CLASS:');
    const { data: teacherClasses, error: tcError } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', teacher.id);
      
    if (tcError) {
      console.log('❌ Teacher classes error:', tcError.message);
    } else {
      console.log(`✅ Teacher has ${teacherClasses?.length || 0} classes`);
      if (teacherClasses?.length > 0) {
        teacherClasses.forEach(cls => {
          console.log(`   - ${cls.name} (${cls.code}) - ${cls.id}`);
        });
      }
    }
    
    // 2. STUDENT JOINS CLASS WITH CODE
    console.log('\n2. STUDENT JOINS CLASS WITH CODE:');
    const { data: enrollments, error: enError } = await supabase
      .from('enrollments')
      .select(`
        *,
        classes(name, code, teacher_id)
      `)
      .eq('student_id', student.id);
      
    if (enError) {
      console.log('❌ Student enrollments error:', enError.message);
    } else {
      console.log(`✅ Student enrolled in ${enrollments?.length || 0} classes`);
      if (enrollments?.length > 0) {
        enrollments.forEach(enrollment => {
          console.log(`   - ${enrollment.classes?.name} (${enrollment.classes?.code})`);
        });
      }
    }
    
    // 3. TEACHER CREATES ASSIGNMENTS
    console.log('\n3. TEACHER CREATES ASSIGNMENTS:');
    const { data: assignments, error: assError } = await supabase
      .from('assignments')
      .select(`
        *,
        classes(name, teacher_id)
      `)
      .eq('classes.teacher_id', teacher.id);
      
    if (assError) {
      console.log('❌ Teacher assignments error:', assError.message);
    } else {
      console.log(`✅ Teacher has ${assignments?.length || 0} assignments`);
      if (assignments?.length > 0) {
        assignments.forEach(assignment => {
          console.log(`   - ${assignment.title} (${assignment.points} pts) - Class: ${assignment.classes?.name}`);
        });
      }
    }
    
    // 4. STUDENT SEES ASSIGNMENTS FROM ENROLLED CLASSES
    console.log('\n4. STUDENT SEES ASSIGNMENTS FROM ENROLLED CLASSES:');
    const { data: studentAssignments, error: saError } = await supabase
      .from('assignments')
      .select(`
        *,
        classes!inner(
          name,
          enrollments!inner(student_id)
        )
      `)
      .eq('classes.enrollments.student_id', student.id);
      
    if (saError) {
      console.log('❌ Student assignments error:', saError.message);
    } else {
      console.log(`✅ Student sees ${studentAssignments?.length || 0} assignments`);
      if (studentAssignments?.length > 0) {
        studentAssignments.forEach(assignment => {
          console.log(`   - ${assignment.title} (${assignment.points} pts)`);
        });
      }
    }
    
    // 5. STUDENT SUBMITS ASSIGNMENTS
    console.log('\n5. STUDENT SUBMITS ASSIGNMENTS:');
    const { data: submissions, error: subError } = await supabase
      .from('submissions')
      .select(`
        *,
        assignments(title, points),
        users(first_name, last_name)
      `)
      .eq('student_id', student.id);
      
    if (subError) {
      console.log('❌ Student submissions error:', subError.message);
    } else {
      console.log(`✅ Student has ${submissions?.length || 0} submissions`);
      if (submissions?.length > 0) {
        submissions.forEach(submission => {
          console.log(`   - ${submission.assignments?.title}: ${submission.status} (Grade: ${submission.grade || 'Not graded'})`);
        });
      }
    }
    
    // 6. TEACHER SEES STUDENT SUBMISSIONS
    console.log('\n6. TEACHER SEES STUDENT SUBMISSIONS:');
    const { data: teacherSubmissions, error: tsError } = await supabase
      .from('submissions')
      .select(`
        *,
        assignments!inner(
          title,
          classes!inner(teacher_id)
        ),
        users(first_name, last_name, email)
      `)
      .eq('assignments.classes.teacher_id', teacher.id);
      
    if (tsError) {
      console.log('❌ Teacher submissions view error:', tsError.message);
    } else {
      console.log(`✅ Teacher sees ${teacherSubmissions?.length || 0} submissions`);
      if (teacherSubmissions?.length > 0) {
        teacherSubmissions.forEach(submission => {
          console.log(`   - ${submission.users?.email}: ${submission.assignments?.title} (${submission.status})`);
        });
      }
    }
    
    // 7. TEACHER GRADES SUBMISSIONS
    console.log('\n7. TEACHER GRADES SUBMISSIONS:');
    const gradedSubmissions = submissions?.filter(s => s.grade !== null) || [];
    console.log(`✅ ${gradedSubmissions.length} submissions are graded`);
    
    // 8. STUDENT SEES GRADES
    console.log('\n8. STUDENT SEES GRADES:');
    const { data: studentGrades, error: sgError } = await supabase
      .from('submissions')
      .select(`
        grade,
        feedback,
        graded_at,
        assignments(title, points)
      `)
      .eq('student_id', student.id)
      .not('grade', 'is', null);
      
    if (sgError) {
      console.log('❌ Student grades error:', sgError.message);
    } else {
      console.log(`✅ Student has ${studentGrades?.length || 0} graded assignments`);
      if (studentGrades?.length > 0) {
        studentGrades.forEach(grade => {
          console.log(`   - ${grade.assignments?.title}: ${grade.grade}/${grade.assignments?.points}`);
        });
      }
    }
    
    // 9. PEER REVIEW SYSTEM
    console.log('\n9. PEER REVIEW SYSTEM:');
    const { data: peerReviewAssignments, error: praError } = await supabase
      .from('peer_review_assignments')
      .select('*');
      
    if (praError) {
      console.log('❌ Peer review assignments error:', praError.message);
    } else {
      console.log(`✅ ${peerReviewAssignments?.length || 0} peer review assignments exist`);
    }
    
    const { data: peerReviews, error: prError } = await supabase
      .from('peer_reviews')
      .select('*');
      
    if (prError) {
      console.log('❌ Peer reviews error:', prError.message);
    } else {
      console.log(`✅ ${peerReviews?.length || 0} peer reviews exist`);
    }
    
    // 10. ANALYTICS DATA
    console.log('\n10. ANALYTICS DATA:');
    console.log(`✅ Classes: ${teacherClasses?.length || 0}`);
    console.log(`✅ Enrollments: ${enrollments?.length || 0}`);
    console.log(`✅ Assignments: ${assignments?.length || 0}`);
    console.log(`✅ Submissions: ${submissions?.length || 0}`);
    console.log(`✅ Graded: ${gradedSubmissions.length}`);
    console.log(`✅ Peer Reviews: ${peerReviews?.length || 0}`);
    
    // 11. NOTIFICATIONS
    console.log('\n11. NOTIFICATIONS:');
    const { data: notifications, error: notError } = await supabase
      .from('notifications')
      .select('*')
      .in('user_id', [teacher.id, student.id]);
      
    if (notError) {
      console.log('❌ Notifications error:', notError.message);
    } else {
      console.log(`✅ ${notifications?.length || 0} notifications exist`);
    }
    
    // IDENTIFY BROKEN RELATIONSHIPS
    console.log('\n🔍 IDENTIFYING BROKEN RELATIONSHIPS:');
    
    const issues = [];
    
    if (!teacherClasses || teacherClasses.length === 0) {
      issues.push('❌ Teacher has no classes');
    }
    
    if (!enrollments || enrollments.length === 0) {
      issues.push('❌ Student not enrolled in any classes');
    }
    
    if (!assignments || assignments.length === 0) {
      issues.push('❌ No assignments created');
    }
    
    if (!studentAssignments || studentAssignments.length === 0) {
      issues.push('❌ Student cannot see teacher assignments (enrollment/visibility issue)');
    }
    
    if (!submissions || submissions.length === 0) {
      issues.push('❌ No student submissions');
    }
    
    if (!teacherSubmissions || teacherSubmissions.length === 0) {
      issues.push('❌ Teacher cannot see student submissions (relationship issue)');
    }
    
    if (gradedSubmissions.length === 0) {
      issues.push('❌ No graded submissions');
    }
    
    if (!peerReviewAssignments || peerReviewAssignments.length === 0) {
      issues.push('❌ No peer review assignments');
    }
    
    if (issues.length > 0) {
      console.log('\n🚨 CRITICAL ISSUES FOUND:');
      issues.forEach(issue => console.log(issue));
    } else {
      console.log('\n✅ All relationships appear to be working!');
    }
    
    console.log('\n🎯 WORKFLOW ANALYSIS COMPLETE');
    
  } catch (error) {
    console.error('❌ Analysis error:', error);
  }
}

analyzeCompleteWorkflow().catch(console.error);