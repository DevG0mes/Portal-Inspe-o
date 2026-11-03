import { z } from 'zod';
export const contextInputSchema = z
  .object({
    customerId: z.uuid(),
    locationId: z.uuid(),
    participants: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(160)
          .transform((v) => v.normalize('NFC'))
          .pipe(z.string().min(1).max(160)),
      )
      .max(20)
      .default([])
      .refine((v) => new Set(v.map((n) => n.toLowerCase())).size === v.length),
  })
  .strict();
import { activeQuery, paginationShape, searchQuery, parseInput } from '../common/input.js';
const name = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .transform((v) => v.normalize('NFC'))
  .pipe(z.string().min(1).max(160));
const unitIds = z
  .array(z.uuid())
  .min(1)
  .max(100)
  .refine((v) => new Set(v).size === v.length);
const query = z
  .object({
    ...paginationShape,
    q: searchQuery,
    isActive: activeQuery,
    unitId: z.uuid().optional(),
    customerId: z.uuid().optional(),
    kind: z.enum(['substation', 'address']).optional(),
  })
  .strict();
export const parseCustomerQuery = (raw: unknown) => parseInput(query, raw);
export const parseCustomerCreate = (raw: unknown) =>
  parseInput(z.object({ name, unitIds }).strict(), raw);
export const parseCustomerPatch = (raw: unknown) =>
  parseInput(
    z
      .object({
        revision: z.number().int().positive(),
        name: name.optional(),
        unitIds: unitIds.optional(),
        isActive: z.boolean().optional(),
      })
      .strict()
      .refine((v) => v.name !== undefined || v.unitIds !== undefined || v.isActive !== undefined),
    raw,
  );
export const parseLocationCreate = (raw: unknown) =>
  parseInput(
    z
      .object({
        name: z.string().trim().min(1).max(320),
        city: name.optional(),
        customerId: z.uuid().optional(),
      })
      .strict()
      .refine((v) => !!v.city !== !!v.customerId),
    raw,
  );
export const parseLocationPatch = (raw: unknown) =>
  parseInput(
    z
      .object({
        revision: z.number().int().positive(),
        name: z.string().trim().min(1).max(320).optional(),
        city: name.optional(),
        isActive: z.boolean().optional(),
      })
      .strict()
      .refine((v) => v.name !== undefined || v.city !== undefined || v.isActive !== undefined),
    raw,
  );
