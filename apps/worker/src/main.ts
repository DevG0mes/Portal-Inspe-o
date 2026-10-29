import { loadEnvironment } from '@portal/config';
import { createSchedulingRuntime } from '@portal/api/scheduling';
import { Redis } from 'ioredis';
import { Queue, Worker, UnrecoverableError } from 'bullmq';
import { processSchedulingJob } from './jobs/materialize-schedules.processor.js';
import { renderReport } from './jobs/generate-report.processor.js';
import { heartbeat } from './health/heartbeat.js';
async function bootstrap() {
  const environment = loadEnvironment(process.env);
  const runtime = await createSchedulingRuntime(environment.DATABASE_URL, renderReport);
  const connection = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', () =>
    console.error(JSON.stringify({ event: 'worker.connection_unavailable' })),
  );
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
  worker.on('error', () => console.error(JSON.stringify({ event: 'worker.unavailable' })));
  worker.on('failed', () => console.error(JSON.stringify({ event: 'worker.job_failed' })));
  let closing = false;
  let stopHealth: (() => Promise<void>) | undefined;
  async function shutdown() {
    if (closing) return;
    closing = true;
    await stopHealth?.();
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
    if (process.env.WORKER_HEALTH_FILE)
      stopHealth = await heartbeat(process.env.WORKER_HEALTH_FILE, {
        database: runtime.checkDatabase,
        queue: async () => {
          if (!worker.isRunning() || closing) throw new Error('Worker stopped');
          await queue.client.then((client) => client.ping());
        },
        storage: async () => {
          const response = await fetch(
            `${environment.MINIO_USE_SSL ? 'https' : 'http'}://${environment.MINIO_ENDPOINT}:${environment.MINIO_PORT}/minio/health/live`,
            { signal: AbortSignal.timeout(1500) },
          );
          if (!response.ok) throw new Error('Storage unavailable');
        },
      });
  } catch (error) {
    await shutdown();
    throw error;
  }
}
bootstrap().catch(() => {
  console.error(JSON.stringify({ event: 'worker.startup_failed' }));
  process.exitCode = 1;
});
