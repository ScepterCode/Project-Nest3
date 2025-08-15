import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const resolvedParams = await params
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { rubric } = body

    // Validate rubric data
    if (!rubric || !rubric.name || !rubric.criteria || rubric.criteria.length === 0) {
      return NextResponse.json({ error: 'Invalid rubric data' }, { status: 400 })
    }

    // Verify the assignment belongs to the current user
    const { data: assignment, error: fetchError } = await supabase
      .from('assignments')
      .select('id, teacher_id')
      .eq('id', resolvedParams.id)
      .eq('teacher_id', user.id)
      .single()

    if (fetchError || !assignment) {
      return NextResponse.json({ error: 'Assignment not found or access denied' }, { status: 404 })
    }

    // Update the assignment with the rubric
    const { error: updateError } = await supabase
      .from('assignments')
      .update({ rubric })
      .eq('id', resolvedParams.id)

    if (updateError) {
      console.error('Error updating assignment with rubric:', updateError)
      return NextResponse.json({ error: 'Failed to add rubric to assignment' }, { status: 500 })
    }

    return NextResponse.json({ success: true, rubric })

  } catch (error) {
    console.error('Unexpected error in rubric assignment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const resolvedParams = await params
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify the assignment belongs to the current user
    const { data: assignment, error: fetchError } = await supabase
      .from('assignments')
      .select('id, teacher_id')
      .eq('id', resolvedParams.id)
      .eq('teacher_id', user.id)
      .single()

    if (fetchError || !assignment) {
      return NextResponse.json({ error: 'Assignment not found or access denied' }, { status: 404 })
    }

    // Remove the rubric from the assignment
    const { error: updateError } = await supabase
      .from('assignments')
      .update({ rubric: null })
      .eq('id', resolvedParams.id)

    if (updateError) {
      console.error('Error removing rubric from assignment:', updateError)
      return NextResponse.json({ error: 'Failed to remove rubric from assignment' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Unexpected error in rubric removal:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}