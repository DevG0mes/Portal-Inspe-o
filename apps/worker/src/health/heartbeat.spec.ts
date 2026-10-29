import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { heartbeat, healthyHeartbeat } from './heartbeat.js';

it('records bounded readiness, rejects stale heartbeats and removes health on shutdown', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'portal-heartbeat-'));
  const file = join(directory, 'health.json');
  try {
    const stop = await heartbeat(file, { queue: async () => {}, database: async () => {} }, 20);
    const health = JSON.parse(await readFile(file, 'utf8'));
    expect(healthyHeartbeat(health, Date.now())).toBe(true);
    expect(healthyHeartbeat(health, Date.now() + 61000)).toBe(false);
    await stop();
    await expect(readFile(file)).rejects.toThrow();
    const failed = await heartbeat(
      file,
      {
        queue: async () => {
          throw new Error('secret');
        },
      },
      20,
    );
    expect(healthyHeartbeat(JSON.parse(await readFile(file, 'utf8')), Date.now())).toBe(false);
    expect(await readFile(file, 'utf8')).not.toContain('secret');
    await failed();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
