import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createApplication } from '../src/app.js';
import { createTestDatabase } from './helpers/test-database.js';
import { User } from '../src/identity/user.entity.js';
import { Unit } from '../src/organization/unit.entity.js';
import { Sector } from '../src/organization/sector.entity.js';
import { UnitMembership, SectorMembership } from '../src/organization/membership.entity.js';
import { PasswordService } from '../src/auth/password.service.js';
import { definition, question } from './helpers/form-fixtures.js';
import { AuditEvent } from '../src/audit/audit-event.entity.js';
import { RecurrenceService } from '../src/schedules/recurrence.service.js';
import { AuditService } from '../src/audit/audit.service.js';
import { InspectionAssignment } from '../src/schedules/schedule.entity.js';
import { materializationKey } from '@portal/scheduling';
import { EvidenceArtifact } from '../src/files/file.entity.js';
import { FileService } from '../src/files/file.service.js';

let database: Awaited<ReturnType<typeof createTestDatabase>>, app: INestApplication, origin: string;
let unit: Unit, sector: Sector, formId: string;
let users: User[];
const cookies: string[] = [];
const objects = new Map<string, Buffer>();
let failCopyAfterWrite = false,
  failRemoveKey: string | undefined;
const storage = {
  ensureBucket: async () => {},
  put: async (key: string, bytes: Buffer) => {
    objects.set(key, Buffer.from(bytes));
  },
  read: async (key: string) => {
    const bytes = objects.get(key);
    if (!bytes) throw new Error('Object absent');
    return bytes;
  },
  copy: async (source: string, target: string) => {
    const bytes = objects.get(source);
    if (!bytes) throw new Error('Object absent');
    objects.set(target, Buffer.from(bytes));
    if (failCopyAfterWrite) throw new Error('Simulated copy response failure');
  },
  remove: async (key: string) => {
    if (key === failRemoveKey) throw new Error('Simulated storage deletion failure');
    objects.delete(key);
  },
  downloadUrl: async () => 'http://127.0.0.1:9000/private/signed',
};
const first = question('YES_NO_NA');
const hidden = question('TEXT');
first.required = true;
first.nonconformity = { operator: 'EQ', value: 'NO', category: 'Segurança', priority: 'HIGH' };
hidden.required = true;
hidden.visibleWhen = [{ questionId: first.id, operator: 'EQ', value: 'YES' }];
beforeAll(async () => {
  database = await createTestDatabase();
  const em = database.orm.em.fork();
  const digest = await new PasswordService().hash('Senha de teste segura 2026!');
  users = ['ADMIN', 'COLLABORATOR', 'COLLABORATOR', 'MANAGER'].map((role) => {
    const user = new User();
    Object.assign(user, {
      name: 'Pessoa teste',
      email: `${randomUUID()}@psi.test`,
      role,
      passwordHash: digest,
      mustChangePassword: false,
    });
    em.persist(user);
    return user;
  });
  unit = new Unit();
  Object.assign(unit, { name: 'Unidade', nameKey: 'unidade' });
  sector = new Sector();
  Object.assign(sector, { name: 'Setor', nameKey: 'setor', unit });
  em.persist([unit, sector]);
  for (const user of [users[1]!, users[3]!]) {
    const parent = new UnitMembership();
    Object.assign(parent, { user, unit });
    const child = new SectorMembership();
    Object.assign(child, { unitMembership: parent, sector });
    em.persist([parent, child]);
  }
  await em.flush();
  app = await createApplication({}, undefined, database.orm, undefined, storage);
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
  for (const user of users) {
    const res = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'Senha de teste segura 2026!' }),
    });
    cookies.push(res.headers.get('set-cookie')!.split(';')[0]!);
  }
  const form = await (await call('/forms', 'POST', { name: 'Execução' }, 0)).json();
  formId = form.id;
  const draft = await (
    await call(
      `/forms/${formId}/draft`,
      'PUT',
      { revision: form.revision, snapshot: definition([first, hidden]) },
      0,
    )
  ).json();
  expect(
    (await call(`/forms/${formId}/publish`, 'POST', { revision: draft.revision }, 0)).status,
  ).toBe(200);
}, 30000);
afterAll(async () => {
  await app?.close();
  await database?.close();
});
function call(path: string, method = 'GET', body?: unknown, user = 1) {
  return fetch(`${origin}/api${path}`, {
    method,
    headers: {
      cookie: cookies[user]!,
      ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}),
    },
    ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
}
async function create() {
  const res = await call('/inspections', 'POST', { unitId: unit.id, sectorId: sector.id, formId });
  expect(res.status).toBe(201);
  return res.json();
}
it('saves question notes with the draft revision and freezes only visible notes on completion', async () => {
  const row = await create();
  const response = await call(`/inspections/${row.id}/draft`, 'PUT', {
    revision: 1,
    answers: [{ questionId: first.id, value: 'NO' }],
    notes: [
      { questionId: first.id, text: 'Proteção ausente' },
      { questionId: hidden.id, text: 'Nota oculta' },
    ],
  });
  expect(response.status).toBe(200);
  const saved = await response.json();
  expect(saved.notes).toHaveLength(2);
  const completed = await (
    await call(`/inspections/${row.id}/complete`, 'POST', { revision: saved.revision, cycle: 1 })
  ).json();
  expect(completed.submissions[0].notes).toEqual([
    { questionId: first.id, text: 'Proteção ausente' },
  ]);
});
it('prepares private evidence, rejects unauthorized or absent objects and finalizes once per revision', async () => {
  const row = await create();
  await call(`/inspections/${row.id}/draft`, 'PUT', {
    revision: 1,
    answers: [{ questionId: first.id, value: 'NO' }],
  });
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=',
    'base64',
  );
  const prepared = await call('/files/prepare', 'POST', {
    inspectionId: row.id,
    questionId: first.id,
    revision: 2,
    filename: 'foto.png',
    mime: 'image/png',
    size: bytes.length,
  });
  expect(prepared.status).toBe(201);
  const file = await prepared.json();
  expect(
    (
      await call('/files/prepare', 'POST', {
        inspectionId: row.id,
        questionId: hidden.id,
        revision: 2,
        filename: 'oculta.png',
        mime: 'image/png',
        size: bytes.length,
      })
    ).status,
  ).toBe(409);
  expect(file).not.toHaveProperty('tempKey');
  expect((await call(`/files/${file.id}/finalize`, 'POST', { revision: 2 })).status).toBe(409);
  expect((await call(`/files/${file.id}/finalize`, 'POST', { revision: 2 }, 2)).status).toBe(403);
  const uploaded = await fetch(`${origin}/api/files/${file.id}/content`, {
    method: 'PUT',
    headers: { cookie: cookies[1]!, 'content-type': 'application/octet-stream' },
    body: bytes,
  });
  expect(uploaded.status).toBe(200);
  const responses = await Promise.all(
    [1, 2].map(() => call(`/files/${file.id}/finalize`, 'POST', { revision: 2 })),
  );
  expect(responses.map((r) => r.status)).toEqual([201, 201]);
  const receipt = await responses[0]!.json();
  expect(receipt.revision).toBe(3);
  expect(receipt.files).toHaveLength(1);
  const completed = await (
    await call(`/inspections/${row.id}/complete`, 'POST', { revision: 3, cycle: 1 })
  ).json();
  expect(completed.submissions[0].evidence).toHaveLength(1);
  expect(completed.submissions[0].evidence[0]).toMatchObject({
    id: file.id,
    questionId: first.id,
    filename: 'foto.png',
  });
  expect((await call(`/files/${file.id}/download`, 'GET', undefined, 2)).status).toBe(403);
  expect((await call(`/files/${file.id}/download`)).status).toBe(200);
  expect(
    (await call(`/files/${file.id}/detach`, 'POST', { revision: completed.revision })).status,
  ).toBe(409);
});

