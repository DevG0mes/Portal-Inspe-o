import { afterEach, expect, it, vi } from 'vitest';
import type { AnswerInput } from '@portal/contracts';
import { DraftSession } from './draft-session';
import { ApiError } from '../../lib/api-client';
afterEach(() => vi.useRealTimers());
it('accepts an evidence revision only when there is no unsaved local generation', () => {
  const session = new DraftSession<AnswerInput[]>({ revision: 2, snapshot: [] }, vi.fn());
  expect(session.acceptRevision(2, 3)).toBe(true);
  session.edit([{ questionId: 'a', value: 0 }]);
  expect(session.acceptRevision(3, 4)).toBe(false);
  expect(session.getSnapshot()).toMatchObject({ revision: 3, status: 'conflict' });
  session.dispose();
});
it('serializes answer drafts and does not replace newer typing with an older receipt', async () => {
  vi.useFakeTimers();
  let finish!: (result: { revision: number; snapshot: AnswerInput[] }) => void;
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockImplementation(async (revision: number, snapshot: AnswerInput[]) => ({
      revision: revision + 1,
      snapshot,
    }));
  const session = new DraftSession<AnswerInput[]>({ revision: 1, snapshot: [] }, save);
  session.edit([{ questionId: 'a', value: 'primeira' }]);
  await vi.advanceTimersByTimeAsync(700);
  session.edit([{ questionId: 'a', value: 'segunda' }]);
  finish({ revision: 2, snapshot: [{ questionId: 'a', value: 'primeira' }] });
  await session.flush();
  expect(save).toHaveBeenLastCalledWith(2, [{ questionId: 'a', value: 'segunda' }]);
  expect(session.getSnapshot()).toMatchObject({
    revision: 3,
    status: 'saved',
    snapshot: [{ value: 'segunda' }],
  });
  session.dispose();
});
it('keeps local answers when saving fails or conflicts and never retries a conflict', async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockRejectedValue(new ApiError(409));
  const session = new DraftSession<AnswerInput[]>({ revision: 1, snapshot: [] }, save);
  session.edit([{ questionId: 'a', value: 0 }]);
  expect(await session.flush()).toBe(false);
  expect(session.getSnapshot().status).toBe('error');
  expect(await session.retry()).toBe(false);
  expect(session.getSnapshot().status).toBe('conflict');
  expect(await session.retry()).toBe(false);
  expect(save).toHaveBeenCalledTimes(2);
  expect(session.getSnapshot().snapshot).toEqual([{ questionId: 'a', value: 0 }]);
  session.dispose();
});
