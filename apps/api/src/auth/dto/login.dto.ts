import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const normalizedEmail = z.string().trim().toLowerCase().email().max(254);
const loginSchema = z
  .object({ email: normalizedEmail, password: z.string().min(1).max(128) })
  .strict();

export function parseLogin(input: unknown) {
  const result = loginSchema.safeParse(input);
  if (!result.success) throw new BadRequestException('Informe e-mail e senha válidos.');
  return result.data;
}
