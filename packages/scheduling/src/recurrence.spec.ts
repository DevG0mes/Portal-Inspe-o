import { expect, it } from 'vitest';
import { occurrence, nextOccurrence, assignmentState } from './index.js';
const rule = { frequency: 'DAILY' as const, startDate: '2026-10-28', time: '08:00', endDate: null };
it('uses the Sao Paulo calendar and real elapsed deadline hours', () => {
  expect(occurrence(rule, '2026-10-28')).toBe('2026-10-28T11:00:00.000Z');
  expect(
    assignmentState(
      '2026-10-28T11:00:00Z',
      '2026-10-28T13:00:00Z',
      new Date('2026-10-28T10:00:00Z'),
    ),
  ).toBe('UPCOMING');
  expect(
    assignmentState(
      '2026-10-28T11:00:00Z',
      '2026-10-28T13:00:00Z',
      new Date('2026-10-28T13:00:01Z'),
    ),
  ).toBe('OVERDUE');
});
it('handles once, daily, weekly and inclusive validity', () => {
  expect(nextOccurrence({ ...rule, frequency: 'ONCE' }, '2026-10-28T11:00:00Z')).toBeNull();
  expect(nextOccurrence(rule, '2026-10-28T11:00:00Z')).toBe('2026-10-29T11:00:00.000Z');
  expect(nextOccurrence({ ...rule, frequency: 'WEEKLY' }, '2026-10-28T11:00:00Z')).toBe(
    '2026-11-04T11:00:00.000Z',
  );
  expect(nextOccurrence({ ...rule, endDate: '2026-10-28' }, '2026-10-28T11:00:00Z')).toBeNull();
});
it('clamps monthly occurrences to month end without drifting the original day', () => {
  const monthly = { ...rule, frequency: 'MONTHLY' as const, startDate: '2028-01-31' };
  expect(nextOccurrence(monthly, '2028-01-31T11:00:00Z')).toBe('2028-02-29T11:00:00.000Z');
  expect(nextOccurrence(monthly, '2028-02-29T11:00:00Z')).toBe('2028-03-31T11:00:00.000Z');
});
it('rejects nonexistent local hours and invalid dates', () => {
  expect(() => occurrence({ ...rule, time: '00:30' }, '2018-11-04')).toThrow();
  expect(() => occurrence(rule, '2026-02-30')).toThrow();
});
it('skips an unavailable repeated local hour without changing the recurrence anchor', () => {
  expect(
    nextOccurrence(
      { frequency: 'DAILY', startDate: '2018-11-03', time: '00:30', endDate: null },
      '2018-11-03T03:30:00Z',
    ),
  ).toBe('2018-11-05T02:30:00.000Z');
});
