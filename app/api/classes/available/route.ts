import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ClassDiscoveryService } from '@/lib/services/class-discovery';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId') || user.id;

    // Check if user can access the requested student's data
    if (studentId !== user.id) {
      const { data: userProfile } = await supabase
        .from('users')
        .select('role, institution_id')
        .eq('id', user.id)
        .single();

      const isAuthorized = userProfile?.role === 'institution_admin' || 
                          userProfile?.role === 'department_admin' ||
                          userProfile?.role === 'teacher';

      if (!isAuthorized) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const classDiscoveryService = new ClassDiscoveryService();
    const availableClasses = await classDiscoveryService.getAvailableClasses(studentId);

    return NextResponse.json({ classes: availableClasses });

  } catch (error) {
    console.error('Available classes error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available classes' },
      { status: 500 }
    );
  }
}