import type { ActionState, ActionCommandType } from '@portal/contracts';
export class TransitionError extends Error {}
export function transition(
  current: ActionState,
  command: { type: ActionCommandType; text?: string; evidenceCount?: number },
  actor: { canManage: boolean; isResponsible: boolean },
): ActionState {
  const allowed =
    command.type === 'ASSIGN'
      ? actor.canManage && ['OPEN', 'IN_PROGRESS'].includes(current)
      : command.type === 'START'
        ? actor.isResponsible && current === 'OPEN'
        : command.type === 'COMMENT'
          ? (actor.canManage || actor.isResponsible) && !!command.text?.trim()
          : command.type === 'REQUEST_VALIDATION'
            ? actor.isResponsible &&
              current === 'IN_PROGRESS' &&
              (command.evidenceCount ?? 0) > 0 &&
              (command.text?.trim().length ?? 0) >= 5
            : command.type === 'APPROVE'
              ? actor.canManage && current === 'AWAITING_VALIDATION'
              : command.type === 'RETURN'
                ? actor.canManage &&
                  current === 'AWAITING_VALIDATION' &&
                  (command.text?.trim().length ?? 0) >= 5
                : false;
  if (!allowed)
    throw new TransitionError('Operação não permitida neste estado ou com estes dados.');
  return command.type === 'START' || command.type === 'RETURN'
    ? 'IN_PROGRESS'
    : command.type === 'REQUEST_VALIDATION'
      ? 'AWAITING_VALIDATION'
      : command.type === 'APPROVE'
        ? 'COMPLETED'
        : current;
}
export function isOverdue(state: ActionState, dueAt: string, now = new Date()) {
  return state !== 'COMPLETED' && Date.parse(dueAt) < now.getTime();
}
