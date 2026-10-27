import type { JsonValue } from './audit-event.entity.js';

const secretKey = /password|passwd|senha|token|secret|cookie|authorization|apikey|accesskey/i;

function sanitize(value: unknown, ancestors: Set<object>): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'object') return undefined;
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    return undefined;
  if (value instanceof Date) return value.toISOString();
  if (ancestors.has(value)) throw new Error('Audit changes must not contain circular references');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value
        .map((item) => sanitize(item, ancestors))
        .filter((item): item is JsonValue => item !== undefined);
    }
    const entries = Object.entries(value).flatMap(([key, item]) => {
      if (secretKey.test(key.replace(/[^a-z0-9]/gi, ''))) return [];
      const safe = sanitize(item, ancestors);
      return safe === undefined ? [] : [[key, safe] as const];
    });
    return Object.fromEntries(entries);
  } finally {
    ancestors.delete(value);
  }
}

/** Omit known credential fields and binary payloads recursively; never mutate the caller. */
export function sanitizeChanges(changes: Record<string, unknown>): Record<string, JsonValue> {
  return sanitize(changes, new Set()) as Record<string, JsonValue>;
}
