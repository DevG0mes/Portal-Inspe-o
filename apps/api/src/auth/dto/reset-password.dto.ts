import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { newPasswordSchema } from './change-password.dto.js';

const schema = z.object({ userId: z.uuid(), newPassword: newPasswordSchema }).strict();
export function parseResetPassword(input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException('Usuário ou nova senha inválidos.');
  return result.data;
}
