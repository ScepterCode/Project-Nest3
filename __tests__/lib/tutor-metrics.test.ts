import {
  toTutorMetrics,
  turnaroundText,
} from '@/components/delivery/tutor-metrics-table';

it.each([
  [null, '—'],
  [5.4, '5 h'],
  [47, '47 h'],
  [72, '3 days'],
  [84, '3.5 days'],
])('marking time %p -> %p', (hours, text) => {
  expect(turnaroundText(hours)).toBe(text);
});

it('turns database numbers into numbers and keeps missing values missing', () => {
  const t = toTutorMetrics({
    teacher_id: 't1',
    teacher_email: 't@x.test',
    classes: '2',
    students: '40',
    sessions_30d: '6',
    attendance_rate: '91.5',
    avg_turnaround_hours: null,
    feedback_rate: '80',
    missed_deadlines: '3',
    flags: ['overdue_reviews'],
  });
  expect([
    t.classes,
    t.students,
    t.sessions_30d,
    t.attendance_rate,
    t.avg_turnaround_hours,
    t.feedback_rate,
    t.missed_deadlines,
  ]).toEqual([2, 40, 6, 91.5, null, 80, 3]);
  expect(t.flags).toEqual(['overdue_reviews']);
  expect(
    toTutorMetrics({ teacher_id: 't2', teacher_email: 'x', flags: null }).flags
  ).toEqual([]);
});
