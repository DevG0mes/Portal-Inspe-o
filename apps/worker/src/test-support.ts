import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
/** Only a generated browser-test queue can be removed by the browser runner. */
export async function cleanupBrowserQueue(name: string, url: string) {
  if (!/^portal-browser-schedules-[a-f0-9]{16}$/.test(name))
    throw new Error('Not an owned test queue.');
  const connection = new Redis(url, { maxRetriesPerRequest: null });
  const queue = new Queue(name, { connection });
  try {
    await queue.obliterate({ force: true });
  } finally {
    await queue.close();
    connection.disconnect();
  }
}
