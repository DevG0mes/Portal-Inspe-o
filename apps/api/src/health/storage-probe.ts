/** Cancel the underlying request on timeout, not merely the readiness caller's wait. */
export async function probeStorage(origin: string, timeoutMs = 1500): Promise<void> {
  const response = await fetch(new URL('/minio/health/ready', origin), {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error('Storage unavailable');
}
