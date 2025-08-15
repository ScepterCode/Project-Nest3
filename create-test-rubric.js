const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createTestRubric() {
  console.log('Creating test rubric and linking to assignment...');
  
  try {
    // Get teacher ID from the assignment
    const assignmentId = 'ba5baac4-deba-4ec3-8f5f-0d68a1080b81';
    const { data: assignment } = await supabase
      .from('assignments')
      .select('teacher_id, class_id')
      .eq('id', assignmentId)
      .single();
      
    if (!assignment) {
      console.log('❌ Assignment not found');
      return;
    }
    
    // Create a test rubric
    const testRubric = {
      name: 'Design Assignment Rubric',
      description: 'Rubric for evaluating design assignments',
      teacher_id: assignment.teacher_id,
      criteria: [
        {
          id: 'creativity',
          name: 'Creativity & Innovation',
          description: 'Originality and creative thinking in design',
          weight: 30,
          levels: [
            {
              id: 'excellent',
              name: 'Excellent (27-30 pts)',
              description: 'Highly creative and innovative design solutions',
              points: 30
            },
            {
              id: 'good',
              name: 'Good (24-26 pts)', 
              description: 'Creative design with some innovative elements',
              points: 25
            },
            {
              id: 'satisfactory',
              name: 'Satisfactory (21-23 pts)',
              description: 'Adequate creativity, meets basic requirements',
              points: 22
            },
            {
              id: 'needs_improvement',
              name: 'Needs Improvement (0-20 pts)',
              description: 'Limited creativity, lacks innovation',
              points: 15
            }
          ]
        },
        {
          id: 'technical_execution',
          name: 'Technical Execution',
          description: 'Quality of technical implementation',
          weight: 25,
          levels: [
            {
              id: 'excellent',
              name: 'Excellent (23-25 pts)',
              description: 'Flawless technical execution',
              points: 25
            },
            {
              id: 'good',
              name: 'Good (20-22 pts)',
              description: 'Good technical quality with minor issues',
              points: 21
            },
            {
              id: 'satisfactory',
              name: 'Satisfactory (17-19 pts)',
              description: 'Adequate technical execution',
              points: 18
            },
            {
              id: 'needs_improvement',
              name: 'Needs Improvement (0-16 pts)',
              description: 'Poor technical execution',
              points: 12
            }
          ]
        },
        {
          id: 'design_principles',
          name: 'Design Principles',
          description: 'Application of design principles and aesthetics',
          weight: 25,
          levels: [
            {
              id: 'excellent',
              name: 'Excellent (23-25 pts)',
              description: 'Excellent use of design principles',
              points: 25
            },
            {
              id: 'good',
              name: 'Good (20-22 pts)',
              description: 'Good application of design principles',
              points: 21
            },
            {
              id: 'satisfactory',
              name: 'Satisfactory (17-19 pts)',
              description: 'Basic understanding of design principles',
              points: 18
            },
            {
              id: 'needs_improvement',
              name: 'Needs Improvement (0-16 pts)',
              description: 'Poor understanding of design principles',
              points: 12
            }
          ]
        },
        {
          id: 'presentation',
          name: 'Presentation & Documentation',
          description: 'Quality of presentation and documentation',
          weight: 20,
          levels: [
            {
              id: 'excellent',
              name: 'Excellent (18-20 pts)',
              description: 'Professional presentation and documentation',
              points: 20
            },
            {
              id: 'good',
              name: 'Good (16-17 pts)',
              description: 'Good presentation with clear documentation',
              points: 16
            },
            {
              id: 'satisfactory',
              name: 'Satisfactory (14-15 pts)',
              description: 'Adequate presentation and documentation',
              points: 14
            },
            {
              id: 'needs_improvement',
              name: 'Needs Improvement (0-13 pts)',
              description: 'Poor presentation and documentation',
              points: 10
            }
          ]
        }
      ]
    };
    
    // Check if rubrics table exists and get its structure
    const { data: existingRubrics, error: checkError } = await supabase
      .from('rubrics')
      .select('*')
      .limit(1);
      
    if (checkError) {
      console.log('❌ Cannot access rubrics table:', checkError.message);
      
      // Update assignment with inline rubric
      console.log('\\n📝 Adding rubric directly to assignment...');
      const { error: updateError } = await supabase
        .from('assignments')
        .update({ rubric: testRubric })
        .eq('id', assignmentId);
        
      if (updateError) {
        console.log('❌ Error updating assignment rubric:', updateError.message);
      } else {
        console.log('✅ Assignment rubric updated successfully');
      }
    } else {
      // Create rubric in rubrics table
      console.log('\\n📝 Creating rubric in rubrics table...');
      const { data: newRubric, error: createError } = await supabase
        .from('rubrics')
        .insert({
          name: testRubric.name,
          description: testRubric.description,
          teacher_id: testRubric.teacher_id,
          criteria: testRubric.criteria,
          total_points: 100,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
        
      if (createError) {
        console.log('❌ Error creating rubric:', createError.message);
        
        // Fallback to inline rubric
        const { error: updateError } = await supabase
          .from('assignments')
          .update({ rubric: testRubric })
          .eq('id', assignmentId);
          
        if (updateError) {
          console.log('❌ Error updating assignment rubric:', updateError.message);
        } else {
          console.log('✅ Assignment rubric updated successfully (fallback)');
        }
      } else {
        console.log('✅ Rubric created successfully');
        
        // Link rubric to assignment
        const { error: linkError } = await supabase
          .from('assignments')
          .update({ 
            rubric: { rubric_id: newRubric.id },
            rubric_id: newRubric.id 
          })
          .eq('id', assignmentId);
          
        if (linkError) {
          console.log('❌ Error linking rubric to assignment:', linkError.message);
        } else {
          console.log('✅ Rubric linked to assignment successfully');
        }
      }
    }
    
    console.log('\\n🎉 Test rubric setup complete!');
    console.log('The grading interface will now use this rubric for evaluation.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createTestRubric().catch(console.error);