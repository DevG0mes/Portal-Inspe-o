import { Client } from 'minio';
import * as http from 'node:http';
import * as https from 'node:https';
import { urlToHttpOptions } from 'node:url';
import type { Environment } from '@portal/config';
import type { StorageAdapter } from './storage.adapter.js';
function boundedTransport(base: Pick<typeof http, 'request'>): Pick<typeof http, 'request'> {
  function request(
    options: string | URL | http.RequestOptions,
    callback?: (response: http.IncomingMessage) => void,
  ): http.ClientRequest;
  function request(
    url: string | URL,
    options: http.RequestOptions,
    callback?: (response: http.IncomingMessage) => void,
  ): http.ClientRequest;
  function request(
    first: string | URL | http.RequestOptions,
    second?: http.RequestOptions | ((response: http.IncomingMessage) => void),
    third?: (response: http.IncomingMessage) => void,
  ) {
    const options =
      typeof first === 'string' || first instanceof URL
        ? { ...urlToHttpOptions(new URL(first)), ...(typeof second === 'object' ? second : {}) }
        : first;
    const callback = typeof second === 'function' ? second : third;
    const outgoing = base.request(options, (response) => {
      // Prevent the SDK's long exponential retries while a database lock is held.
      if ([408, 429, 499, 500, 502, 503, 504, 520].includes(response.statusCode ?? 0)) {
        response.resume();
        outgoing.destroy(new Error('Storage temporarily unavailable'));
        return;
      }
      response.setTimeout(15000, () => response.destroy(new Error('Storage response timeout')));
      callback?.(response);
    });
    const deadline = setTimeout(
      () => outgoing.destroy(new Error('Storage request timeout')),
      15000,
    );
    outgoing.once('close', () => clearTimeout(deadline));
    return outgoing;
  }
  return { request };
}
/** Private bucket, single-part bounded uploads and expiring attachment downloads. */
export class MinioStorageAdapter implements StorageAdapter {
  private readonly client: Client;
  private readonly downloadClient: Client;
  private readonly bucket: string;
  constructor(environment: Environment) {
    this.bucket = environment.MINIO_BUCKET;
    const transport = environment.MINIO_USE_SSL ? https : http;
    this.client = new Client({
      endPoint: environment.MINIO_ENDPOINT,
      port: environment.MINIO_PORT,
      useSSL: environment.MINIO_USE_SSL,
      accessKey: environment.MINIO_ACCESS_KEY,
      secretKey: environment.MINIO_SECRET_KEY,
      transport: boundedTransport(transport),
    });
    const publicUrl = environment.MINIO_PUBLIC_URL
      ? new URL(environment.MINIO_PUBLIC_URL)
      : undefined;
    this.downloadClient = publicUrl
      ? new Client({
          endPoint: publicUrl.hostname,
          port: Number(publicUrl.port || (publicUrl.protocol === 'https:' ? 443 : 80)),
          useSSL: publicUrl.protocol === 'https:',
          accessKey: environment.MINIO_ACCESS_KEY,
          secretKey: environment.MINIO_SECRET_KEY,
          region: 'us-east-1',
        })
      : this.client;
  }
  async ensureBucket() {
    if (!(await this.client.bucketExists(this.bucket))) {
      try {
        await this.client.makeBucket(this.bucket);
      } catch (error) {
        if (!(await this.client.bucketExists(this.bucket))) throw error;
      }
    }
    // No public policy is installed. Existing public buckets are rejected, not silently reused.
    const policy = await this.client.getBucketPolicy(this.bucket).catch((error: unknown) => {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'NoSuchBucketPolicy'
      )
        return '';
      throw error;
    });
    if (policy) throw new Error('Evidence bucket must have no anonymous policy');
  }
  async put(key: string, bytes: Buffer, mime: string) {
    await this.client.putObject(this.bucket, key, bytes, bytes.length, { 'Content-Type': mime });
  }
  async read(key: string, maxBytes: number) {
    const info = await this.client.statObject(this.bucket, key);
    if (info.size > maxBytes) throw new Error('Stored evidence exceeds limit');
    const stream = await this.client.getObject(this.bucket, key),
      chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of stream) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > maxBytes) throw new Error('Stored evidence exceeds limit');
        chunks.push(bytes);
      }
    } finally {
      stream.destroy();
    }
    return Buffer.concat(chunks);
  }
  async copy(source: string, target: string) {
    await this.client.copyObject(this.bucket, target, `/${this.bucket}/${source}`);
  }
  async remove(key: string) {
    await this.client.removeObject(this.bucket, key);
  }
  downloadUrl(key: string, filename: string, mime: string) {
    return this.downloadClient.presignedGetObject(this.bucket, key, 60, {
      'response-content-type': mime,
      'response-content-disposition': `attachment; filename="evidence"; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, '%27')}`,
      'response-cache-control': 'private, no-store',
    });
  }
}
