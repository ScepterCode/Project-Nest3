// Manual join utility to bypass PostgREST relationship cache issues
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function getTeacherAssignmentsWithSubmissions(teacherId: string) {
  try {
    // Get teacher's assignments
    const { data: assignments, error: assignmentsError } = await supabase
      .from('assignments')
      .select('*')
      .eq('teacher_id', teacherId);
      
    if (assignmentsError) throw assignmentsError;
    
    if (!assignments) return [];
    
    // Get submissions for each assignment with student info
    const assignmentsWithSubmissions = await Promise.all(
      assignments.map(async (assignment) => {
        const { data: submissions } = await supabase
          .from('submissions')
          .select('*')
          .eq('assignment_id', assignment.id);
          
        // Get student info for each submission
        const submissionsWithStudents = await Promise.all(
          (submissions || []).map(async (submission) => {
            const { data: student } = await supabase
              .from('users')
              .select('first_name, last_name, email')
              .eq('id', submission.student_id)
              .single();
              
            return {
              ...submission,
              student: student
            };
          })
        );
        
        return {
          ...assignment,
          submissions: submissionsWithStudents
        };
      })
    );
    
    return assignmentsWithSubmissions;
  } catch (error) {
    console.error('Error getting teacher assignments:', error);
    return [];
  }
}
expor
t async function getStudentAssignmentsWithGrades(studentId: string) {
  try {
    // Get student's enrollments
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('enrollments')
      .select('class_id')
      .eq('student_id', studentId);
      
    if (enrollmentsError) throw enrollmentsError;
    
    if (!enrollments) return [];
    
    const classIds = enrollments.map(e => e.class_id);
    
    // Get assignments from enrolled classes
    const { data: assignments, error: assignmentsError } = await supabase
      .from('assignments')
      .select('*')
      .in('class_id', classIds);
      
    if (assignmentsError) throw assignmentsError;
    
    if (!assignments) return [];
    
    // Get submissions for each assignment
    const assignmentsWithSubmissions = await Promise.all(
      assignments.map(async (assignment) => {
        const { data: submission } = await supabase
          .from('submissions')
          .select('*')
          .eq('assignment_id', assignment.id)
          .eq('student_id', studentId)
          .single();
          
        return {
          ...assignment,
          submission: submission
        };
      })
    );
    
    return assignmentsWithSubmissions;
  } catch (error) {
    console.error('Error getting student assignments:', error);
    return [];
  }
}expo
rt async function getStudentGrades(studentId: string) {
  try {
    // Get student's submissions with grades
    const { data: submissions, error: submissionsError } = await supabase
      .from('submissions')
      .select('*')
      .eq('student_id', studentId)
      .not('grade', 'is', null);
      
    if (submissionsError) throw submissionsError;
    
    if (!submissions) return [];
    
    // Get assignment info for each submission
    const gradesWithAssignments = await Promise.all(
      submissions.map(async (submission) => {
        const { data: assignment } = await supabase
          .from('assignments')
          .select('title, points, class_id')
          .eq('id', submission.assignment_id)
          .single();
          
        // Get class info
        const { data: classInfo } = await supabase
          .from('classes')
          .select('name')
          .eq('id', assignment?.class_id)
          .single();
          
        return {
          ...submission,
          assignment: assignment,
          class: classInfo
        };
      })
    );
    
    return gradesWithAssignments;
  } catch (error) {
    console.error('Error getting student grades:', error);
    return [];
  }
}