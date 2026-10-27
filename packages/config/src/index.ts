import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: port.default(3001),
  DATABASE_URL: z
    .url()
    .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol)),
  REDIS_URL: z.url().refine((value) => ['redis:', 'rediss:'].includes(new URL(value).protocol)),
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: port.default(9000),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  MINIO_ACCESS_KEY: z.string().min(3),
  MINIO_SECRET_KEY: z.string().min(8),
  MINIO_BUCKET: z.string().min(3).default('inspection-evidence'),
});

export type Environment = z.infer<typeof schema>;

/** Validate once at startup. Error messages include field names, never supplied secrets. */
export function loadEnvironment(source: Record<string, string | undefined>): Environment {
  const result = schema.safeParse(source);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  }
  return result.data;
}
