import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ClassInfo } from '@/lib/types/onboarding';

interface ClassJoinRequest {
  classCode: string;
  userId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ClassJoinRequest = await request.json();
    
    if (!body.classCode || !body.userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Class code and user ID are required' 
      }, { status: 400 });
    }

    const classCode = body.classCode.toUpperCase().trim();
    
    if (classCode.length < 4 || classCode.length > 10) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid class code format' 
      }, { status: 400 });
    }

    const supabase = createClient();
    
    // Get the current user to ensure they're authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user || user.id !== body.userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // Find the class by code
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select(`
        id,
        name,
        code,
        description,
        teacher_id,
        institution_id,
        department_id,
        is_active,
        created_at,
        updated_at,
        teacher:teacher_id(
          first_name,
          last_name,
          email
        ),
        enrollments:class_enrollments(count)
      `)
      .eq('code', classCode)
      .eq('is_active', true)
      .single();

    if (classError || !classData) {
      return NextResponse.json({ 
        success: false, 
        error: 'Class not found or inactive. Please check the class code and try again.' 
      }, { status: 404 });
    }

    // Check if user is already enrolled
    const { data: existingEnrollment } = await supabase
      .from('class_enrollments')
      .select('id')
      .eq('class_id', classData.id)
      .eq('user_id', body.userId)
      .single();

    if (existingEnrollment) {
      return NextResponse.json({ 
        success: false, 
        error: 'You are already enrolled in this class' 
      }, { status: 409 });
    }

    // Check if the class has enrollment restrictions
    const { data: classSettings } = await supabase
      .from('class_settings')
      .select('max_students, enrollment_deadline, requires_approval')
      .eq('class_id', classData.id)
      .single();

    // Check enrollment deadline
    if (classSettings?.enrollment_deadline) {
      const deadline = new Date(classSettings.enrollment_deadline);
      if (new Date() > deadline) {
        return NextResponse.json({ 
          success: false, 
          error: 'Enrollment deadline has passed for this class' 
        }, { status: 403 });
      }
    }

    // Check class capacity
    if (classSettings?.max_students) {
      const currentEnrollments = classData.enrollments?.[0]?.count || 0;
      if (currentEnrollments >= classSettings.max_students) {
        return NextResponse.json({ 
          success: false, 
          error: 'This class is full. Contact your teacher for assistance.' 
        }, { status: 403 });
      }
    }

    // Enroll the user in the class
    const { error: enrollmentError } = await supabase
      .from('class_enrollments')
      .insert([{
        class_id: classData.id,
        user_id: body.userId,
        enrolled_at: new Date().toISOString(),
        status: classSettings?.requires_approval ? 'pending' : 'active'
      }]);

    if (enrollmentError) {
      console.error('Enrollment error:', enrollmentError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to join class. Please try again.' 
      }, { status: 500 });
    }

    // Transform the data to match our interface
    const classInfo: ClassInfo = {
      id: classData.id,
      name: classData.name,
      code: classData.code,
      description: classData.description,
      teacherName: classData.teacher 
        ? `${classData.teacher.first_name || ''} ${classData.teacher.last_name || ''}`.trim()
        : 'Unknown Teacher',
      teacherId: classData.teacher_id,
      institutionId: classData.institution_id,
      departmentId: classData.department_id,
      studentCount: (classData.enrollments?.[0]?.count || 0) + 1, // Add 1 for the new enrollment
      isActive: classData.is_active,
      createdAt: new Date(classData.created_at),
      updatedAt: new Date(classData.updated_at)
    };

    const message = classSettings?.requires_approval 
      ? 'Your enrollment request has been submitted and is pending teacher approval.'
      : 'Successfully joined the class!';

    return NextResponse.json({
      success: true,
      data: {
        class: classInfo
      },
      message
    });

  } catch (error) {
    console.error('Class join API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}