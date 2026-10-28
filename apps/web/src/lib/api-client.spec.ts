import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiError } from './api-client';
afterEach(() => vi.unstubAllGlobals());
it('preserves structured publication field errors without trusting server diagnostic messages', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'private diagnostic',
          definitionErrors: [{ path: 'title', code: 'EMPTY_LABEL' }],
        }),
        { status: 400 },
      ),
    ),
  );
  let failure: unknown;
  try {
    await api('forms/example/publish', { method: 'POST', body: '{}' });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(ApiError);
  expect(failure).toHaveProperty('definitionErrors', [{ path: 'title', code: 'EMPTY_LABEL' }]);
  expect((failure as Error).message).not.toContain('private');
});
