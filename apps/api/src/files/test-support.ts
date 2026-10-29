import { Client } from 'minio';
import type { Environment } from '@portal/config';
/** Destructive cleanup is restricted to generated local test buckets, never the portal bucket. */
export async function cleanupEvidenceTestBucket(environment: Environment) {
  if (
    !/^portal-evidence-test-[a-f0-9]{16}$/.test(environment.MINIO_BUCKET) ||
    !['127.0.0.1', 'localhost', '::1'].includes(environment.MINIO_ENDPOINT)
  )
    throw new Error('Refusing cleanup outside an owned local evidence test bucket');
  const client = new Client({
    endPoint: environment.MINIO_ENDPOINT,
    port: environment.MINIO_PORT,
    useSSL: environment.MINIO_USE_SSL,
    accessKey: environment.MINIO_ACCESS_KEY,
    secretKey: environment.MINIO_SECRET_KEY,
  });
  if (!(await client.bucketExists(environment.MINIO_BUCKET))) return;
  const keys: string[] = [];
  for await (const item of client.listObjectsV2(environment.MINIO_BUCKET, '', true))
    if (item.name) keys.push(item.name);
  for (let offset = 0; offset < keys.length; offset += 1000)
    await client.removeObjects(environment.MINIO_BUCKET, keys.slice(offset, offset + 1000));
  await client.removeBucket(environment.MINIO_BUCKET);
}
