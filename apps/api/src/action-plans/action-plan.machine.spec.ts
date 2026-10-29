import { expect, it } from 'vitest';
import { transition, isOverdue } from './action-plan.machine.js';
const manager = { canManage: true, isResponsible: false };
const responsible = { canManage: false, isResponsible: true };
it('allows only the authorized corrective workflow and keeps lateness independent from state', () => {
  expect(transition('OPEN', { type: 'START' }, responsible)).toBe('IN_PROGRESS');
  expect(
    transition(
      'IN_PROGRESS',
      { type: 'REQUEST_VALIDATION', evidenceCount: 1, text: 'Proteção instalada' },
      responsible,
    ),
  ).toBe('AWAITING_VALIDATION');
  expect(transition('AWAITING_VALIDATION', { type: 'APPROVE' }, manager)).toBe('COMPLETED');
  expect(
    transition('AWAITING_VALIDATION', { type: 'RETURN', text: 'Conferir novamente' }, manager),
  ).toBe('IN_PROGRESS');
  expect(isOverdue('IN_PROGRESS', '2026-10-28T12:00:00Z', new Date('2026-10-29T12:00:00Z'))).toBe(
    true,
  );
  expect(isOverdue('COMPLETED', '2026-10-28T12:00:00Z', new Date('2026-10-29T12:00:00Z'))).toBe(
    false,
  );
});
it('rejects missing evidence, unlisted transitions, other actors and unreasoned returns', () => {
  for (const [state, command, actor] of [
    ['OPEN', { type: 'APPROVE' }, manager],
    ['OPEN', { type: 'START' }, manager],
    [
      'IN_PROGRESS',
      { type: 'REQUEST_VALIDATION', evidenceCount: 0, text: 'Concluído' },
      responsible,
    ],
    ['AWAITING_VALIDATION', { type: 'RETURN', text: '' }, manager],
    ['AWAITING_VALIDATION', { type: 'APPROVE' }, responsible],
    ['COMPLETED', { type: 'ASSIGN' }, manager],
  ] as const)
    expect(() => transition(state, command, actor)).toThrow();
  expect(
    transition('COMPLETED', { type: 'COMMENT', text: 'Registro posterior' }, responsible),
  ).toBe('COMPLETED');
});
