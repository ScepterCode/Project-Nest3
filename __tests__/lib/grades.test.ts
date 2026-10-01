import { averagePercent, gradePercent, rubricGradePoints } from '@/lib/grades';

describe('gradePercent', () => {
  it('turns points earned into a percent of points possible', () => {
    expect(gradePercent(45, 50)).toBe(90);
    expect(gradePercent(150, 200)).toBe(75);
  });

  it('is null when ungraded or the assignment is worth nothing', () => {
    expect(gradePercent(null, 100)).toBeNull();
    expect(gradePercent(undefined, 100)).toBeNull();
    expect(gradePercent(0, 0)).toBeNull();
  });
});

describe('averagePercent', () => {
  it('weighs assignments by their points', () => {
    // 50/100 quiz + 200/200 project = 250/300, not the 75% a plain mean gives.
    expect(
      averagePercent([
        { grade: 50, pointsPossible: 100 },
        { grade: 200, pointsPossible: 200 },
      ])
    ).toBeCloseTo(83.333, 2);
  });

  it('ignores ungraded items and is null when nothing is graded', () => {
    expect(
      averagePercent([
        { grade: 40, pointsPossible: 50 },
        { grade: null, pointsPossible: 100 },
      ])
    ).toBe(80);
    expect(averagePercent([{ grade: null, pointsPossible: 100 }])).toBeNull();
    expect(averagePercent([])).toBeNull();
  });
});

describe('rubricGradePoints', () => {
  const criteria = [
    {
      id: 'a',
      weight: 50,
      levels: [{ points: 0 }, { points: 2 }, { points: 4 }],
    },
    { id: 'b', weight: 50, levels: [{ points: 1 }, { points: 10 }] },
  ];

  it('scales a rubric to the assignment points', () => {
    // a: 4/4, b: 10/10 -> full marks out of 150
    expect(rubricGradePoints(criteria, { a: 4, b: 10 }, 150)).toBe(150);
    // a: 2/4 (50%), b: 10/10 (100%), equal weights -> 75% of 200
    expect(rubricGradePoints(criteria, { a: 2, b: 10 }, 200)).toBe(150);
  });

  it('applies criterion weights', () => {
    const weighted = [
      { ...criteria[0]!, weight: 75 },
      { ...criteria[1]!, weight: 25 },
    ];
    // 0.75 * 100% + 0.25 * 10% = 77.5% of 100 -> 78
    expect(rubricGradePoints(weighted, { a: 4, b: 1 }, 100)).toBe(78);
  });

  it('accepts zero-point levels and treats missing weights as equal', () => {
    const unweighted = criteria.map(c => ({ ...c, weight: null }));
    expect(rubricGradePoints(unweighted, { a: 0, b: 10 }, 100)).toBe(50);
  });

  it('never exceeds points possible', () => {
    expect(rubricGradePoints(criteria, { a: 99, b: 99 }, 100)).toBe(100);
    expect(rubricGradePoints([], {}, 100)).toBe(0);
  });
});
