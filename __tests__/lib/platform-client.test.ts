import { isQuiet, sinceText, toSchool } from '@/lib/platform/client';

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString();

describe('sinceText', () => {
  it.each([
    [null, 'never'],
    [daysAgo(0), 'today'],
    [daysAgo(1), 'yesterday'],
    [daysAgo(9), '9 days ago'],
  ])('%s -> %s', (value, expected) => {
    expect(sinceText(value)).toBe(expected);
  });
});

describe('isQuiet', () => {
  it('flags active schools with no activity in 14 days, or none at all', () => {
    expect(isQuiet({ status: 'active', last_activity: daysAgo(20) })).toBe(
      true
    );
    expect(isQuiet({ status: 'active', last_activity: null })).toBe(true);
    expect(isQuiet({ status: 'active', last_activity: daysAgo(3) })).toBe(
      false
    );
  });

  it('ignores suspended schools', () => {
    expect(isQuiet({ status: 'inactive', last_activity: null })).toBe(false);
  });
});

it('turns numeric strings from the database into numbers', () => {
  const school = toSchool({
    id: 's1',
    name: 'Alpha',
    teachers: '3',
    students: '40',
    classes: '5',
    assignments: '12',
    submissions: '300',
    submission_rate: '62.5',
    average_grade: null,
  });
  expect([
    school.teachers,
    school.students,
    school.submission_rate,
    school.average_grade,
  ]).toEqual([3, 40, 62.5, null]);
});
