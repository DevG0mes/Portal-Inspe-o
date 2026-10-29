import { z } from 'zod';
import { ACTION_COMMANDS, ACTION_STATES, PRIORITIES } from '@portal/contracts';
import { validDate, occurrence } from '@portal/scheduling';
import { paginationShape, parseInput } from '../common/input.js';
const assignment = {
  responsibleId: z.uuid(),
  description: z.string().trim().min(5).max(5000),
  priority: z.enum(PRIORITIES),
  dueDate: z.string().refine(validDate),
};
export const parseActionCreate = (raw: unknown) =>
  parseInput(
    z.object({ sourceSubmissionId: z.uuid(), questionId: z.uuid(), ...assignment }).strict(),
    raw,
  );
export const parseActionCommand = (raw: unknown) =>
  parseInput(
    z
      .object({
        commandId: z.uuid(),
        revision: z.number().int().positive().max(2147483646),
        type: z.enum(ACTION_COMMANDS),
        text: z.string().trim().max(5000).optional(),
        responsibleId: assignment.responsibleId.optional(),
        description: assignment.description.optional(),
        priority: assignment.priority.optional(),
        dueDate: assignment.dueDate.optional(),
      })
      .strict(),
    raw,
  );
export const parseActionQuery = (raw: unknown) =>
  parseInput(
    z
      .object({
        ...paginationShape,
        state: z.enum(ACTION_STATES).optional(),
        overdue: z.enum(['true', 'false']).optional(),
      })
      .strict(),
    raw,
  );
export const parseHistoryQuery = (raw: unknown) =>
  parseInput(z.object({ ...paginationShape }).strict(), raw);
export function deadline(date: string) {
  return new Date(Date.parse(occurrence({ time: '23:59' }, date)) + 59999);
}
