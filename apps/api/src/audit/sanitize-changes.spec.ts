import { describe, expect, it } from 'vitest';
import { sanitizeChanges } from './sanitize-changes.js';

describe('audit change sanitization', () => {
  it('removes credentials recursively while preserving useful changes', () => {
    expect(
      sanitizeChanges({
        name: 'Ana',
        password: 'never-store',
        access_token: 'never-store',
        nested: { cookie: 'never-store', authorization: 'never-store', count: 2 },
        items: [{ secret: 'never-store', enabled: true }],
      }),
    ).toEqual({ name: 'Ana', nested: { count: 2 }, items: [{ enabled: true }] });
  });

  it('omits binary evidence instead of recording its contents', () => {
    expect(sanitizeChanges({ photo: Buffer.from('private file'), size: 12 })).toEqual({ size: 12 });
  });

  it('does not mutate the original change object', () => {
    const input = { password: 'still-present-in-input', nested: { value: 1 } };
    const output = sanitizeChanges(input);
    expect(input.password).toBe('still-present-in-input');
    expect(output.nested).not.toBe(input.nested);
  });
});
