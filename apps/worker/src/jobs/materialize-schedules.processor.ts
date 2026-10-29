import { materializationKey } from '@portal/scheduling';
interface Runtime {
  due: () => Promise<{ id: string; nextOccurrenceAt: Date | null; revision?: number }[]>;
  materialize: (id: string, at: string, key: string) => Promise<{ id: string }>;
  cleanupUploads?: () => Promise<{ cleaned: number }>;
  notifyDeadlines?: () => Promise<{ emitted: number }>;
  reportsDue?: () => Promise<{ id: string; attempts: number }[]>;
  generateReport?: (id: string) => Promise<unknown>;
}
interface JobQueue {
  add: (name: string, data: object, options: object) => Promise<unknown> | unknown;
  getJob?: (
    id: string,
  ) => Promise<{ getState: () => Promise<string>; retry: () => Promise<void> } | undefined>;
}
export async function processSchedulingJob(
  job: { name: string; data: unknown },
  runtime: Runtime,
  queue: JobQueue,
) {
  if (job.name === 'generate-report') {
    if (
      !runtime.generateReport ||
      !job.data ||
      typeof job.data !== 'object' ||
      !('id' in job.data) ||
      typeof job.data.id !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(job.data.id)
    )
      throw new Error('Invalid report job.');
    return runtime.generateReport(job.data.id);
  }
  if (job.name === 'notify-deadlines') {
    if (!runtime.notifyDeadlines) throw new Error('Deadline notifications unavailable.');
    return runtime.notifyDeadlines();
  }
  if (job.name === 'cleanup-uploads') {
    if (!runtime.cleanupUploads) throw new Error('Upload cleanup unavailable.');
    return runtime.cleanupUploads();
  }
  if (job.name === 'scan') {
    if (runtime.reportsDue)
      for (const report of await runtime.reportsDue()) {
        const jobId = `report-${report.id}-a${report.attempts + 1}`,
          existing = await queue.getJob?.(jobId);
        if (existing && (await existing.getState()) === 'failed') {
          await existing.retry();
          continue;
        }
        await queue.add(
          'generate-report',
          { id: report.id },
          {
            jobId,
            removeOnComplete: { age: 86400, count: 1000 },
            removeOnFail: { age: 604800, count: 1000 },
          },
        );
      }
    const rows = await runtime.due();
    for (const row of rows) {
      if (!row.nextOccurrenceAt) continue;
      const at = row.nextOccurrenceAt.toISOString(),
        key = materializationKey(row.id, at);
      const jobId = `${key}-r${row.revision ?? 1}`;
      const existing = await queue.getJob?.(jobId);
      if (existing && (await existing.getState()) === 'failed') {
        await existing.retry();
        continue;
      }
      await queue.add(
        'materialize',
        { scheduleId: row.id, occurrenceAt: at, idempotencyKey: key },
        {
          jobId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 604800, count: 1000 },
        },
      );
    }
    return { queued: rows.length };
  }
  if (job.name !== 'materialize' || !job.data || typeof job.data !== 'object')
    throw new Error('Unknown scheduling job.');
  const data = job.data as Record<string, unknown>;
  if (
    typeof data.scheduleId !== 'string' ||
    typeof data.occurrenceAt !== 'string' ||
    typeof data.idempotencyKey !== 'string' ||
    !Number.isFinite(Date.parse(data.occurrenceAt)) ||
    materializationKey(data.scheduleId, data.occurrenceAt) !== data.idempotencyKey
  )
    throw new Error('Invalid occurrence job.');
  const result = await runtime.materialize(data.scheduleId, data.occurrenceAt, data.idempotencyKey);
  return { assignmentId: result.id };
}
