import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  const { submissionId, grade, feedback } = await req.json()

  try {
    // In a real application, you would also verify the user's role (e.g., teacher)
    // and that they are authorized to grade this specific assignment.

    const { data, error } = await supabaseAdmin
      .from('submissions')
      .update({ grade, feedback, status: 'graded', graded_at: new Date().toISOString() })
      .eq('id', submissionId)

    if (error) {
      console.error('Error grading submission:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Submission graded successfully', data })
  } catch (error: any) {
    console.error('Error grading submission:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
