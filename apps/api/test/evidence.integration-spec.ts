import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { loadEnvironment } from '@portal/config';
import { MinioStorageAdapter } from '../src/files/minio-storage.adapter.js';
import { cleanupEvidenceTestBucket } from '../src/files/test-support.js';
it('keeps actual MinIO evidence private, verifies bytes and issues expiring attachment downloads', async () => {
  process.loadEnvFile('.env');
  const environment = {
    ...loadEnvironment(process.env),
    MINIO_BUCKET: `portal-evidence-test-${randomBytes(8).toString('hex')}`,
  };
  const storage = new MinioStorageAdapter(environment);
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=',
    'base64',
  );
  try {
    await storage.ensureBucket();
    await storage.ensureBucket();
    await storage.put('temporary/test', bytes, 'image/png');
    expect(await storage.read('temporary/test', 1024)).toEqual(bytes);
    await expect(storage.read('temporary/test', 1)).rejects.toThrow();
    await storage.copy('temporary/test', 'evidence/test');
    await storage.remove('temporary/test');
    expect(await storage.read('evidence/test', 1024)).toEqual(bytes);
    const signed = await storage.downloadUrl('evidence/test', 'Foto de inspeção.png', 'image/png');
    expect(new URL(signed).searchParams.get('X-Amz-Expires')).toBe('60');
    const downloaded = await fetch(signed);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get('content-disposition')).toContain('attachment');
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(bytes);
    const anonymous = new URL(signed);
    anonymous.search = '';
    const denied = await fetch(anonymous);
    await denied.body?.cancel();
    expect(denied.status).toBe(403);
    await expect(
      cleanupEvidenceTestBucket({ ...environment, MINIO_BUCKET: 'inspection-evidence' }),
    ).rejects.toThrow(/Refusing/);
  } finally {
    await cleanupEvidenceTestBucket(environment);
  }
}, 30000);
