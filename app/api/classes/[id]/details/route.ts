import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ClassDiscoveryService } from '@/lib/services/class-discovery';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const classId = resolvedParams.id;
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId') || user.id;

    const classDiscoveryService = new ClassDiscoveryService();
    
    // Get class details
    const classDetails = await classDiscoveryService.getClassDetails(classId, studentId);
    
    if (!classDetails) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // Get enrollment eligibility for the student
    const eligibility = await classDiscoveryService.checkEnrollmentEligibility(studentId, classId);
    
    // Get enrollment statistics
    const statistics = await classDiscoveryService.getEnrollmentStatistics(classId);

    return NextResponse.json({
      class: classDetails,
      eligibility,
      statistics
    });

  } catch (error) {
    console.error('Class details error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch class details' },
      { status: 500 }
    );
  }
}