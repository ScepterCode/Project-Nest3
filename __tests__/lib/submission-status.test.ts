import {
  statusBadgeVariant,
  statusLabel,
  studentCanEdit,
} from '@/lib/submission-status';

it.each([
  ['draft', 'Draft', 'outline'],
  ['submitted', 'Submitted', 'secondary'],
  ['revision_requested', 'Changes requested', 'destructive'],
  ['graded', 'Graded', 'default'],
  [null, 'Not submitted', 'outline'],
])('%s -> %s (%s)', (status, label, variant) => {
  expect(statusLabel(status)).toBe(label);
  expect(statusBadgeVariant(status)).toBe(variant);
});

it('lets students edit until their work is graded', () => {
  expect(studentCanEdit('submitted')).toBe(true);
  expect(studentCanEdit('revision_requested')).toBe(true);
  expect(studentCanEdit('graded')).toBe(false);
});
