import type { ReadinessResponse } from '@portal/contracts';

export type HealthChecks = Record<string, () => Promise<void>>;

/** Bound every probe so one unavailable dependency cannot hang a readiness request. */
async function runProbe(probe: () => Promise<void>, timeoutMs: number): Promise<'up' | 'down'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(probe),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Probe timeout')), timeoutMs);
      }),
    ]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

export class HealthService {
  constructor(
    private readonly checks: HealthChecks,
    private readonly timeoutMs = 2000,
  ) {}

  async readiness(): Promise<ReadinessResponse> {
    const entries = await Promise.all(
      Object.entries(this.checks).map(
        async ([name, probe]) => [name, await runProbe(probe, this.timeoutMs)] as const,
      ),
    );
    const dependencies = Object.fromEntries(entries);
    return {
      status: entries.every(([, state]) => state === 'up') ? 'ok' : 'unavailable',
      dependencies,
    };
  }
}
