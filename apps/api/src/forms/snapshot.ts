import { createHash } from 'node:crypto';
import type { FormVersionSnapshot } from '@portal/contracts';

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))
        .map(([key, item]) => [key, ordered(item)]),
    );
  return value;
}

/** JSONB can reorder object keys; hash a stable encoding while preserving all array order. */
export function snapshotHash(snapshot: FormVersionSnapshot) {
  return createHash('sha256')
    .update(JSON.stringify(ordered(snapshot)))
    .digest('hex');
}
