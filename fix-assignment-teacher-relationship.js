const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixAssignmentTeacherRelationship() {
  console.log('🔧 Fixing assignment-teacher relationship...\n');
  
  try {
    // Get users
    const { data: users } = await supabase.from('users').select('*');
    const teacher = users?.find(u => u.role === 'teacher');
    
    if (!teacher) {
      console.log('❌ No teacher found');
      return;
    }
    
    console.log(`Teacher: ${teacher.email} (${teacher.id})\n`);
    
    // 1. Check current assignments and their created_by field
    console.log('1. Checking Assignment Created_By Fields:');
    const { data: allAssignments } = await supabase
      .from('assignments')
      .select('*');
      
    console.log(`Total assignments: ${allAssignments?.length || 0}`);
    
    if (allAssignments) {
      for (const assignment of allAssignments) {
        console.log(`- ${assignment.title}: created_by = ${assignment.created_by || 'NULL'}`);
        
        // If created_by is null, update it based on the class teacher
        if (!assignment.created_by) {
          const { data: assignmentClass } = await supabase
            .from('classes')
            .select('teacher_id')
            .eq('id', assignment.class_id)
            .single();
            
          if (assignmentClass) {
            console.log(`  Updating created_by to ${assignmentClass.teacher_id}...`);
            
            const { error: updateError } = await supabase
              .from('assignments')
              .update({ created_by: assignmentClass.teacher_id })
              .eq('id', assignment.id);
              
            if (updateError) {
              console.log(`  ❌ Error updating: ${updateError.message}`);
            } else {
              console.log(`  ✅ Updated successfully`);
            }
          }
        }
      }
    }
    
    // 2. Test teacher assignments query again
    console.log('\n2. Testing Teacher Assignments Query:');
    const { data: teacherAssignments } = await supabase
      .from('assignments')
      .select('*')
      .eq('created_by', teacher.id);
      
    console.log(`Teacher assignments: ${teacherAssignments?.length || 0}`);
    
    // Alternative query: get assignments from teacher's classes
    console.log('\n3. Alternative Query - Assignments from Teacher Classes:');
    const { data: teacherClasses } = await supabase
      .from('classes')
      .select('id')
      .eq('teacher_id', teacher.id);
      
    if (teacherClasses) {
      const classIds = teacherClasses.map(c => c.id);
      const { data: classAssignments } = await supabase
        .from('assignments')
        .select('*')
        .in('class_id', classIds);
        
      console.log(`Assignments from teacher's classes: ${classAssignments?.length || 0}`);
      
      if (classAssignments) {
        for (const assignment of classAssignments) {
          console.log(`- ${assignment.title} (Class ID: ${assignment.class_id})`);
        }
      }
    }
    
    // 4. Fix notification type constraint
    console.log('\n4. Checking Notification Types:');
    
    // Check what notification types are allowed
    const { data: notificationTypes, error: ntError } = await supabase
      .from('notifications')
      .select('type')
      .limit(5);
      
    if (ntError) {
      console.log('❌ Error checking notification types:', ntError.message);
    } else {
      console.log('Existing notification types:', notificationTypes?.map(n => n.type));
    }
    
    // Try creating notification with different types
    const validTypes = ['assignment', 'grade_update', 'announcement', 'reminder'];
    
    for (const type of validTypes) {
      console.log(`Testing notification type: ${type}`);
      
      const { data: testNotification, error: testError } = await supabase
        .from('notifications')
        .insert({
          user_id: teacher.id,
          title: 'Test Notification',
          message: `Testing ${type} notification type`,
          type: type,
          is_read: false
        })
        .select()
        .single();
        
      if (testError) {
        console.log(`❌ ${type}: ${testError.message}`);
      } else {
        console.log(`✅ ${type}: Works`);
        
        // Clean up test notification
        await supabase
          .from('notifications')
          .delete()
          .eq('id', testNotification.id);
      }
    }
    
    // 5. Test complete workflow with fixed relationships
    console.log('\n5. Testing Complete Workflow:');
    
    const student = users?.find(u => u.role === 'student');
    if (student) {
      // Get student submissions with assignment info
      const { data: submissions } = await supabase
        .from('submissions')
        .select('*')
        .eq('student_id', student.id);
        
      console.log(`Student submissions: ${submissions?.length || 0}`);
      
      if (submissions) {
        for (const submission of submissions) {
          // Get assignment info
          const { data: assignment } = await supabase
            .from('assignments')
            .select('title, class_id, created_by')
            .eq('id', submission.assignment_id)
            .single();
            
          // Get class info
          const { data: classInfo } = await supabase
            .from('classes')
            .select('name, teacher_id')
            .eq('id', assignment?.class_id)
            .single();
            
          console.log(`- Submission: ${assignment?.title}`);
          console.log(`  Class: ${classInfo?.name}`);
          console.log(`  Teacher: ${classInfo?.teacher_id === teacher.id ? 'MATCH' : 'NO MATCH'}`);
          console.log(`  Created by: ${assignment?.created_by === teacher.id ? 'MATCH' : 'NO MATCH'}`);
        }
      }
    }
    
    console.log('\n🎉 Assignment-Teacher relationship analysis complete!');
    
  } catch (error) {
    console.error('❌ Fix error:', error);
  }
}

fixAssignmentTeacherRelationship().catch(console.error);