it('deduplicates preparation and rejects forged binary content and completion with a pending upload', async () => {
  const row = await create();
  await call(`/inspections/${row.id}/draft`, 'PUT', {
    revision: 1,
    answers: [{ questionId: first.id, value: 'NO' }],
  });
  const body = {
    uploadId: randomUUID(),
    inspectionId: row.id,
    questionId: first.id,
    revision: 2,
    filename: 'foto.png',
    mime: 'image/png',
    size: 68,
  };
  const one = await (await call('/files/prepare', 'POST', body)).json();
  const two = await (await call('/files/prepare', 'POST', body)).json();
  expect(two.id).toBe(one.id);
  const invalid = await fetch(`${origin}/api/files/${one.id}/content`, {
    method: 'PUT',
    headers: { cookie: cookies[1]!, 'content-type': 'application/octet-stream' },
    body: Buffer.from('<html>fake</html>'),
  });
  expect(invalid.status).toBe(400);
  expect(
    (await call(`/inspections/${row.id}/complete`, 'POST', { revision: 2, cycle: 1 })).status,
  ).toBe(409);
  expect(
    (
      await call('/files/prepare', 'POST', {
        ...body,
        uploadId: randomUUID(),
        filename: 'arquivo.svg',
        mime: 'image/svg+xml',
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call('/files/prepare', 'POST', {
        ...body,
        uploadId: randomUUID(),
        size: 26 * 1024 * 1024,
      })
    ).status,
  ).toBe(400);
  const removed = await (await call(`/files/${one.id}/detach`, 'POST', { revision: 2 })).json();
  expect(removed.revision).toBe(3);
  const repeated = await (await call(`/files/${one.id}/detach`, 'POST', { revision: 2 })).json();
  expect(repeated.revision).toBe(3);
  expect(repeated.files).toHaveLength(0);
});

it('compensates a partially successful promotion and allows a safe retry', async () => {
  const row = await create(),
    bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=',
      'base64',
    );
  const prepared = await (
    await call('/files/prepare', 'POST', {
      inspectionId: row.id,
      questionId: first.id,
      revision: 1,
      filename: 'foto.png',
      mime: 'image/png',
      size: bytes.length,
    })
  ).json();
  await fetch(`${origin}/api/files/${prepared.id}/content`, {
    method: 'PUT',
    headers: { cookie: cookies[1]!, 'content-type': 'application/octet-stream' },
    body: bytes,
  });
  const file = await database.orm.em.fork().findOneOrFail(EvidenceArtifact, prepared.id);
  failCopyAfterWrite = true;
  try {
    expect((await call(`/files/${file.id}/finalize`, 'POST', { revision: 1 })).status).toBe(503);
  } finally {
    failCopyAfterWrite = false;
  }
  expect(objects.has(file.finalKey)).toBe(false);
  expect(objects.has(file.tempKey)).toBe(true);
  expect((await database.orm.em.fork().findOneOrFail(EvidenceArtifact, file.id)).status).toBe(
    'UPLOADED',
  );
  expect((await call(`/files/${file.id}/finalize`, 'POST', { revision: 1 })).status).toBe(201);
  expect(objects.has(file.finalKey)).toBe(true);
});

it('serializes evidence finalization against completion of the same revision', async () => {
  const row = await create(),
    bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=',
      'base64',
    );
  await call(`/inspections/${row.id}/draft`, 'PUT', {
    revision: 1,
    answers: [{ questionId: first.id, value: 'NO' }],
  });
  const file = await (
    await call('/files/prepare', 'POST', {
      inspectionId: row.id,
      questionId: first.id,
      revision: 2,
      filename: 'foto.png',
      mime: 'image/png',
      size: bytes.length,
    })
  ).json();
  await fetch(`${origin}/api/files/${file.id}/content`, {
    method: 'PUT',
    headers: { cookie: cookies[1]!, 'content-type': 'application/octet-stream' },
    body: bytes,
  });
  const results = await Promise.all([
    call(`/files/${file.id}/finalize`, 'POST', { revision: 2 }),
    call(`/inspections/${row.id}/complete`, 'POST', { revision: 2, cycle: 1 }),
  ]);
  expect(results.map((response) => response.status)).toEqual([201, 409]);
  const completed = await (
    await call(`/inspections/${row.id}/complete`, 'POST', { revision: 3, cycle: 1 })
  ).json();
  expect(completed.submissions[0].evidence.map((evidence: { id: string }) => evidence.id)).toEqual([
    file.id,
  ]);
});

