import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { TeacherRosterService } from '@/lib/services/teacher-roster';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const classId = params.id;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';
    const includeDropped = searchParams.get('includeDropped') === 'true';

    // Check if user has permission to export class roster
    const { data: classData } = await supabase
      .from('classes')
      .select('teacher_id, institution_id, name')
      .eq('id', classId)
      .single();

    if (!classData) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    const isTeacher = classData.teacher_id === user.id;
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    const isAdmin = userProfile?.role === 'institution_admin' && 
                   userProfile?.institution_id === classData.institution_id;

    if (!isTeacher && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rosterService = new TeacherRosterService();
    const exportData = await rosterService.exportRoster(classId, {
      format: format as 'csv' | 'xlsx' | 'json',
      includeDropped
    });

    // Set appropriate headers based on format
    const headers: Record<string, string> = {
      'Content-Disposition': `attachment; filename="${classData.name}_roster.${format}"`
    };

    switch (format) {
      case 'csv':
        headers['Content-Type'] = 'text/csv';
        break;
      case 'xlsx':
        headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      case 'json':
        headers['Content-Type'] = 'application/json';
        break;
      default:
        headers['Content-Type'] = 'text/plain';
    }

    return new NextResponse(exportData, { headers });

  } catch (error) {
    console.error('Export roster error:', error);
    return NextResponse.json(
      { error: 'Failed to export roster' },
      { status: 500 }
    );
  }
}