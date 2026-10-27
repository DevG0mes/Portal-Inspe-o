import { z } from 'zod';
import { activeQuery, paginationShape, parseInput, searchQuery } from '../common/input.js';

const name = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .transform((value) => value.normalize('NFC'));
const namedCreate = z.object({ name }).strict();
const namedPatch = z
  .object({ name: name.optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const unitQuery = z.object({ ...paginationShape, q: searchQuery, isActive: activeQuery }).strict();
const sectorQuery = unitQuery.extend({ unitId: z.uuid().optional() });
const membershipQuery = z
  .object({
    ...paginationShape,
    userId: z.uuid().optional(),
    unitId: z.uuid().optional(),
    isActive: activeQuery,
  })
  .strict();
const unitGrant = z.object({ userId: z.uuid(), unitId: z.uuid() }).strict();
const sectorGrant = unitGrant.extend({ sectorId: z.uuid() });
const activePatch = z.object({ isActive: z.boolean() }).strict();

export const parseNamedCreate = (input: unknown) => parseInput(namedCreate, input);
export const parseNamedPatch = (input: unknown) => parseInput(namedPatch, input);
export const parseSectorCreate = (input: unknown) =>
  parseInput(namedCreate.extend({ unitId: z.uuid() }), input);
export const parseUnitQuery = (input: unknown) => parseInput(unitQuery, input);
export const parseSectorQuery = (input: unknown) => parseInput(sectorQuery, input);
export const parseMembershipQuery = (input: unknown) => parseInput(membershipQuery, input);
export const parseUnitGrant = (input: unknown) => parseInput(unitGrant, input);
export const parseSectorGrant = (input: unknown) => parseInput(sectorGrant, input);
export const parseActivePatch = (input: unknown) => parseInput(activePatch, input);