it('enforces the per-question upload count before transferring any objects', async () => {
  const row = await create();
  for (let index = 0; index < 6; index++) {
    const response = await call('/files/prepare', 'POST', {
      inspectionId: row.id,
      questionId: first.id,
      revision: 1,
      filename: `foto${index}.png`,
      mime: 'image/png',
      size: 68,
    });
    expect(response.status).toBe(index < 5 ? 201 : 400);
  }
});

it('cleans expired temporary and orphan promotion keys, retries failures and retains completed evidence', async () => {
  const row = await create();
  const prepared = await (
    await call('/files/prepare', 'POST', {
      inspectionId: row.id,
      questionId: first.id,
      revision: 1,
      filename: 'foto.png',
      mime: 'image/png',
      size: 68,
    })
  ).json();
  const em = database.orm.em.fork(),
    file = await em.findOneOrFail(EvidenceArtifact, prepared.id);
  file.expiresAt = new Date(Date.now() - 1000);
  await em.flush();
  objects.set(file.tempKey, Buffer.from('temporary'));
  objects.set(file.finalKey, Buffer.from('orphan'));
  failRemoveKey = file.tempKey;
  try {
    await expect(app.get(FileService).cleanup()).rejects.toThrow();
  } finally {
    failRemoveKey = undefined;
  }
  await app.get(FileService).cleanup();
  expect(objects.has(file.tempKey)).toBe(false);
  expect(objects.has(file.finalKey)).toBe(false);
  expect((await em.fork().findOneOrFail(EvidenceArtifact, file.id)).status).toBe('CLEANED');
  const ready = await em.fork().findOneOrFail(EvidenceArtifact, { status: 'READY' });
  await em.fork().nativeUpdate(EvidenceArtifact, ready.id, { tempCleaned: false });
  objects.set(ready.tempKey, Buffer.from('leftover'));
  await app.get(FileService).cleanup();
  expect(objects.has(ready.tempKey)).toBe(false);
  expect(objects.has(ready.finalKey)).toBe(true);
});
it('creates a pinned draft and enforces current scope on every operation', async () => {
  const row = await create();
  expect(row).toMatchObject({ revision: 1, cycle: 1, state: 'DRAFT', formVersionNumber: 1 });
  expect((await call(`/inspections/${row.id}`, 'GET', undefined, 2)).status).toBe(403);
  expect(
    (await call('/inspections', 'POST', { unitId: unit.id, sectorId: sector.id, formId }, 2))
      .status,
  ).toBe(403);
  expect((await call(`/inspections/${row.id}`, 'GET', undefined, 3)).status).toBe(200);
  expect(row).toMatchObject({ canEdit: true, canReopen: false });
  const manager = await (await call(`/inspections/${row.id}`, 'GET', undefined, 3)).json();
  expect(manager).toMatchObject({ canEdit: false, canReopen: true });
});

