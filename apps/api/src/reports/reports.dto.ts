import { z } from 'zod';
import { parseInput, paginationShape } from '../common/input.js';
const filters = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    unitId: z.uuid().optional(),
    sectorId: z.uuid().optional(),
    formId: z.uuid().optional(),
    customerId: z.uuid().optional(),
    locationId: z.uuid().optional(),
    inspectorId: z.uuid().optional(),
    category: z.string().max(160).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  })
  .strict();
export const parseReportInput = (raw: unknown) =>
  parseInput(
    z.discriminatedUnion('format', [
      z
        .object({
          requestId: z.uuid(),
          format: z.literal('PDF'),
          inspectionId: z.uuid(),
          submissionId: z.uuid().optional(),
        })
        .strict(),
      z
        .object({ requestId: z.uuid(), format: z.literal('XLSX'), filters: filters.default({}) })
        .strict(),
    ]),
    raw,
  );
export const parseReportQuery = (raw: unknown) =>
  parseInput(z.object(paginationShape).strict(), raw);
