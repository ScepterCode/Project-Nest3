const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDualGradingSystem() {
  console.log('🧪 Testing Dual Grading System...\n');
  
  try {
    // Get the assignment with rubric
    const { data: assignments } = await supabase
      .from('assignments')
      .select('*')
      .limit(1);
      
    if (!assignments || assignments.length === 0) {
      console.log('❌ No assignments found');
      return;
    }
    
    const assignment = assignments[0];
    console.log(`Testing assignment: ${assignment.title}`);
    
    // Check if assignment has rubric
    if (assignment.rubric && typeof assignment.rubric === 'object') {
      console.log('✅ Assignment has rubric:', assignment.rubric.name);
      console.log('Rubric criteria:');
      
      assignment.rubric.criteria.forEach((criterion, index) => {
        console.log(`  ${index + 1}. ${criterion.name} (${criterion.weight}%)`);
        console.log(`     ${criterion.description}`);
        console.log(`     Levels: ${criterion.levels.map(l => `${l.name} (${l.points}pts)`).join(', ')}`);
      });
      
      // Test rubric grade calculation
      console.log('\n🧮 Testing Rubric Grade Calculation:');
      
      // Simulate rubric scores (highest level for each criterion)
      const testScores = {};
      let totalWeightedScore = 0;
      let totalWeight = 0;
      
      assignment.rubric.criteria.forEach(criterion => {
        const maxPoints = Math.max(...criterion.levels.map(l => l.points));
        testScores[criterion.id] = maxPoints;
        
        const weight = criterion.weight || 25;
        totalWeightedScore += (maxPoints * weight / 100);
        totalWeight += weight;
        
        console.log(`  ${criterion.name}: ${maxPoints} points (weight: ${weight}%)`);
      });
      
      // Calculate final grade
      const percentage = totalWeight > 0 ? (totalWeightedScore / totalWeight) * 100 : 0;
      const finalGrade = Math.round((percentage / 100) * (assignment.points || 100));
      
      console.log(`\nCalculation:`);
      console.log(`  Total weighted score: ${totalWeightedScore}`);
      console.log(`  Total weight: ${totalWeight}%`);
      console.log(`  Percentage: ${percentage.toFixed(1)}%`);
      console.log(`  Final grade: ${finalGrade}/${assignment.points || 100}`);
      
    } else {
      console.log('❌ Assignment has no rubric - simple grading only');
    }
    
    // Test submissions table for rubric_scores column
    console.log('\n📊 Testing Submissions Table:');
    const { data: submissions } = await supabase
      .from('submissions')
      .select('*')
      .eq('assignment_id', assignment.id)
      .limit(1);
      
    if (submissions && submissions.length > 0) {
      const submission = submissions[0];
      console.log('Submission columns:', Object.keys(submission));
      console.log('Current grade:', submission.grade);
      console.log('Has rubric_scores field:', submission.hasOwnProperty('rubric_scores'));
      console.log('Rubric scores value:', submission.rubric_scores);
    }
    
    // Test adding rubric_scores column if it doesn't exist
    console.log('\n🔧 Testing Rubric Scores Storage:');
    
    const testRubricData = {
      scores: { 'creativity': 4, 'technical_execution': 3, 'design_principles': 4, 'presentation': 3 },
      rubric_name: 'Design Assignment Rubric',
      graded_with_rubric: true
    };
    
    // Try to update a submission with rubric data
    if (submissions && submissions.length > 0) {
      const { error: updateError } = await supabase
        .from('submissions')
        .update({
          rubric_scores: testRubricData
        })
        .eq('id', submissions[0].id);
        
      if (updateError) {
        console.log('❌ Error storing rubric scores:', updateError.message);
        console.log('This means we need to add the rubric_scores column to submissions table');
      } else {
        console.log('✅ Rubric scores stored successfully');
        
        // Verify the data was stored
        const { data: updatedSubmission } = await supabase
          .from('submissions')
          .select('rubric_scores')
          .eq('id', submissions[0].id)
          .single();
          
        console.log('Stored rubric data:', updatedSubmission?.rubric_scores);
      }
    }
    
    console.log('\n🎯 DUAL GRADING SYSTEM TEST COMPLETE');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testDualGradingSystem().catch(console.error);