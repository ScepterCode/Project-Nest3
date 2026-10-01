// submissions.grade is points earned (0..assignments.points_possible).
// Percentages are derived here, never stored.

export interface GradedItem {
  grade: number | null | undefined;
  pointsPossible: number | null | undefined;
}

/** Percent for one grade, or null if it isn't graded or is worth 0 points. */
export function gradePercent(
  grade: number | null | undefined,
  pointsPossible: number | null | undefined
): number | null {
  if (grade === null || grade === undefined) return null;
  if (!pointsPossible || pointsPossible <= 0) return null;
  return (grade / pointsPossible) * 100;
}

/**
 * Overall percent across graded items: total points earned over total points
 * possible, so a 200-point project counts twice as much as a 100-point quiz.
 * Null when nothing is graded.
 */
export function averagePercent(items: GradedItem[]): number | null {
  let earned = 0;
  let possible = 0;
  for (const { grade, pointsPossible } of items) {
    if (grade === null || grade === undefined) continue;
    if (!pointsPossible || pointsPossible <= 0) continue;
    earned += grade;
    possible += pointsPossible;
  }
  return possible > 0 ? (earned / possible) * 100 : null;
}

export interface RubricCriterionForGrading {
  id: string;
  weight?: number | null;
  levels?: { points: number }[] | null;
}

/**
 * Points earned on an assignment graded with a rubric. Each criterion counts
 * as the share of its top level that was earned, weighted by the criterion
 * weights (equal when no weights are set), then scaled to points_possible.
 * So a 20-point rubric on a 100-point assignment gives a grade out of 100.
 */
export function rubricGradePoints(
  criteria: RubricCriterionForGrading[],
  scores: Record<string, number>,
  pointsPossible: number
): number {
  let weightedShare = 0;
  let totalWeight = 0;
  for (const criterion of criteria) {
    const max = Math.max(0, ...(criterion.levels ?? []).map(l => l.points));
    if (max <= 0) continue;
    const weight =
      criterion.weight && criterion.weight > 0 ? criterion.weight : 1;
    const earned = Math.min(Math.max(scores[criterion.id] ?? 0, 0), max);
    weightedShare += (earned / max) * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round((weightedShare / totalWeight) * pointsPossible);
}
