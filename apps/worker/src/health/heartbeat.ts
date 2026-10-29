import { writeFile, rename, unlink } from 'node:fs/promises';

export function healthyHeartbeat(value: unknown, now = Date.now()): boolean {
  if (!value || typeof value !== 'object' || !('at' in value) || !('ready' in value)) return false;
  return (
    value.ready === true &&
    typeof value.at === 'number' &&
    now >= value.at &&
    now - value.at < 60000
  );
}

/** Atomic local heartbeat. No credentials/errors on disk; failed or hung probes become unhealthy. */
export async function heartbeat(
  file: string,
  probes: Record<string, () => Promise<void>>,
  timeoutMs = 2000,
) {
  let stopped = false;
  let pending: Promise<void> = Promise.resolve();
  async function tick() {
    const results = await Promise.all(
      Object.values(probes).map(async (probe) => {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            Promise.resolve().then(probe),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new Error('timeout')), timeoutMs);
            }),
          ]);
          return true;
        } catch {
          return false;
        } finally {
          clearTimeout(timeout);
        }
      }),
    );
    if (stopped) return;
    await writeFile(
      `${file}.tmp`,
      JSON.stringify({ at: Date.now(), ready: results.every(Boolean) }),
      { mode: 0o600 },
    );
    await rename(`${file}.tmp`, file);
  }
  await tick();
  const timer = setInterval(() => {
    pending = tick().catch(() => {});
  }, 10000);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
    await unlink(file).catch(() => {});
    await unlink(`${file}.tmp`).catch(() => {});
  };
}
