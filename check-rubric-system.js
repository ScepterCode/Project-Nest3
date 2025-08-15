const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRubricSystem() {
  console.log('🔍 Checking Rubric System Integration...\n');
  
  try {
    // Check if rubrics table exists
    console.log('1. Checking Rubrics Table:');
    const { data: rubrics, error: rubricsError } = await supabase
      .from('rubrics')
      .select('*')
      .limit(5);
      
    if (rubricsError) {
      console.log('❌ Rubrics table error:', rubricsError.message);
    } else {
      console.log(`✅ Rubrics table accessible: ${rubrics?.length || 0} rubrics found`);
      if (rubrics && rubrics.length > 0) {
        rubrics.forEach(rubric => {
          console.log(`  - ${rubric.title}: ${rubric.criteria?.length || 0} criteria`);
        });
      }
    }
    
    // Check assignments table for rubric_id column
    console.log('\n2. Checking Assignment-Rubric Relationship:');
    const { data: assignments } = await supabase
      .from('assignments')
      .select('*')
      .limit(3);
      
    if (assignments) {
      console.log('Assignment table columns:', Object.keys(assignments[0] || {}));
      
      assignments.forEach(assignment => {
        console.log(`Assignment: ${assignment.title}`);
        console.log(`  - Has rubric field: ${assignment.hasOwnProperty('rubric_id') ? 'YES' : 'NO'}`);
        console.log(`  - Rubric value: ${assignment.rubric_id || assignment.rubric || 'None'}`);
      });
    }
    
    // Check if there are any rubric_criteria table
    console.log('\n3. Checking Rubric Criteria:');
    const { data: criteria, error: criteriaError } = await supabase
      .from('rubric_criteria')
      .select('*')
      .limit(5);
      
    if (criteriaError) {
      console.log('❌ Rubric criteria table error:', criteriaError.message);
    } else {
      console.log(`✅ Rubric criteria table accessible: ${criteria?.length || 0} criteria found`);
    }
    
    // Check submissions table for rubric grading
    console.log('\n4. Checking Submissions for Rubric Grading:');
    const { data: submissions } = await supabase
      .from('submissions')
      .select('*')
      .limit(3);
      
    if (submissions) {
      console.log('Submissions table columns:', Object.keys(submissions[0] || {}));
      
      submissions.forEach(submission => {
        console.log(`Submission ${submission.id}:`);
        console.log(`  - Grade: ${submission.grade}`);
        console.log(`  - Has rubric_scores: ${submission.hasOwnProperty('rubric_scores') ? 'YES' : 'NO'}`);
        console.log(`  - Rubric scores: ${submission.rubric_scores || 'None'}`);
      });
    }
    
    // Check the current grading flow
    console.log('\n5. Analyzing Current Grading Flow:');
    
    // Get a teacher and their assignment
    const { data: users } = await supabase.from('users').select('*');
    const teacher = users?.find(u => u.role === 'teacher');
    
    if (teacher) {
      const { data: teacherAssignments } = await supabase
        .from('assignments')
        .select('*')
        .eq('teacher_id', teacher.id)
        .limit(1);
        
      if (teacherAssignments && teacherAssignments.length > 0) {
        const assignment = teacherAssignments[0];
        console.log(`\nTesting assignment: ${assignment.title}`);
        
        // Check if this assignment has a rubric
        if (assignment.rubric_id) {
          const { data: assignmentRubric } = await supabase
            .from('rubrics')
            .select('*')
            .eq('id', assignment.rubric_id)
            .single();
            
          if (assignmentRubric) {
            console.log(`✅ Assignment has rubric: ${assignmentRubric.title}`);
            console.log(`  - Criteria count: ${assignmentRubric.criteria?.length || 0}`);
          } else {
            console.log('❌ Assignment rubric_id points to non-existent rubric');
          }
        } else {
          console.log('❌ Assignment has no rubric assigned');
        }
        
        // Check submissions for this assignment
        const { data: assignmentSubmissions } = await supabase
          .from('submissions')
          .select('*')
          .eq('assignment_id', assignment.id);
          
        console.log(`Assignment has ${assignmentSubmissions?.length || 0} submissions`);
        
        if (assignmentSubmissions && assignmentSubmissions.length > 0) {
          const submission = assignmentSubmissions[0];
          console.log('Sample submission grading:');
          console.log(`  - Simple grade: ${submission.grade}`);
          console.log(`  - Rubric-based grading: ${submission.rubric_scores ? 'YES' : 'NO'}`);
        }
      }
    }
    
    console.log('\n🎯 RUBRIC SYSTEM ANALYSIS COMPLETE');
    
  } catch (error) {
    console.error('❌ Check error:', error);
  }
}

checkRubricSystem().catch(console.error);