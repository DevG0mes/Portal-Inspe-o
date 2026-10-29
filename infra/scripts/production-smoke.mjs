import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { request } from 'node:https';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import console from 'node:console';
const { Headers, Response } = globalThis;

// Only the disposable compose rehearsal may run this fixture generator.
assert.equal(process.env.SMOKE_DISPOSABLE, 'portal-stage14');
const origin = process.env.APP_ORIGIN;
assert.equal(new URL(origin).hostname, 'portal.stage14.test');
const ingress = 'https://ingress:8443';
// Test certificate is explicitly trusted, with the public hostname checked for each connection.
async function ingressFetch(path, options = {}) {
  const publicHost = options.headers.Host;
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: 'ingress',
        port: 8443,
        servername: publicHost.split(':')[0],
        path: new URL(path, ingress).pathname + new URL(path, ingress).search,
        method: options.method ?? 'GET',
        headers: options.headers,
        ca: process.env.SMOKE_CA,
        timeout: 30000,
      },
      (incoming) => {
        const chunks = [];
        incoming.on('data', (chunk) => chunks.push(chunk));
        incoming.on('error', reject);
        incoming.on('end', () => {
          const headers = new Headers();
          for (let i = 0; i < incoming.rawHeaders.length; i += 2)
            headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
          resolve(
            new Response(incoming.statusCode === 204 ? null : Buffer.concat(chunks), {
              status: incoming.statusCode,
              headers,
            }),
          );
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Ingress timeout')));
    req.end(options.body);
  });
}
if (process.env.SMOKE_RATE_ONLY === '1') {
  const statuses = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await ingressFetch('/api/auth/LOGIN', {
      method: 'POST',
      headers: { Host: new URL(origin).host, Origin: origin, 'Content-Type': 'application/json' },
      body: '{}',
    });
    statuses.push(response.status);
  }
  assert.ok(statuses.includes(429), 'Ingress must limit uppercase authentication routes');
  console.info(JSON.stringify({ event: 'ingress.rate_limit.passed', statuses }));
  process.exit(0);
}
let cookie = '';
async function call(path, data, method = data === undefined ? 'GET' : 'POST') {
  const response = await ingressFetch(`${ingress}/api/${path}`, {
    method,
    headers: {
      Host: new URL(origin).host,
      Origin: origin,
      Cookie: cookie,
      ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  assert.ok(response.ok, `${path} status=${response.status}`);
  for (const value of response.headers.getSetCookie())
    if (!/Max-Age=0/i.test(value)) cookie = value.split(';')[0];
  return response.status === 204 ? undefined : response.json();
}
await call('auth/login', {
  email: process.env.INITIAL_ADMIN_EMAIL,
  password: process.env.INITIAL_ADMIN_PASSWORD,
});
await call('auth/change-password', {
  currentPassword: process.env.INITIAL_ADMIN_PASSWORD,
  newPassword: `${process.env.INITIAL_ADMIN_PASSWORD}-changed`,
});
const rehearsal = randomUUID().slice(0, 8);
const unit = await call('organization/units', { name: `Ensaio de produção ${rehearsal}` });
const sector = await call('organization/sectors', { name: 'Proteção', unitId: unit.id });
const form = await call('forms', { name: `Inspeção HTTPS ${rehearsal}` });
const questionId = randomUUID();
const draft = await call(
  `forms/${form.id}/draft`,
  {
    revision: 1,
    snapshot: {
      schemaVersion: 1,
      title: 'Verificação de proteção',
      sections: [
        {
          id: randomUUID(),
          title: 'Área',
          questions: [
            { id: questionId, label: 'Proteção instalada?', type: 'YES_NO_NA', required: true },
          ],
        },
      ],
    },
  },
  'PUT',
);
await call(`forms/${form.id}/publish`, { revision: draft.revision });
const inspection = await call('inspections', {
  unitId: unit.id,
  sectorId: sector.id,
  formId: form.id,
});
await call(
  `inspections/${inspection.id}/draft`,
  { revision: 1, answers: [{ questionId, value: 'YES' }] },
  'PUT',
);
await call(`inspections/${inspection.id}/complete`, { revision: 2, cycle: 1 });
const reports = [];
for (const input of [
  { format: 'PDF', inspectionId: inspection.id },
  { format: 'XLSX', filters: { formId: form.id } },
]) {
  const report = await call('reports', { requestId: randomUUID(), ...input });
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    const status = await call(`reports/${report.id}`);
    if (status.state === 'READY') {
      ready = true;
      break;
    }
    assert.notEqual(status.state, 'FAILED');
    await delay(1000);
  }
  assert.ok(ready, 'Report readiness timeout');
  const signed = await call(`reports/${report.id}/download`, {});
  const publicUrl = new URL(signed.url);
  assert.equal(publicUrl.hostname, 'files.stage14.test');
  const response = await ingressFetch(`${ingress}${publicUrl.pathname}${publicUrl.search}`, {
    headers: { Host: publicUrl.host },
  });
  assert.equal(response.status, 200, 'HTTPS object signature must survive ingress');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(
    bytes.subarray(0, input.format === 'PDF' ? 5 : 2).toString(),
    input.format === 'PDF' ? '%PDF-' : 'PK',
  );
  reports.push({
    format: input.format,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  const anonymous = await ingressFetch(`${ingress}${publicUrl.pathname}`, {
    headers: { Host: publicUrl.host },
  });
  assert.equal(anonymous.status, 403);
}
await call('auth/logout', {});
console.info(JSON.stringify({ event: 'production.smoke.passed', reports }));
