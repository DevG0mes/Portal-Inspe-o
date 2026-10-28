import { z } from 'zod';
import { parseInput } from '../common/input.js';
const revision = z.number().int().positive().max(2147483646);
export const parseCreateInspection = (raw: unknown) =>
  parseInput(
    z.union([
      z.object({ assignmentId: z.uuid() }).strict(),
      z.object({ unitId: z.uuid(), sectorId: z.uuid(), formId: z.uuid() }).strict(),
    ]),
    raw,
  );
export const parseInspectionDraft = (raw: unknown) =>
  parseInput(
    z
      .object({
        revision,
        answers: z
          .array(
            z
              .object({
                questionId: z.uuid(),
                value: z.union([z.string().max(20000), z.number().finite(), z.null()]),
              })
              .strict(),
          )
          .max(500)
          .refine((rows) => new Set(rows.map((row) => row.questionId)).size === rows.length),
      })
      .strict(),
    raw,
  );
export const parseCompleteInspection = (raw: unknown) =>
  parseInput(z.object({ revision, cycle: revision }).strict(), raw);
export const parseReopenInspection = (raw: unknown) =>
  parseInput(z.object({ revision, reason: z.string().trim().min(5).max(2000) }).strict(), raw);
