import { loadEnvironment } from '@portal/config';
import { createSchedulingRuntime } from '@portal/api/scheduling';
import { Redis } from 'ioredis';
import { Queue, Worker, UnrecoverableError } from 'bullmq';
import { processSchedulingJob } from './jobs/materialize-schedules.processor.js';
async function bootstrap() {
  const environment = loadEnvironment(process.env);
  const runtime = await createSchedulingRuntime(environment.DATABASE_URL);
  const connection = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', () => console.error('Worker connection unavailable.'));
  const queue = new Queue(environment.SCHEDULE_QUEUE_NAME, { connection });
  const worker = new Worker(
    environment.SCHEDULE_QUEUE_NAME,
    async (job) => {
      try {
        return await processSchedulingJob(job, runtime, queue);
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'getStatus' in error &&
          typeof error.getStatus === 'function' &&
          Number(error.getStatus()) < 500
        )
          throw new UnrecoverableError('Scheduling configuration requires review.');
        throw error;
      }
    },
    { connection, concurrency: 4 },
  );
  worker.on('error', () => console.error('Scheduling worker unavailable.'));
  worker.on('failed', () =>
    console.error('Scheduling job failed; retry or configuration review required.'),
  );
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    await worker.close();
    await queue.close();
    connection.disconnect();
    await runtime.close();
  }
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
  try {
    await queue.upsertJobScheduler(
      'notify-deadlines',
      { every: 900000 },
      {
        name: 'notify-deadlines',
        data: {},
        opts: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      },
    );
    await queue.upsertJobScheduler(
      'cleanup-uploads',
      { every: 900000 },
      {
        name: 'cleanup-uploads',
        data: {},
        opts: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      },
    );
    await queue.upsertJobScheduler(
      'scan-schedules',
      { every: environment.SCHEDULE_POLL_MS },
      { name: 'scan', data: {}, opts: { removeOnComplete: 100, removeOnFail: 100 } },
    );
    await queue.add(
      'scan',
      {},
      { jobId: `startup-${Date.now()}`, removeOnComplete: true, removeOnFail: 100 },
    );
  } catch (error) {
    await shutdown();
    throw error;
  }
}
bootstrap().catch(() => {
  console.error('Worker startup failed. Check local services and configuration.');
  process.exitCode = 1;
});
