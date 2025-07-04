import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requireRole } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const user = await requireRole(['institution'])

    const supabase = createClient()

    const { data, error } = await supabase
      .from('submissions')
      .select('id, student_id, assignment_id, submitted_at')
      .in('student_id', supabase.from('users').select('id').eq('institution_id', user.institutionId))

    if (error) throw error

    const activities = data.map((submission: any) => ({
      id: submission.id,
      userId: submission.student_id,
      type: 'submission',
      description: `Submitted assignment ${submission.assignment_id}`,
      timestamp: submission.submitted_at,
    }))

    return NextResponse.json(activities)
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    console.error('Error fetching activities:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
