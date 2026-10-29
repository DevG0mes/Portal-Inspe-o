import { readFile } from 'node:fs/promises';
import { healthyHeartbeat } from './heartbeat.js';

try {
  const file = process.env.WORKER_HEALTH_FILE;
  if (!file || !healthyHeartbeat(JSON.parse(await readFile(file, 'utf8')))) process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
