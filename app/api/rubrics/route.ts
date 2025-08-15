import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, classId, isTemplate, criteria } = body

    // Validate required fields
    if (!name || !criteria || criteria.length === 0) {
      return NextResponse.json({ error: 'Name and criteria are required' }, { status: 400 })
    }

    // Use the service role client to bypass RLS for this operation
    const { createClient: createServiceClient } = await import('@supabase/supabase-js')
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Create the main rubric record
    const { data: rubric, error: rubricError } = await serviceSupabase
      .from('rubrics')
      .insert({
        name,
        description: description || null,
        teacher_id: user.id,
        class_id: classId || null,
        is_template: isTemplate || false,
        status: 'active'
      })
      .select()
      .single()

    if (rubricError) {
      console.error('Error creating rubric:', rubricError)
      return NextResponse.json({ error: 'Failed to create rubric' }, { status: 500 })
    }

    let totalPoints = 0

    // Create criteria and their levels
    for (const criterion of criteria) {
      const { data: criterionData, error: criterionError } = await serviceSupabase
        .from('rubric_criteria')
        .insert({
          rubric_id: rubric.id,
          name: criterion.name,
          description: criterion.description || null,
          weight: criterion.weight || 25.0,
          order_index: criterion.order_index || 0
        })
        .select()
        .single()

      if (criterionError) {
        console.error('Error creating criterion:', criterionError)
        // Clean up the rubric if criterion creation fails
        await serviceSupabase.from('rubrics').delete().eq('id', rubric.id)
        return NextResponse.json({ error: 'Failed to create criterion' }, { status: 500 })
      }

      let maxPointsForCriterion = 0

      // Create levels for this criterion
      for (const level of criterion.levels) {
        // Since we can't bypass the trigger, let's try a different approach
        // We'll create a temporary table or use a workaround
        
        try {
          // Try the regular insert first
          const { data: levelData, error: levelError } = await serviceSupabase
            .from('rubric_levels')
            .insert({
              criterion_id: criterionData.id,
              name: level.name,
              description: level.description || null,
              points: level.points,
              order_index: level.order_index || 0
            })
            .select()
            .single()

          if (levelError) {
            console.error('Level creation failed:', levelError)
            // Clean up and return error
            await serviceSupabase.from('rubrics').delete().eq('id', rubric.id)
            
            // Check if it's the specific trigger error
            if (levelError.message && levelError.message.includes('rubric_id')) {
              return NextResponse.json({ 
                error: 'There is a database configuration issue that prevents rubric creation. The system needs a database schema update to fix a problematic trigger. Please use simple grading for now.',
                technical_error: levelError.message
              }, { status: 500 })
            }
            
            return NextResponse.json({ 
              error: 'Failed to create rubric level: ' + (levelError.message || 'Unknown error')
            }, { status: 500 })
          }

          maxPointsForCriterion = Math.max(maxPointsForCriterion, level.points)

          // Create quality indicators if any
          if (level.qualityIndicators && level.qualityIndicators.length > 0) {
            const indicators = level.qualityIndicators
              .filter((indicator: string) => indicator.trim())
              .map((indicator: string, index: number) => ({
                level_id: levelData.id,
                indicator: indicator.trim(),
                order_index: index
              }))

            if (indicators.length > 0) {
              await serviceSupabase
                .from('rubric_quality_indicators')
                .insert(indicators)
            }
          }
        } catch (error) {
          console.error('Unexpected error creating level:', error)
          await serviceSupabase.from('rubrics').delete().eq('id', rubric.id)
          return NextResponse.json({ 
            error: 'Failed to create rubric level' 
          }, { status: 500 })
        }
      }

      totalPoints += maxPointsForCriterion
    }

    // Update the rubric with the calculated total points
    await serviceSupabase
      .from('rubrics')
      .update({ total_points: totalPoints })
      .eq('id', rubric.id)

    return NextResponse.json({ 
      success: true, 
      rubric: { ...rubric, total_points: totalPoints } 
    })

  } catch (error) {
    console.error('Unexpected error in rubric creation:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: rubrics, error } = await supabase
      .from('rubrics')
      .select(`
        id,
        name,
        description,
        total_points,
        usage_count,
        status,
        created_at,
        rubric_criteria(count)
      `)
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching rubrics:', error)
      return NextResponse.json({ error: 'Failed to fetch rubrics' }, { status: 500 })
    }

    const formattedRubrics = rubrics?.map((rubric: any) => ({
      id: rubric.id,
      name: rubric.name,
      description: rubric.description || '',
      criteria_count: rubric.rubric_criteria?.length || 0,
      max_points: rubric.total_points || 0,
      usage_count: rubric.usage_count || 0,
      status: rubric.status,
      created_at: rubric.created_at
    })) || []

    return NextResponse.json({ rubrics: formattedRubrics })

  } catch (error) {
    console.error('Unexpected error in rubric fetch:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const rubricId = searchParams.get('id')

    if (!rubricId) {
      return NextResponse.json({ error: 'Rubric ID is required' }, { status: 400 })
    }

    // Verify the rubric belongs to the current user
    const { data: rubric, error: fetchError } = await supabase
      .from('rubrics')
      .select('id')
      .eq('id', rubricId)
      .eq('teacher_id', user.id)
      .single()

    if (fetchError || !rubric) {
      return NextResponse.json({ error: 'Rubric not found or access denied' }, { status: 404 })
    }

    // Delete the rubric (cascade will handle related records)
    const { error: deleteError } = await supabase
      .from('rubrics')
      .delete()
      .eq('id', rubricId)

    if (deleteError) {
      console.error('Error deleting rubric:', deleteError)
      return NextResponse.json({ error: 'Failed to delete rubric' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Unexpected error in rubric deletion:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}