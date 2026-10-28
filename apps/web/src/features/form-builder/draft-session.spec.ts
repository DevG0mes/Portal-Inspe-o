import { afterEach, expect, it, vi } from 'vitest';
import type { FormVersionSnapshot } from '@portal/contracts';
import { DraftSession } from './draft-session';
import { ApiError } from '../../lib/api-client';
const original: FormVersionSnapshot = { schemaVersion: 1, title: 'Inicial', sections: [] };
afterEach(() => vi.useRealTimers());
it('serializes saves and never replaces typing with an older response', async () => {
  let complete!: (value: { revision: number; snapshot: FormVersionSnapshot }) => void;
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    )
    .mockImplementationOnce(async (_revision, snapshot) => ({ revision: 3, snapshot }));
  const session = new DraftSession({ revision: 1, snapshot: original }, save);
  session.edit({ ...original, title: 'A' });
  const pending = session.flush();
  session.edit({ ...original, title: 'B' });
  complete({ revision: 2, snapshot: { ...original, title: 'A' } });
  expect(await pending).toBe(true);
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1]?.[0]).toBe(2);
  expect(session.getSnapshot().snapshot.title).toBe('B');
  expect(session.getSnapshot().status).toBe('saved');
  session.dispose();
});
it('stops automatic writes on conflict and keeps local edits', async () => {
  vi.useFakeTimers();
  const save = vi.fn().mockRejectedValue(new ApiError(409));
  const session = new DraftSession({ revision: 1, snapshot: original }, save);
  session.edit({ ...original, title: 'Meu trabalho' });
  await vi.advanceTimersByTimeAsync(800);
  expect(session.getSnapshot().status).toBe('conflict');
  session.edit({ ...original, title: 'Mantido' });
  await vi.advanceTimersByTimeAsync(5000);
  expect(save).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot().snapshot.title).toBe('Mantido');
  expect(await session.flush()).toBe(false);
  session.dispose();
});
it('does not save while IME composition is active and retries only explicitly after failure', async () => {
  vi.useFakeTimers();
  const save = vi
    .fn()
    .mockRejectedValueOnce(new ApiError(503))
    .mockImplementationOnce(async (_revision, snapshot) => ({ revision: 2, snapshot }));
  const session = new DraftSession({ revision: 1, snapshot: original }, save);
  session.setComposing(true);
  session.edit({ ...original, title: 'Título' });
  await vi.advanceTimersByTimeAsync(2000);
  expect(save).not.toHaveBeenCalled();
  session.setComposing(false);
  await vi.advanceTimersByTimeAsync(800);
  expect(session.getSnapshot().status).toBe('error');
  await vi.advanceTimersByTimeAsync(5000);
  expect(save).toHaveBeenCalledTimes(1);
  expect(await session.retry()).toBe(true);
  session.dispose();
});
