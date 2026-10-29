/** Small bounded concurrency check against isolated test data, never a production load generator. */
export async function readSmoke(read: () => Promise<void>, concurrency = 10, waves = 3) {
  const durations: number[] = [];
  for (let wave = 0; wave < waves; wave++) {
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        const start = performance.now();
        await read();
        durations.push(performance.now() - start);
      }),
    );
  }
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1]!;
  if (p95 > 5000) throw new Error(`Read smoke p95 exceeded 5000ms: ${Math.round(p95)}ms`);
  return { requests: durations.length, concurrency, p95: Math.round(p95) };
}
