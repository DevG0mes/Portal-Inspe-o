import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const newPasswordSchema = z.string().min(15).max(128);
const schema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: newPasswordSchema })
  .strict();

export function parseChangePassword(input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException('A nova senha deve ter entre 15 e 128 caracteres.');
  return result.data;
}
