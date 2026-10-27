import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { probeStorage } from '../src/health/storage-probe.js';

it('aborts storage connections when a server accepts requests without responding', async () => {
  const server = createServer(() => {});
  let closed = false;
  server.on('connection', (socket) =>
    socket.on('close', () => {
      closed = true;
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server port');
  try {
    await expect(probeStorage(`http://127.0.0.1:${address.port}`, 100)).rejects.toThrow();
    await expect.poll(() => closed).toBe(true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
