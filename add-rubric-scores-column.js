const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addRubricScoresColumn() {
  console.log('🔧 Adding rubric_scores column to submissions table...\n');
  
  try {
    // Since we can't execute DDL directly, let's try a different approach
    // First, let's test if we can insert rubric_scores data
    
    console.log('Testing rubric_scores column...');
    
    // Get a test submission
    const { data: submissions } = await supabase
      .from('submissions')
      .select('id')
      .limit(1);
      
    if (!submissions || submissions.length === 0) {
      console.log('❌ No submissions found to test with');
      return;
    }
    
    const testSubmissionId = submissions[0].id;
    
    // Try to update with rubric_scores
    const testRubricData = {
      scores: { 'test': 100 },
      rubric_name: 'Test Rubric',
      graded_with_rubric: true
    };
    
    const { error: updateError } = await supabase
      .from('submissions')
      .update({ rubric_scores: testRubricData })
      .eq('id', testSubmissionId);
      
    if (updateError) {
      console.log('❌ Column does not exist:', updateError.message);
      console.log('\n📋 SQL to run in Supabase SQL Editor:');
      console.log('----------------------------------------');
      console.log('ALTER TABLE submissions ADD COLUMN IF NOT EXISTS rubric_scores JSONB;');
      console.log('COMMENT ON COLUMN submissions.rubric_scores IS \'Stores rubric grading data\';');
      console.log('CREATE INDEX IF NOT EXISTS idx_submissions_rubric_scores ON submissions USING GIN (rubric_scores);');
      console.log('----------------------------------------');
      console.log('\nPlease run the above SQL in your Supabase SQL Editor to add the column.');
    } else {
      console.log('✅ rubric_scores column already exists and working!');
      
      // Clean up test data
      await supabase
        .from('submissions')
        .update({ rubric_scores: null })
        .eq('id', testSubmissionId);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

addRubricScoresColumn().catch(console.error);