import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const fields = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: port.default(3001),
  APP_ORIGIN: z
    .url()
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol))
    .default('http://127.0.0.1:3000')
    .transform((value) => new URL(value).origin),
  DATABASE_URL: z
    .url()
    .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol)),
  REDIS_URL: z.url().refine((value) => ['redis:', 'rediss:'].includes(new URL(value).protocol)),
  SCHEDULE_QUEUE_NAME: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,100}$/)
    .default('inspection-schedules'),
  SCHEDULE_POLL_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: port.default(9000),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  MINIO_ACCESS_KEY: z.string().min(3),
  MINIO_SECRET_KEY: z.string().min(8),
  MINIO_BUCKET: z.string().min(3).default('inspection-evidence'),
  MINIO_PUBLIC_URL: z
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      );
    })
    .optional(),
  EVIDENCE_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(25 * 1024 * 1024)
    .default(10 * 1024 * 1024),
});
const schema = fields.superRefine((environment, context) => {
  if (
    environment.NODE_ENV === 'production' &&
    !environment.MINIO_PUBLIC_URL?.startsWith('https://')
  ) {
    context.addIssue({
      code: 'custom',
      path: ['MINIO_PUBLIC_URL'],
      message: 'Production requires external HTTPS storage origin',
    });
  }
  if (environment.NODE_ENV === 'production' && !environment.APP_ORIGIN.startsWith('https://')) {
    context.addIssue({
      code: 'custom',
      path: ['APP_ORIGIN'],
      message: 'Production requires HTTPS',
    });
  }
});

export type Environment = z.infer<typeof schema>;

/** Validate once at startup. Error messages include field names, never supplied secrets. */
function validate<T>(configuration: z.ZodType<T>, source: Record<string, string | undefined>): T {
  const result = configuration.safeParse(source);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  }
  return result.data;
}
export function loadEnvironment(source: Record<string, string | undefined>): Environment {
  return validate(schema, source);
}

const pilotSchema = fields
  .pick({ NODE_ENV: true, API_HOST: true, API_PORT: true, APP_ORIGIN: true, DATABASE_URL: true })
  .refine(
    (environment) =>
      environment.NODE_ENV !== 'production' || environment.APP_ORIGIN.startsWith('https://'),
    { path: ['APP_ORIGIN'] },
  );

export function loadApiEnvironment(source: Record<string, string | undefined>) {
  if (source.PORTAL_PILOT === 'true')
    return { pilot: true as const, ...validate(pilotSchema, source) };
  return { pilot: false as const, ...loadEnvironment(source) };
}
