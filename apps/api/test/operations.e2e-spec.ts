import 'reflect-metadata';
import { afterEach, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createApplication } from '../src/app.js';

let app: INestApplication | undefined;
afterEach(async () => {
  await app?.close();
});

it('correlates sanitized access logs and rejects untrusted request identifiers', async () => {
  const events: unknown[] = [];
  app = await createApplication({}, undefined, undefined, undefined, undefined, {
    log: (event) => events.push(event),
    authLimit: 2,
  });
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const response = await fetch(`${url}/api/missing?token=private-secret`, {
    headers: { 'X-Request-Id': 'attacker', Cookie: 'secret=private-secret' },
  });
  expect(response.headers.get('x-request-id')).toMatch(/^[a-f0-9-]{36}$/);
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('x-frame-options')).toBe('DENY');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('x-powered-by')).toBeNull();
  expect(await response.json()).toMatchObject({ requestId: response.headers.get('x-request-id') });
  expect(events).toHaveLength(1);
  expect(JSON.stringify(events)).not.toMatch(/private-secret|attacker|cookie|token=/i);
});

it('bounds authentication work by transport peer, ignores forged forwarded IPs and returns retry time', async () => {
  app = await createApplication({}, undefined, undefined, undefined, undefined, {
    log: () => {},
    authLimit: 2,
  });
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  for (let index = 0; index < 3; index++) {
    const response = await fetch(`${url}${index === 2 ? '/API/AUTH/LOGIN' : '/api/auth/login'}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${index}` },
      body: '{}',
    });
    expect(response.status).toBe(index === 2 ? 429 : 404);
    if (index === 2) expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
  }
});

it('normalizes malformed and oversized JSON errors with correlation and security headers', async () => {
  app = await createApplication({}, undefined, undefined, undefined, undefined, { log: () => {} });
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  for (const [body, status] of [
    ['{private-secret', 400],
    [JSON.stringify('x'.repeat(2 * 1024 * 1024)), 413],
  ] as const) {
    const response = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(response.status).toBe(status);
    const content = await response.json();
    expect(content.requestId).toBe(response.headers.get('x-request-id'));
    expect(JSON.stringify(content)).not.toContain('private-secret');
  }
});
