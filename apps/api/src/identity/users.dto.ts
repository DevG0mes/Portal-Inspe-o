import { z } from 'zod';
import { USER_ROLES } from '@portal/contracts';
import { normalizedEmail } from '../auth/dto/login.dto.js';
import { newPasswordSchema } from '../auth/dto/change-password.dto.js';
import { activeQuery, paginationShape, parseInput, searchQuery } from '../common/input.js';

const name = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .transform((value) => value.normalize('NFC'));
const createSchema = z
  .object({
    name,
    email: normalizedEmail,
    password: newPasswordSchema,
    role: z.enum(USER_ROLES).default('COLLABORATOR'),
  })
  .strict();
const updateSchema = z
  .object({
    name: name.optional(),
    email: normalizedEmail.optional(),
    role: z.enum(USER_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0);
const querySchema = z
  .object({
    ...paginationShape,
    q: searchQuery,
    isActive: activeQuery,
    role: z.enum(USER_ROLES).optional(),
  })
  .strict();
const resetSchema = z.object({ newPassword: newPasswordSchema }).strict();

export const parseCreateUser = (input: unknown) => parseInput(createSchema, input);
export const parseUpdateUser = (input: unknown) => parseInput(updateSchema, input);
export const parseUsersQuery = (input: unknown) => parseInput(querySchema, input);
export const parseUserReset = (input: unknown) => parseInput(resetSchema, input);
