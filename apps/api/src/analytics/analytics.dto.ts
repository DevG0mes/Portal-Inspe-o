import { z } from 'zod';
import { parseInput, paginationShape } from '../common/input.js';
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
const schema = z
  .object({
    from: date.optional(),
    to: date.optional(),
    unitId: z.uuid().optional(),
    sectorId: z.uuid().optional(),
    formId: z.uuid().optional(),
    category: z.string().trim().min(1).max(160).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    ...paginationShape,
  })
  .strict();
export function parseAnalytics(raw: unknown, now = new Date()) {
  const q = parseInput(schema, raw);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const to = q.to ?? today,
    from =
      q.from ?? new Date(Date.parse(`${to}T12:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  parseInput(
    z.boolean().refine(Boolean),
    from <= to && Date.parse(to) - Date.parse(from) <= 365 * 86400000,
  );
  return { ...q, from, to };
}
export type AnalyticsQuery = ReturnType<typeof parseAnalytics>;
