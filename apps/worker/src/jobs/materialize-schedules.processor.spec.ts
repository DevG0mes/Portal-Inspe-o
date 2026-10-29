import { expect, it, vi } from 'vitest';
import { processSchedulingJob } from './materialize-schedules.processor.js';
it('dispatches upload cleanup and does not acknowledge an unavailable cleanup runtime', async () => {
  const runtime = {
    due: vi.fn(),
    materialize: vi.fn(),
    cleanupUploads: vi.fn().mockResolvedValue({ cleaned: 2 }),
  };
  expect(
    await processSchedulingJob({ name: 'cleanup-uploads', data: {} }, runtime, { add: vi.fn() }),
  ).toEqual({ cleaned: 2 });
  await expect(
    processSchedulingJob(
      { name: 'cleanup-uploads', data: {} },
      { due: vi.fn(), materialize: vi.fn() },
      { add: vi.fn() },
    ),
  ).rejects.toThrow();
});
it('enqueues stable occurrence IDs and retries with the exact same domain key', async () => {
  const runtime = {
    due: vi
      .fn()
      .mockResolvedValue([{ id: 'a', nextOccurrenceAt: new Date('2026-10-29T11:00:00Z') }]),
    materialize: vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue({ id: 'assignment' }),
  };
  const queue = { add: vi.fn() };
  await processSchedulingJob({ name: 'scan', data: {} }, runtime, queue);
  const [name, data, options] = queue.add.mock.calls[0]!;
  expect(options.jobId).toBe(`${data.idempotencyKey}-r1`);
  await expect(processSchedulingJob({ name, data }, runtime, queue)).rejects.toThrow('temporary');
  expect(await processSchedulingJob({ name, data }, runtime, queue)).toEqual({
    assignmentId: 'assignment',
  });
  expect(runtime.materialize.mock.calls[0]).toEqual(runtime.materialize.mock.calls[1]);
});
it('does not acknowledge unknown or malformed jobs', async () => {
  const runtime = { due: vi.fn(), materialize: vi.fn() };
  const queue = { add: vi.fn() };
  await expect(
    processSchedulingJob({ name: 'unknown', data: {} }, runtime, queue),
  ).rejects.toThrow();
  await expect(
    processSchedulingJob({ name: 'materialize', data: { scheduleId: 'x' } }, runtime, queue),
  ).rejects.toThrow();
  expect(runtime.materialize).not.toHaveBeenCalled();
});
it('a resumed revision can enqueue again despite a completed occurrence job', async () => {
  const at = new Date('2026-10-29T11:00:00Z');
  const runtime = {
    due: vi
      .fn()
      .mockResolvedValueOnce([{ id: 'a', nextOccurrenceAt: at, revision: 1 }])
      .mockResolvedValueOnce([{ id: 'a', nextOccurrenceAt: at, revision: 3 }]),
    materialize: vi.fn(),
  };
  const queue = { add: vi.fn() };
  await processSchedulingJob({ name: 'scan', data: {} }, runtime, queue);
  await processSchedulingJob({ name: 'scan', data: {} }, runtime, queue);
  expect(queue.add.mock.calls[0]?.[1].idempotencyKey).toBe(
    queue.add.mock.calls[1]?.[1].idempotencyKey,
  );
  expect(queue.add.mock.calls[0]?.[2].jobId).not.toBe(queue.add.mock.calls[1]?.[2].jobId);
});
