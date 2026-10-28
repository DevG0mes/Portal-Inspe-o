import { z } from 'zod';
import { FREQUENCIES } from '@portal/contracts';
import { validDate } from '@portal/scheduling';
import { paginationShape, searchQuery, activeQuery, parseInput } from '../common/input.js';
const date = z.string().refine(validDate);
const revision = z.number().int().positive().max(2147483646);
export const parseCreateSchedule = (raw: unknown) =>
  parseInput(
    z
      .object({
        name: z.string().trim().min(1).max(160),
        unitId: z.uuid(),
        sectorId: z.uuid(),
        formId: z.uuid(),
        responsibleIds: z
          .array(z.uuid())
          .min(1)
          .max(50)
          .refine((ids) => new Set(ids).size === ids.length),
        frequency: z.enum(FREQUENCIES),
        startDate: date,
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        endDate: date.nullable().default(null),
        deadlineHours: z.number().int().min(1).max(8760),
      })
      .strict()
      .refine((value) => !value.endDate || value.endDate >= value.startDate),
    raw,
  );
export const parseSchedulePatch = (raw: unknown) =>
  parseInput(
    z
      .object({
        revision,
        name: z.string().trim().min(1).max(160).optional(),
        isActive: z.boolean().optional(),
      })
      .strict()
      .refine((value) => value.name !== undefined || value.isActive !== undefined),
    raw,
  );
export const parseScheduleQuery = (raw: unknown) =>
  parseInput(z.object({ ...paginationShape, q: searchQuery, isActive: activeQuery }).strict(), raw);
export const parseCandidateQuery = (raw: unknown) =>
  parseInput(
    z.object({ ...paginationShape, q: searchQuery, unitId: z.uuid(), sectorId: z.uuid() }).strict(),
    raw,
  );
export const parseAssignmentQuery = (raw: unknown) =>
  parseInput(
    z
      .object({
        ...paginationShape,
        state: z.enum(['UPCOMING', 'PENDING', 'OVERDUE', 'CANCELLED']).optional(),
      })
      .strict(),
    raw,
  );
