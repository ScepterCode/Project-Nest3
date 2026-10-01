import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

interface LevelInput {
  name: string;
  description?: string;
  points: number;
  qualityIndicators?: string[];
}

interface CriterionInput {
  name: string;
  description?: string;
  weight?: number;
  levels: LevelInput[];
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, classId, isTemplate } = body;
    const criteria: CriterionInput[] = Array.isArray(body.criteria)
      ? body.criteria
      : [];

    if (!name?.trim() || criteria.length === 0) {
      return NextResponse.json(
        { error: 'Name and criteria are required' },
        { status: 400 }
      );
    }
    for (const criterion of criteria) {
      if (
        !criterion.name?.trim() ||
        !Array.isArray(criterion.levels) ||
        criterion.levels.length < 2
      ) {
        return NextResponse.json(
          { error: 'Every criterion needs a name and at least 2 levels' },
          { status: 400 }
        );
      }
      for (const level of criterion.levels) {
        if (
          !level.name?.trim() ||
          !Number.isInteger(level.points) ||
          level.points < 0
        ) {
          return NextResponse.json(
            { error: 'Every level needs a name and a whole number of points' },
            { status: 400 }
          );
        }
      }
    }

    // RLS lets teachers write their own rubrics, criteria and levels, so this
    // runs as the signed-in user. If any step fails, the rubric is deleted and
    // its criteria/levels go with it (ON DELETE CASCADE).
    const { data: rubric, error: rubricError } = await supabase
      .from('rubrics')
      .insert({
        name: name.trim(),
        description: description || null,
        teacher_id: user.id,
        class_id: classId || null,
        is_template: !!isTemplate,
        status: 'active',
      })
      .select()
      .single();

    if (rubricError || !rubric) {
      console.error('Error creating rubric:', rubricError);
      return NextResponse.json(
        { error: 'Failed to create rubric' },
        { status: 500 }
      );
    }

    const fail = async (message: string, cause: unknown) => {
      console.error(message, cause);
      await supabase.from('rubrics').delete().eq('id', rubric.id);
      return NextResponse.json({ error: message }, { status: 500 });
    };

    for (const [criterionIndex, criterion] of criteria.entries()) {
      const { data: criterionRow, error: criterionError } = await supabase
        .from('rubric_criteria')
        .insert({
          rubric_id: rubric.id,
          name: criterion.name.trim(),
          description: criterion.description || null,
          weight: criterion.weight ?? 25,
          order_index: criterionIndex,
        })
        .select('id')
        .single();
      if (criterionError || !criterionRow) {
        return fail('Failed to create rubric criterion', criterionError);
      }

      const { data: levelRows, error: levelError } = await supabase
        .from('rubric_levels')
        .insert(
          criterion.levels.map((level, levelIndex) => ({
            criterion_id: criterionRow.id,
            name: level.name.trim(),
            description: level.description || null,
            points: level.points,
            order_index: levelIndex,
          }))
        )
        .select('id, order_index');
      if (levelError || !levelRows) {
        return fail('Failed to create rubric levels', levelError);
      }

      const indicators = levelRows.flatMap(row =>
        (criterion.levels[row.order_index ?? 0]?.qualityIndicators ?? [])
          .map(indicator => indicator.trim())
          .filter(Boolean)
          .map((indicator, index) => ({
            level_id: row.id,
            indicator,
            order_index: index,
          }))
      );
      if (indicators.length > 0) {
        const { error: indicatorError } = await supabase
          .from('rubric_quality_indicators')
          .insert(indicators);
        if (indicatorError) {
          return fail('Failed to save quality indicators', indicatorError);
        }
      }
    }

    // total_points is maintained by a trigger on criteria/levels.
    const { data: saved } = await supabase
      .from('rubrics')
      .select('*')
      .eq('id', rubric.id)
      .single();

    return NextResponse.json({ success: true, rubric: saved ?? rubric });
  } catch (error) {
    console.error('Unexpected error in rubric creation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = await createClient();

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: rubrics, error } = await supabase
      .from('rubrics')
      .select(
        `
        id,
        name,
        description,
        total_points,
        usage_count,
        status,
        created_at,
        rubric_criteria(count)
      `
      )
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching rubrics:', error);
      return NextResponse.json(
        { error: 'Failed to fetch rubrics' },
        { status: 500 }
      );
    }

    const formattedRubrics =
      rubrics?.map((rubric: any) => ({
        id: rubric.id,
        name: rubric.name,
        description: rubric.description || '',
        criteria_count: rubric.rubric_criteria?.[0]?.count ?? 0,
        max_points: rubric.total_points || 0,
        usage_count: rubric.usage_count || 0,
        status: rubric.status,
        created_at: rubric.created_at,
      })) || [];

    return NextResponse.json({ rubrics: formattedRubrics });
  } catch (error) {
    console.error('Unexpected error in rubric fetch:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rubricId = searchParams.get('id');

    if (!rubricId) {
      return NextResponse.json(
        { error: 'Rubric ID is required' },
        { status: 400 }
      );
    }

    // Verify the rubric belongs to the current user
    const { data: rubric, error: fetchError } = await supabase
      .from('rubrics')
      .select('id')
      .eq('id', rubricId)
      .eq('teacher_id', user.id)
      .single();

    if (fetchError || !rubric) {
      return NextResponse.json(
        { error: 'Rubric not found or access denied' },
        { status: 404 }
      );
    }

    // Delete the rubric (cascade will handle related records)
    const { error: deleteError } = await supabase
      .from('rubrics')
      .delete()
      .eq('id', rubricId);

    if (deleteError) {
      console.error('Error deleting rubric:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete rubric' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in rubric deletion:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
