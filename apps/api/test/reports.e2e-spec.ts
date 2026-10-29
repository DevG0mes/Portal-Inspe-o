import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { createDatabaseOptions } from '../src/database/mikro-orm.config.js';
import type { INestApplication } from '@nestjs/common';
import { createTestDatabase } from './helpers/test-database.js';
import { createApplication } from '../src/app.js';
import { User } from '../src/identity/user.entity.js';
import { PasswordService } from '../src/auth/password.service.js';
import { Unit } from '../src/organization/unit.entity.js';
import { Sector } from '../src/organization/sector.entity.js';
import { UnitMembership, SectorMembership } from '../src/organization/membership.entity.js';
import { FormTemplate } from '../src/forms/entities/form-template.entity.js';
import { FormVersion } from '../src/forms/entities/form-version.entity.js';
import { Inspection, InspectionSubmission } from '../src/inspections/inspection.entity.js';
import { AccessPolicy } from '../src/access/access-policy.service.js';
import { AuditService } from '../src/audit/audit.service.js';
import { ReportsService } from '../src/reports/reports.service.js';
import { ReportRequest } from '../src/reports/report-request.entity.js';
import { definition, question } from './helpers/form-fixtures.js';
import type { StorageAdapter } from '../src/files/storage.adapter.js';
let db: Awaited<ReturnType<typeof createTestDatabase>>,
  app: INestApplication,
  origin: string,
  service: ReportsService,
  inspection: Inspection;
const users: User[] = [],
  cookies: string[] = [],
  objects = new Map<string, Buffer>();
let failPut = false,
  failRemove = false;
