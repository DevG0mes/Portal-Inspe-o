import { BadRequestException, ConflictException } from '@nestjs/common';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { z } from 'zod';

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException('Dados ou filtros inválidos.');
  return result.data;
}

export const parseId = (input: unknown) => parseInput(z.uuid(), input);
export const paginationShape = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
export const activeQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));
export const searchQuery = z.string().trim().max(120).optional();

/** User search is literal text, not an SQL LIKE pattern. */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

export async function withUniqueConflict<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof UniqueConstraintViolationException)
      throw new ConflictException('Já existe um registro com esses dados.');
    throw error;
  }
}
