import { z } from 'zod';
import { parseInput } from '../common/input.js';
export const revisionSchema = z.number().int().positive().max(2147483646);
export const parsePrepareFile = (raw: unknown) =>
  parseInput(
    z
      .object({
        uploadId: z.uuid().optional(),
        inspectionId: z.uuid(),
        questionId: z.uuid(),
        revision: revisionSchema,
        filename: z.string().min(1).max(200),
        mime: z.string().max(80),
        size: z.number().int().positive(),
      })
      .strict(),
    raw,
  );
export const parseFileRevision = (raw: unknown) =>
  parseInput(z.object({ revision: revisionSchema }).strict(), raw);
