import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

interface JoinClassRequest {
  classCode: string;
  userId?: string;
}

export async function POST(request: NextRequest) {
  try {
    console.log('Join class API called');
    
    const supabase = createClient();
    
    // Get auth header for user identification
    const authHeader = request.headers.get('authorization');
    console.log('Auth header present:', !!authHeader);
    
    // For now, we'll get user from the request body since client-side auth is tricky in API routes
    // In a real app, you'd want proper server-side auth
    
    // Parse request body first
    let body: JoinClassRequest & { userId?: string };
    try {
      body = await request.json();
      console.log('Request body parsed:', { classCode: body.classCode, hasUserId: !!body.userId });
    } catch (error) {
      console.error('JSON parse error:', error);
      return NextResponse.json(
        { 
          error: 'Invalid JSON',
          message: 'Request body must be valid JSON'
        },
        { status: 400 }
      );
    }

    // For now, we'll trust the client to send the user ID
    // In production, you'd want proper server-side authentication
    if (!body.userId) {
      return NextResponse.json(
        { 
          error: 'Unauthorized',
          message: 'User ID required'
        },
        { status: 401 }
      );
    }

    const user = { id: body.userId };

    const { classCode } = body;

    // Validate class code
    if (!classCode || typeof classCode !== 'string' || classCode.trim().length === 0) {
      return NextResponse.json(
        { 
          error: 'Invalid class code',
          message: 'Class code is required and must be a non-empty string'
        },
        { status: 400 }
      );
    }

    // Clean the class code (remove spaces, convert to uppercase)
    const cleanCode = classCode.replace(/\s+/g, '').toUpperCase();

    // Find the class by code
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select(`
        id,
        name,
        description,
        teacher_id,
        status,
        enrollment_count,
        max_enrollment,
        users!classes_teacher_id_fkey(
          first_name,
          last_name,
          email
        )
      `)
      .eq('code', cleanCode)
      .eq('status', 'active')
      .single();

    if (classError || !classData) {
      return NextResponse.json(
        { 
          error: 'Class not found',
          message: 'No active class found with the provided code'
        },
        { status: 404 }
      );
    }

    // Check if student is already enrolled
    const { data: existingEnrollment, error: enrollmentCheckError } = await supabase
      .from('enrollments')
      .select('id, status')
      .eq('class_id', classData.id)
      .eq('student_id', user.id)
      .single();

    if (enrollmentCheckError && enrollmentCheckError.code !== 'PGRST116') {
      console.error('Error checking existing enrollment:', enrollmentCheckError);
      return NextResponse.json(
        { 
          error: 'Database error',
          message: 'Failed to check enrollment status'
        },
        { status: 500 }
      );
    }

    if (existingEnrollment) {
      if (existingEnrollment.status === 'enrolled') {
        return NextResponse.json(
          { 
            error: 'Already enrolled',
            message: 'You are already enrolled in this class'
          },
          { status: 409 }
        );
      } else if (existingEnrollment.status === 'dropped') {
        // Re-enroll the student
        const { error: updateError } = await supabase
          .from('enrollments')
          .update({ 
            status: 'enrolled',
            enrolled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingEnrollment.id);

        if (updateError) {
          console.error('Error re-enrolling student:', updateError);
          return NextResponse.json(
            { 
              error: 'Enrollment failed',
              message: 'Failed to re-enroll in the class'
            },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: 'Successfully re-enrolled in the class',
          data: {
            classId: classData.id,
            className: classData.name,
            teacherName: classData.users ? `${classData.users.first_name} ${classData.users.last_name}` : 'Unknown Teacher'
          }
        });
      }
    }

    // Check class capacity if max_enrollment is set
    if (classData.max_enrollment && classData.enrollment_count >= classData.max_enrollment) {
      return NextResponse.json(
        { 
          error: 'Class full',
          message: 'This class has reached its maximum enrollment capacity'
        },
        { status: 409 }
      );
    }

    // Check if user is a teacher (teachers shouldn't enroll as students)
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profileError && userProfile?.role === 'teacher') {
      return NextResponse.json(
        { 
          error: 'Invalid enrollment',
          message: 'Teachers cannot enroll as students in classes'
        },
        { status: 403 }
      );
    }

    // Enroll the student
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('enrollments')
      .insert({
        class_id: classData.id,
        student_id: user.id,
        status: 'enrolled',
        enrolled_at: new Date().toISOString()
      })
      .select()
      .single();

    if (enrollmentError) {
      console.error('Error enrolling student:', enrollmentError);
      return NextResponse.json(
        { 
          error: 'Enrollment failed',
          message: 'Failed to enroll in the class. Please try again.'
        },
        { status: 500 }
      );
    }

    // Create success notification
    try {
      await fetch(`${request.nextUrl.origin}/api/notifications/create`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': request.headers.get('Authorization') || ''
        },
        body: JSON.stringify({
          type: 'enrollment_approved',
          title: 'Successfully Enrolled in Class',
          message: `You have been enrolled in "${classData.name}" taught by ${classData.users ? `${classData.users.first_name} ${classData.users.last_name}` : 'your teacher'}.`,
          priority: 'medium',
          action_url: `/dashboard/student/classes`,
          action_label: 'View Classes',
          metadata: {
            class_id: classData.id,
            class_name: classData.name,
            enrollment_id: enrollment.id
          }
        })
      });
    } catch (notificationError) {
      console.warn('Failed to create enrollment notification:', notificationError);
      // Don't fail the enrollment if notification fails
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully enrolled in the class',
      data: {
        enrollmentId: enrollment.id,
        classId: classData.id,
        className: classData.name,
        classDescription: classData.description,
        teacherName: classData.users ? `${classData.users.first_name} ${classData.users.last_name}` : 'Unknown Teacher',
        enrolledAt: enrollment.enrolled_at
      }
    });

  } catch (error) {
    console.error('Join class error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'An unexpected error occurred while joining the class',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { 
      error: 'Method not allowed',
      message: 'GET method is not supported for this endpoint. Use POST to join a class.'
    },
    { status: 405 }
  );
}