import { loadEnvironment } from '@portal/config';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';

const environment = loadEnvironment(process.env);
const connection = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: null });
connection.on('error', () => {
  console.error('Worker connection unavailable.');
});

// No domain jobs are consumed until their processors exist; never acknowledge unknown work.
const queue = new Queue('inspection-schedules', { connection });
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await queue.close();
  connection.disconnect();
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
