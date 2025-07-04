import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requireRole } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const user = await requireRole(['institution'])

    const supabase = createClient()

    const [{ count: totalTeachers }, { count: totalStudents }, { count: activeClasses }, { count: completedAssignments }] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('institution_id', user.institutionId).eq('role', 'teacher'),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('institution_id', user.institutionId).eq('role', 'student'),
      supabase.from('classes').select('id', { count: 'exact', head: true }).eq('institution_id', user.institutionId).eq('settings->>isArchived', false),
      supabase.from('submissions').select('id', { count: 'exact', head: true }).in('status', ['graded', 'returned']).in('student_id', supabase.from('users').select('id').eq('institution_id', user.institutionId)),
    ])

    const reportData = {
      reportName: 'Institution Activity Summary',
      institutionId: user.institutionId,
      generatedAt: new Date().toISOString(),
      summary: {
        totalTeachers: totalTeachers || 0,
        totalStudents: totalStudents || 0,
        activeClasses: activeClasses || 0,
        completedAssignments: completedAssignments || 0,
      },
      details: [], // Details would require more complex queries, leaving empty for now
    }

    // You might also set Content-Disposition header for file download
    // response.headers.set('Content-Disposition', 'attachment; filename="report.json"')

    return NextResponse.json(reportData)
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    console.error('Error generating report:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
