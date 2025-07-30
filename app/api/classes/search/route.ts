import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ClassDiscoveryService } from '@/lib/services/class-discovery';
import { ClassSearchCriteria, EnrollmentType } from '@/lib/types/enrollment';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    
    const criteria: ClassSearchCriteria = {
      query: searchParams.get('query') || undefined,
      departmentId: searchParams.get('departmentId') || undefined,
      instructorId: searchParams.get('instructorId') || undefined,
      semester: searchParams.get('semester') || undefined,
      enrollmentType: searchParams.get('enrollmentType') as EnrollmentType || undefined,
      hasAvailableSpots: searchParams.get('hasAvailableSpots') === 'true' || undefined,
      hasWaitlistSpots: searchParams.get('hasWaitlistSpots') === 'true' || undefined,
      credits: searchParams.get('credits') ? parseInt(searchParams.get('credits')!) : undefined,
      schedule: searchParams.get('schedule') || undefined,
      location: searchParams.get('location') || undefined,
      tags: searchParams.get('tags')?.split(',') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
      sortBy: searchParams.get('sortBy') as any || 'name',
      sortOrder: searchParams.get('sortOrder') as any || 'asc'
    };

    const classDiscoveryService = new ClassDiscoveryService();
    const result = await classDiscoveryService.searchClasses(criteria);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Class search error:', error);
    return NextResponse.json(
      { error: 'Failed to search classes' },
      { status: 500 }
    );
  }
}