const storage: StorageAdapter = {
  ensureBucket: async () => {},
  put: async (key, bytes) => {
    objects.set(key, bytes);
    if (failPut) throw new Error('temporary storage failure');
  },
  read: async (key) => {
    const b = objects.get(key);
    if (!b) throw new Error('missing');
    return b;
  },
  copy: async () => {},
  remove: async (key) => {
    if (failRemove) throw new Error('cleanup unavailable');
    objects.delete(key);
  },
  downloadUrl: async () => 'http://127.0.0.1:9000/private/report-signed',
};
beforeAll(async () => {
  db = await createTestDatabase();
  const em = db.orm.em.fork(),
    hash = await new PasswordService().hash('Teste de relatórios 2026!');
  for (const role of ['ADMIN', 'COLLABORATOR', 'COLLABORATOR']) {
    const u = new User();
    Object.assign(u, {
      name: role,
      email: `${randomUUID()}@example.test`,
      role,
      passwordHash: hash,
      mustChangePassword: false,
    });
    em.persist(u);
    users.push(u);
  }
  const unit = new Unit();
  Object.assign(unit, { name: 'Unidade PDF', nameKey: 'unidade pdf' });
  const sector = new Sector();
  Object.assign(sector, { name: 'Setor PDF', nameKey: 'setor pdf', unit });
  const um = new UnitMembership();
  Object.assign(um, { user: users[1], unit });
  const sm = new SectorMembership();
  Object.assign(sm, { unitMembership: um, sector });
  const form = new FormTemplate();
  Object.assign(form, {
    name: 'Ficha de relatório',
    nameKey: 'ficha de relatório',
    state: 'PUBLISHED',
    latestVersion: 1,
    draftSnapshot: null,
  });
  const q = question('YES_NO_NA', {
    label: 'Proteção instalada?',
    nonconformity: { operator: 'EQ', value: 'NO', category: 'Proteção', priority: 'HIGH' },
  });
  const v = new FormVersion();
  Object.assign(v, {
    template: form,
    number: 1,
    contentHash: 'a'.repeat(64),
    snapshot: definition([q]),
    publishedBy: users[0],
  });
  inspection = new Inspection();
  Object.assign(inspection, {
    unit,
    sector,
    createdBy: users[1],
    formVersion: v,
    state: 'COMPLETED',
  });
  const submission = new InspectionSubmission();
  Object.assign(submission, {
    inspection,
    cycle: 1,
    sourceRevision: 1,
    completedBy: users[1],
    answers: [{ questionId: q.id, value: 'NO' }],
    nonconformities: [{ key: q.id, questionId: q.id, category: 'Proteção', priority: 'HIGH' }],
  });
  em.persist([unit, sector, um, sm, form, v, inspection, submission]);
  await em.flush();
  const audit = new AuditService(db.orm.em);
  service = new ReportsService(db.orm.em, new AccessPolicy(db.orm.em, audit), audit, storage);
  app = await createApplication({}, undefined, db.orm, undefined, storage);
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
  for (const u of users) {
    const r = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: 'Teste de relatórios 2026!' }),
    });
    cookies.push(r.headers.get('set-cookie')!.split(';')[0]!);
  }
}, 30000);
afterAll(async () => {
  await app?.close();
  await db?.close();
});
function call(path = '', method = 'GET', body?: unknown, user = 1) {
  return fetch(`${origin}/api/reports${path}`, {
    method,
    headers: {
      cookie: cookies[user]!,
      ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}),
    },
    ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
}
const input = () => ({ requestId: randomUUID(), format: 'PDF', inspectionId: inspection.id });
it('pins an authorized snapshot, deduplicates requests and privately serves a completed artifact', async () => {
  const body = input(),
    [first, second] = await Promise.all([call('', 'POST', body), call('', 'POST', body)]);
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  const row = await first.json();
  expect(row.state).toBe('QUEUED');
  expect((await second.json()).id).toBe(row.id);
  expect((await (await call('', 'POST', body)).json()).id).toBe(row.id);
  expect((await call(`/${row.id}`, 'GET', undefined, 2)).status).toBe(404);
  expect((await call(`/${row.id}/download`, 'POST')).status).toBe(409);
  let renders = 0;
  await Promise.all(
    [1, 2].map(() =>
      service.generate(row.id, async (snapshot) => {
        renders++;
        expect(snapshot.kind).toBe('INSPECTION');
        return Buffer.from('private report');
      }),
    ),
  );
  expect(renders).toBe(1);
  const ready = await (await call(`/${row.id}`)).json();
  expect(ready.state).toBe('READY');
  expect(ready.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(ready)).not.toMatch(/objectKey|snapshot|private report/);
  expect((await call(`/${row.id}/download`, 'POST')).status).toBe(201);
  await service.generate(row.id, async () => {
    throw new Error('must not render twice');
  });
  expect(objects.size).toBe(1);
  const xlsx = await call('', 'POST', { requestId: randomUUID(), format: 'XLSX', filters: {} });
  expect(xlsx.status).toBe(201);
  const x = await xlsx.json();
  await service.generate(x.id, async (snapshot) => {
    expect(snapshot.kind).toBe('ANALYTICS');
    if (snapshot.kind === 'ANALYTICS') expect(snapshot.summary.inspections.nonconformities).toBe(1);
    return Buffer.from('workbook');
  });
  expect((await (await call(`/${x.id}`)).json()).state).toBe('READY');
});
it('cleans partial uploads and allows an explicit retry without duplicating the request', async () => {
  const row = await (await call('', 'POST', input())).json(),
    before = objects.size;
  failPut = true;
  await service.generate(row.id, async () => Buffer.from('partial'));
  failPut = false;
  expect((await (await call(`/${row.id}`)).json()).state).toBe('FAILED');
  expect(objects.size).toBe(before);
  expect((await call(`/${row.id}/retry`, 'POST', {}, 2)).status).toBe(404);
  expect((await call(`/${row.id}/retry`, 'POST')).status).toBe(201);
  await service.generate(row.id, async () => Buffer.from('retry succeeded'));
  expect((await (await call(`/${row.id}`)).json()).state).toBe('READY');
});
it('fences an expired attempt so a late renderer cannot replace or remove its successor', async () => {
  const row = await (await call('', 'POST', input())).json(),
    started = Promise.withResolvers<void>(),
    delayed = Promise.withResolvers<Buffer>();
  const old = service.generate(row.id, async () => {
    started.resolve();
    return delayed.promise;
  });
  await started.promise;
  await db.orm.em
    .fork()
    .execute("update report_request set lease_until=now()-interval '1 minute' where id=?", [
      row.id,
    ]);
  await service.generate(row.id, async () => Buffer.from('successor'));
  delayed.resolve(Buffer.from('late'));
  await old;
  const ready = await (await call(`/${row.id}`)).json();
  expect(ready.state).toBe('READY');
  expect([...objects.values()].filter((b) => b.toString() === 'successor')).toHaveLength(1);
  expect([...objects.values()].some((b) => b.toString() === 'late')).toBe(false);
});
it('recovers a durable partial key after storage cleanup was unavailable', async () => {
  const row = await (await call('', 'POST', input())).json(),
    before = objects.size;
  failPut = true;
  failRemove = true;
  await service.generate(row.id, async () => Buffer.from('recoverable partial'));
  failPut = false;
  failRemove = false;
  expect(objects.size).toBe(before + 1);
  await service.cleanup();
  expect(objects.size).toBe(before);
});
it('serializes concurrent requests before enforcing the per-user pending limit', async () => {
  const results = await Promise.all([1, 2, 3, 4].map(() => call('', 'POST', input())));
  expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 409]);
  for (const r of results.filter((r) => r.status === 201)) {
    const row = await r.json();
    await service.generate(row.id, async () => Buffer.from('quota test'));
  }
});
it('preserves a READY artifact when the commit acknowledgement is lost', async () => {
  const row = await (await call('', 'POST', input())).json(),
    before = objects.size,
    originalFork = db.orm.em.fork.bind(db.orm.em);
  let armed = true;
  const spy = vi.spyOn(db.orm.em, 'fork').mockImplementation((...args) => {
    const em = originalFork(...args),
      transactional = em.transactional.bind(em);
    vi.spyOn(em, 'transactional').mockImplementation(async (callback) => {
      const value = await transactional(callback);
      if (value === true && armed) {
        armed = false;
        throw new Error('commit acknowledgement lost');
      }
      return value;
    });
    return em;
  });
  try {
    await service.generate(row.id, async () => Buffer.from('committed artifact'));
  } finally {
    spy.mockRestore();
    vi.restoreAllMocks();
  }
  expect((await (await call(`/${row.id}`)).json()).state).toBe('READY');
  expect(objects.size).toBe(before + 1);
});
it('rejects retry when three reports are already pending', async () => {
  const failed = await (await call('', 'POST', input())).json();
  failPut = true;
  await service.generate(failed.id, async () => Buffer.from('retry quota'));
  failPut = false;
  const pending = await Promise.all(
    [1, 2, 3].map(async () => (await call('', 'POST', input())).json()),
  );
  try {
    expect((await call(`/${failed.id}/retry`, 'POST')).status).toBe(409);
  } finally {
    for (const row of [...pending, failed])
      await service.generate(row.id, async () => Buffer.from('quota cleanup'));
  }
});
it('completes concurrent snapshot preparation with a two-connection pool', async () => {
  const url = new URL(db.orm.config.get('clientUrl')!);
  url.searchParams.set('application_name', 'reports-pool-test');
  const small = await MikroORM.init({
      ...createDatabaseOptions(url.toString()),
      pool: { min: 0, max: 2 },
    }),
    audit = new AuditService(small.em),
    reports = new ReportsService(small.em, new AccessPolicy(small.em, audit), audit, storage);
  const actor = {
    userId: users[1]!.id,
    role: 'COLLABORATOR' as const,
    sessionId: 'pool-test',
    mustChangePassword: false,
  };
  const run = Promise.allSettled([1, 2].map(() => reports.create(actor, input(), randomUUID())));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const completed = await Promise.race([
    run.then(() => true),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), 4000);
    }),
  ]);
  clearTimeout(timer);
  try {
    if (!completed)
      await db.orm.em
        .fork()
        .execute(
          "select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name='reports-pool-test'",
        );
    expect(completed).toBe(true);
    const rows = await run;
    expect(rows.every((r) => r.status === 'fulfilled')).toBe(true);
    for (const r of rows)
      if (r.status === 'fulfilled')
        await service.generate(r.value.id, async () => Buffer.from('pool test'));
  } finally {
    await small.close(true);
  }
}, 15000);
it('expires a reservation interrupted before its snapshot was prepared', async () => {
  const em = db.orm.em.fork(),
    row = new ReportRequest();
  Object.assign(row, {
    requestedBy: em.getReference(User, users[1]!.id),
    requestId: randomUUID(),
    requestHash: 'a'.repeat(64),
    format: 'PDF',
    createdAt: new Date(Date.now() - 16 * 60000),
  });
  em.persist(row);
  await em.flush();
  expect((await service.due()).some((r) => r.id === row.id)).toBe(false);
  const view = await (await call(`/${row.id}`)).json();
  expect(view.state).toBe('FAILED');
  expect(view.errorCode).toBe('REQUEST_INCOMPLETE');
  expect(view.canRetry).toBe(false);
});
it('rechecks access when generating and downloading, without exposing another recipient’s request', async () => {
  failPut = false;
  failRemove = false;
  expect((await call('', 'POST', input(), 2)).status).toBe(403);
  const queued = await (await call('', 'POST', input())).json();
  await db.orm.em.fork().execute('update sector_membership set is_active=false');
  await service.generate(queued.id, async () => {
    throw new Error('renderer must not run');
  });
  expect((await (await call(`/${queued.id}`)).json()).errorCode).toBe('ACCESS_CHANGED');
  const list = await (await call()).json(),
    ready = list.data.find((r: { state: string }) => r.state === 'READY');
  expect((await call(`/${ready.id}/download`, 'POST')).status).toBe(403);
  const other = await (await call('', 'GET', undefined, 2)).json();
  expect(other.total).toBe(1);
  expect(other.data[0].errorCode).toBe('ACCESS_CHANGED');
  expect(other.data.some((r: { id: string }) => r.id === ready.id)).toBe(false);
});