it('paginates scoped inspection summaries without snapshots or other peoples answers', async () => {
  const row = await create();
  const response = await call('/inspections?pageSize=1&state=DRAFT');
  expect(response.status).toBe(200);
  const list = await response.json();
  expect(list.total).toBeGreaterThan(0);
  expect(list.data).toHaveLength(1);
  expect(list.data[0]).toMatchObject({
    unitName: 'Unidade',
    sectorName: 'Setor',
    title: 'Inspeção de segurança',
    state: 'DRAFT',
  });
  expect(list.data[0]).not.toHaveProperty('snapshot');
  expect(list.data[0]).not.toHaveProperty('answers');
  const outside = await (await call('/inspections', 'GET', undefined, 2)).json();
  expect(outside.total).toBe(0);
  expect((await call(`/inspections/${row.id}`, 'GET', undefined, 2)).status).toBe(403);
});
it('serializes concurrent autosaves and rejects stale revisions without losing the winner', async () => {
  const row = await create();
  const responses = await Promise.all(
    ['NO', 'YES'].map((value) =>
      call(`/inspections/${row.id}/draft`, 'PUT', {
        revision: 1,
        answers: [{ questionId: first.id, value }],
      }),
    ),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const saved = await (await call(`/inspections/${row.id}`)).json();
  expect(saved.revision).toBe(2);
  expect(saved.answers).toHaveLength(1);
});

it('does not allow an autosave to modify a concurrent completed submission', async () => {
  const row = await create();
  await call(`/inspections/${row.id}/draft`, 'PUT', {
    revision: 1,
    answers: [{ questionId: first.id, value: 'NO' }],
  });
  const results = await Promise.all([
    call(`/inspections/${row.id}/complete`, 'POST', { revision: 2, cycle: 1 }),
    call(`/inspections/${row.id}/draft`, 'PUT', {
      revision: 2,
      answers: [{ questionId: first.id, value: 'YES' }],
    }),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.filter((r) => r.status === 409)).toHaveLength(1);
  const actual = await (await call(`/inspections/${row.id}`)).json();
  if (actual.state === 'COMPLETED') {
    expect(actual.submissions[0].answers).toEqual([{ questionId: first.id, value: 'NO' }]);
  } else {
    expect(actual.submissions).toHaveLength(0);
    expect(actual.answers).toEqual([{ questionId: first.id, value: 'YES' }]);
  }
});

it('denies an unrelated collaborator even with an active grant to the same sector', async () => {
  const row = await create(),
    em = database.orm.em.fork();
  const parent = new UnitMembership();
  Object.assign(parent, { user: users[2]!, unit });
  const link = new SectorMembership();
  Object.assign(link, { unitMembership: parent, sector });
  em.persist([parent, link]);
  await em.flush();
  try {
    expect((await call(`/inspections/${row.id}`, 'GET', undefined, 2)).status).toBe(403);
    expect(
      (await call(`/inspections/${row.id}/draft`, 'PUT', { revision: 1, answers: [] }, 2)).status,
    ).toBe(403);
  } finally {
    link.isActive = false;
    await em.flush();
  }
});
it('recalculates required answers, strips hidden values and creates deterministic occurrences once', async () => {
  const row = await create();
  expect(
    (await call(`/inspections/${row.id}/complete`, 'POST', { revision: 1, cycle: 1 })).status,
  ).toBe(400);
  const saved = await (
    await call(`/inspections/${row.id}/draft`, 'PUT', {
      revision: 1,
      answers: [
        { questionId: first.id, value: 'NO' },
        { questionId: hidden.id, value: 'Oculta' },
      ],
    })
  ).json();
  const responses = await Promise.all(
    [1, 2].map(() =>
      call(`/inspections/${row.id}/complete`, 'POST', { revision: saved.revision, cycle: 1 }),
    ),
  );
  expect(responses.map((r) => r.status)).toEqual([201, 201]);
  const completed = await responses[0]!.json();
  expect(completed.answers).toEqual([{ questionId: first.id, value: 'NO' }]);
  expect(completed.submissions).toHaveLength(1);
  expect(completed.submissions[0].nonconformities).toHaveLength(1);
  expect(
    (
      await call(`/inspections/${row.id}/draft`, 'PUT', {
        revision: completed.revision,
        answers: [],
      })
    ).status,
  ).toBe(409);
  await expect(
    database.orm.em
      .fork()
      .execute('update inspection_submission set cycle=42 where inspection_id=?', [row.id]),
  ).rejects.toThrow(/immutable/i);
});
it('requires authorized justified reopening and preserves previous submissions', async () => {
  const row = await create();
  await call(`/inspections/${row.id}/draft`, 'PUT', {
    revision: 1,
    answers: [{ questionId: first.id, value: 'NO' }],
  });
  const completed = await (
    await call(`/inspections/${row.id}/complete`, 'POST', { revision: 2, cycle: 1 })
  ).json();
  const body = { revision: completed.revision, reason: 'Corrigir informação da inspeção' };
  expect((await call(`/inspections/${row.id}/reopen`, 'POST', body)).status).toBe(403);
  expect(
    (await call(`/inspections/${row.id}/reopen`, 'POST', { ...body, reason: '' }, 3)).status,
  ).toBe(400);
  const reopened = await (await call(`/inspections/${row.id}/reopen`, 'POST', body, 3)).json();
  expect(reopened.cycle).toBe(2);
  expect(reopened.submissions).toHaveLength(1);
  expect(
    (await call(`/inspections/${row.id}/complete`, 'POST', { revision: 2, cycle: 1 })).status,
  ).toBe(409);
  const final = await (
    await call(`/inspections/${row.id}/complete`, 'POST', { revision: reopened.revision, cycle: 2 })
  ).json();
  expect(final.submissions).toHaveLength(2);
  expect(final.submissions[0].answers).toEqual([{ questionId: first.id, value: 'NO' }]);
  const audit = await database.orm.em
    .fork()
    .findOneOrFail(AuditEvent, { action: 'inspection.reopened', resourceId: row.id });
  expect(audit.changes.reason).toBe(body.reason);
});

it('shares one assigned inspection, prevents early starts and keeps its pinned version after a new publication', async () => {
  const created = await call(
    '/schedules',
    'POST',
    {
      name: 'Inspeção compartilhada',
      unitId: unit.id,
      sectorId: sector.id,
      formId,
      responsibleIds: [users[1]!.id, users[3]!.id],
      frequency: 'ONCE',
      startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      time: '12:00',
      deadlineHours: 24,
    },
    0,
  );
  expect(created.status).toBe(201);
  const schedule = await created.json();
  const assignment = await new RecurrenceService(
    database.orm.em,
    new AuditService(database.orm.em),
  ).materialize(
    schedule.id,
    schedule.nextOccurrenceAt,
    materializationKey(schedule.id, schedule.nextOccurrenceAt),
  );
  const input = { assignmentId: assignment.id };
  expect((await call('/inspections', 'POST', input)).status).toBe(409);
  expect((await call('/inspections', 'POST', input, 0)).status).toBe(403);
  await database.orm.em.fork().nativeUpdate(InspectionAssignment, assignment.id, {
    occurrenceAt: new Date(Date.now() - 1000),
  });
  const current = await (await call(`/forms/${formId}`, 'GET', undefined, 0)).json();
  const draft = await (
    await call(`/forms/${formId}/draft`, 'POST', { revision: current.revision }, 0)
  ).json();
  draft.snapshot.title = 'Nova versão depois da atribuição';
  const edited = await (
    await call(
      `/forms/${formId}/draft`,
      'PUT',
      { revision: draft.revision, snapshot: draft.snapshot },
      0,
    )
  ).json();
  expect(
    (await call(`/forms/${formId}/publish`, 'POST', { revision: edited.revision }, 0)).status,
  ).toBe(200);
  const results = await Promise.all(
    [1, 3].map((user) => call('/inspections', 'POST', input, user)),
  );
  expect(results.map((r) => r.status)).toEqual([201, 201]);
  const a = await results[0]!.json(),
    b = await results[1]!.json();
  expect(a.id).toBe(b.id);
  expect(a.formVersionNumber).toBe(1);
  const assignments = await (await call('/schedules/assignments')).json();
  expect(assignments.data.find((item: { id: string }) => item.id === assignment.id)).toMatchObject({
    inspectionId: a.id,
    inspectionState: 'DRAFT',
    canStart: false,
  });
  expect(a.snapshot.title).toBe('Inspeção de segurança');
  expect((await create()).formVersionNumber).toBe(2);
  expect(
    (
      await call(
        `/inspections/${a.id}/draft`,
        'PUT',
        { revision: a.revision, answers: [{ questionId: first.id, value: 'NO' }] },
        3,
      )
    ).status,
  ).toBe(200);
  const owned = await (
    await call('/files/prepare', 'POST', {
      inspectionId: a.id,
      questionId: first.id,
      revision: 2,
      filename: 'outro-responsavel.png',
      mime: 'image/png',
      size: 68,
    })
  ).json();
  expect((await call(`/files/${owned.id}/finalize`, 'POST', { revision: 2 }, 3)).status).toBe(403);
  const denied = await fetch(`${origin}/api/files/${owned.id}/content`, {
    method: 'PUT',
    headers: { cookie: cookies[3]!, 'content-type': 'application/octet-stream' },
    body: Buffer.alloc(68),
  });
  expect(denied.status).toBe(403);
});

it('rejects invalid answer shapes, unknown questions and computed client results', async () => {
  const row = await create();
  for (const answers of [
    [{ questionId: randomUUID(), value: 'NO' }],
    [
      { questionId: first.id, value: 'NO' },
      { questionId: first.id, value: 'YES' },
    ],
  ]) {
    expect(
      (await call(`/inspections/${row.id}/draft`, 'PUT', { revision: 1, answers })).status,
    ).toBe(400);
  }
  expect(
    (
      await call(`/inspections/${row.id}/complete`, 'POST', {
        revision: 1,
        cycle: 1,
        nonconformities: [],
      })
    ).status,
  ).toBe(400);
  const saved = await (
    await call(`/inspections/${row.id}/draft`, 'PUT', {
      revision: 1,
      answers: [{ questionId: first.id, value: 'INVALID' }],
    })
  ).json();
  expect(
    (await call(`/inspections/${row.id}/complete`, 'POST', { revision: saved.revision, cycle: 1 }))
      .status,
  ).toBe(400);
});

it('immediately denies reads and writes after a sector grant is revoked', async () => {
  const row = await create();
  const em = database.orm.em.fork();
  const membership = await em.findOneOrFail(SectorMembership, {
    sector: sector.id,
    unitMembership: { user: users[1]!.id },
  });
  membership.isActive = false;
  await em.flush();
  try {
    expect((await call(`/inspections/${row.id}`)).status).toBe(403);
    expect(
      (await call(`/inspections/${row.id}/draft`, 'PUT', { revision: 1, answers: [] })).status,
    ).toBe(403);
  } finally {
    membership.isActive = true;
    await em.flush();
  }
});

it('revalidates scope after waiting for a concurrent organizational mutation', async () => {
  const locker = database.orm.em.fork();
  await locker.begin();
  await locker.execute('select id from organization_unit where id=? for no key update', [unit.id]);
  let settled = false;
  const pending = call('/inspections', 'POST', {
    unitId: unit.id,
    sectorId: sector.id,
    formId,
  }).then((response) => {
    settled = true;
    return response;
  });
  try {
    await expect
      .poll(async () => {
        const waiting = await database.orm.em
          .fork()
          .execute<
            { count: string }[]
          >("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query ilike '%organization_unit%'");
        return settled || Number(waiting[0]!.count) > 0;
      })
      .toBe(true);
    await locker.nativeUpdate(Unit, unit.id, { isActive: false });
    await locker.commit();
    expect((await pending).status).toBe(403);
  } finally {
    if (locker.isInTransaction()) await locker.rollback();
    await pending;
    await database.orm.em.fork().nativeUpdate(Unit, unit.id, { isActive: true });
  }
});
