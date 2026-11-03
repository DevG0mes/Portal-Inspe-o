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
import { FormTemplate } from '../src/forms/entities/form-template.entity.js';
import { FormVersion } from '../src/forms/entities/form-version.entity.js';
import { definition, question } from './helpers/form-fixtures.js';
import { DeadlineNotifications } from '../src/notifications/deadline-notifications.js';
let database: Awaited<ReturnType<typeof createTestDatabase>>, app: INestApplication, origin: string;
let users: User[], unit: Unit, sector: Sector, form: FormTemplate;
const item = question('YES_NO_NA', {
  label: 'Proteção instalada?',
  nonconformity: { operator: 'EQ', value: 'NO', category: 'Proteção', priority: 'HIGH' },
});
const objects = new Map<string, Buffer>(),
  otherQuestion = question('TEXT', { label: 'Outra pergunta', required: false }),
  cookies: string[] = [];
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=',
  'base64',
);
const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
beforeAll(async () => {
  database = await createTestDatabase();
  const em = database.orm.em.fork();
  const hash = await new PasswordService().hash('Senha segura de teste 2026!');
  users = ['ADMIN', 'MANAGER', 'MANAGER', 'COLLABORATOR'].map((role) => {
    const user = new User();
    Object.assign(user, {
      name: role,
      role,
      email: `${randomUUID()}@example.test`,
      passwordHash: hash,
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
  for (const user of users.slice(1, 3)) {
    const parent = new UnitMembership();
    Object.assign(parent, { user, unit });
    const child = new SectorMembership();
    Object.assign(child, { unitMembership: parent, sector });
    em.persist([parent, child]);
  }
  form = new FormTemplate();
  Object.assign(form, {
    name: 'Ficha',
    nameKey: 'ficha',
    state: 'PUBLISHED',
    latestVersion: 1,
    draftSnapshot: null,
  });
  const version = new FormVersion();
  Object.assign(version, {
    template: form,
    number: 1,
    snapshot: definition([item, otherQuestion]),
    contentHash: 'a'.repeat(64),
    publishedBy: users[0]!,
  });
  em.persist([form, version]);
  await em.flush();
  app = await createApplication({}, undefined, database.orm, undefined, {
    ensureBucket: async () => {},
    put: async (key, value) => {
      objects.set(key, value);
    },
    read: async (key) => {
      const value = objects.get(key);
      if (!value) throw new Error('Absent');
      return value;
    },
    copy: async (a, b) => {
      objects.set(b, objects.get(a)!);
    },
    remove: async (key) => {
      objects.delete(key);
    },
    downloadUrl: async () => 'http://127.0.0.1:9000/private/signed',
  });
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
  for (const user of users) {
    const response = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'Senha segura de teste 2026!' }),
    });
    cookies.push(response.headers.get('set-cookie')!.split(';')[0]!);
  }
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
async function occurrence() {
  const row = await (
    await call('/inspections', 'POST', { unitId: unit.id, sectorId: sector.id, formId: form.id }, 2)
  ).json();
  await call(
    `/inspections/${row.id}/draft`,
    'PUT',
    { revision: 1, answers: [{ questionId: item.id, value: 'NO' }] },
    2,
  );
  const completed = await (
    await call(`/inspections/${row.id}/complete`, 'POST', { revision: 2, cycle: 1 }, 2)
  ).json();
  return {
    sourceSubmissionId: completed.submissions[0].id,
    questionId: item.id,
    responsibleId: users[2]!.id,
    description: 'Instalar proteção coletiva no local',
    priority: 'HIGH',
    dueDate,
  };
}
async function create() {
  const response = await call('/action-plans', 'POST', await occurrence());
  expect(response.status).toBe(201);
  return response.json();
}
async function command(id: string, revision: number, type: string, extra: object = {}, user = 2) {
  return call(
    `/action-plans/${id}/commands`,
    'POST',
    { commandId: randomUUID(), revision, type, ...extra },
    user,
  );
}
it('emits due and overdue notices once per deadline, skips completed plans and respects current grants', async () => {
  const row = await create(),
    deadlines = new DeadlineNotifications(database.orm.em);
  const at = new Date(row.dueAt);
  await deadlines.run(new Date(at.getTime() - 3600000));
  await deadlines.run(new Date(at.getTime() - 3600000));
  await deadlines.run(new Date(at.getTime() + 1));
  await deadlines.run(new Date(at.getTime() + 1));
  const notices = (await (await call('/notifications?pageSize=100', 'GET', undefined, 2)).json())
    .data;
  expect(
    notices
      .filter((n: { resourceId: string }) => n.resourceId === row.id)
      .map((n: { kind: string }) => n.kind)
      .sort(),
  ).toEqual(['ACTION_ASSIGNED', 'ACTION_DUE', 'ACTION_OVERDUE']);
  await database.orm.em
    .fork()
    .execute(
      "update action_plan set state='COMPLETED',due_at=due_at+interval '2 days' where id=?",
      [row.id],
    );
  await deadlines.run(new Date(at.getTime() + 2 * 86400000));
  expect(
    (await (await call('/notifications?pageSize=100', 'GET', undefined, 2)).json()).data.filter(
      (n: { resourceId: string }) => n.resourceId === row.id,
    ),
  ).toHaveLength(3);
  await database.orm.em
    .fork()
    .execute("update action_plan set state='OPEN',responsible_id=? where id=?", [
      users[3]!.id,
      row.id,
    ]);
  await deadlines.run(new Date(at.getTime() + 2 * 86400000));
  expect((await (await call('/notifications', 'GET', undefined, 3)).json()).total).toBe(0);
  const em = database.orm.em.fork();
  await em.nativeUpdate(UnitMembership, { user: users[2]!.id, unit: unit.id }, { isActive: false });
  try {
    const oldRecipient = (
      await (await call('/notifications?pageSize=100', 'GET', undefined, 2)).json()
    ).data;
    expect(oldRecipient.filter((n: { resourceId: string }) => n.resourceId === row.id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ href: null })]),
    );
  } finally {
    await em.nativeUpdate(
      UnitMembership,
      { user: users[2]!.id, unit: unit.id },
      { isActive: true },
    );
  }
});
it('lists authorized occurrences, creates once per occurrence and denies collaborator management', async () => {
  const input = await occurrence();
  const list = await call('/action-plans/occurrences');
  expect(list.status).toBe(200);
  expect(
    (await list.json()).data.some(
      (row: { submissionId: string }) => row.submissionId === input.sourceSubmissionId,
    ),
  ).toBe(true);
  const results = await Promise.all([1, 2].map(() => call('/action-plans', 'POST', input)));
  expect(results.map((r) => r.status)).toEqual([201, 201]);
  const one = await results[0]!.json(),
    two = await results[1]!.json();
  expect(one.id).toBe(two.id);
  expect(one.state).toBe('OPEN');
  const notifications = await call('/notifications', 'GET', undefined, 2);
  expect(notifications.status).toBe(200);
  const notices = (await notifications.json()).data;
  expect(notices.find((n: { resourceId: string }) => n.resourceId === one.id).resourceTitle).toBe(
    one.description,
  );
  expect(notices.filter((n: { resourceId: string }) => n.resourceId === one.id)).toHaveLength(1);
  expect((await call('/action-plans', 'GET', undefined, 3)).status).toBe(403);
  expect((await call(`/action-plans/${one.id}`, 'GET', undefined, 3)).status).toBe(403);
  expect((await call('/action-plans', 'POST', await occurrence(), 3)).status).toBe(403);
});
it('requires correction evidence, records decisions immutably and retries commands without duplication', async () => {
  let row = await create();
  row = await (await command(row.id, row.revision, 'START')).json();
  expect(row.state).toBe('IN_PROGRESS');
  expect(
    (await command(row.id, row.revision, 'REQUEST_VALIDATION', { text: 'Correção executada' }))
      .status,
  ).toBe(400);
  const prepared = await call(
    '/files/prepare',
    'POST',
    {
      actionPlanId: row.id,
      questionId: item.id,
      revision: row.revision,
      filename: 'correcao.png',
      mime: 'image/png',
      size: bytes.length,
    },
    2,
  );
  expect(prepared.status).toBe(201);
  const file = await prepared.json();
  expect(
    (
      await fetch(`${origin}/api/files/${file.id}/content`, {
        method: 'PUT',
        headers: { cookie: cookies[2]!, 'content-type': 'application/octet-stream' },
        body: bytes,
      })
    ).status,
  ).toBe(200);
  const uploaded = await (
    await call(`/files/${file.id}/finalize`, 'POST', { revision: row.revision }, 2)
  ).json();
  row = await (
    await command(row.id, uploaded.revision, 'REQUEST_VALIDATION', {
      text: 'Proteção instalada e conferida',
    })
  ).json();
  expect(row.state).toBe('AWAITING_VALIDATION');
  expect((await command(row.id, row.revision, 'APPROVE', {}, 3)).status).toBe(403);
  expect((await command(row.id, row.revision, 'RETURN', { text: '' }, 1)).status).toBe(400);
  row = await (
    await command(row.id, row.revision, 'RETURN', { text: 'Ajustar fixação da proteção' }, 1)
  ).json();
  expect(row.state).toBe('IN_PROGRESS');
  row = await (
    await command(row.id, row.revision, 'REQUEST_VALIDATION', {
      text: 'Fixação ajustada e conferida',
    })
  ).json();
  const approve = { commandId: randomUUID(), revision: row.revision, type: 'APPROVE' };
  const approved = await call(`/action-plans/${row.id}/commands`, 'POST', approve, 1);
  expect(approved.status).toBe(201);
  row = await approved.json();
  expect(row.state).toBe('COMPLETED');
  expect(row.overdue).toBe(false);
  const repeated = await (
    await call(`/action-plans/${row.id}/commands`, 'POST', approve, 1)
  ).json();
  expect(repeated.revision).toBe(row.revision);
  expect(repeated.history.total).toBe(6);
  const responsibleNotices = (await (await call('/notifications', 'GET', undefined, 2)).json())
    .data;
  expect(
    responsibleNotices
      .filter((n: { resourceId: string }) => n.resourceId === row.id)
      .map((n: { kind: string }) => n.kind)
      .sort(),
  ).toEqual([
    'ACTION_APPROVED',
    'ACTION_ASSIGNED',
    'ACTION_RETURNED',
    'ACTION_REVIEW',
    'ACTION_REVIEW',
  ]);
  const managerNotices = (await (await call('/notifications')).json()).data;
  expect(
    managerNotices.filter(
      (n: { resourceId: string }) => n.resourceId === row.id && n.kind === 'ACTION_REVIEW',
    ),
  ).toHaveLength(2);
  expect((await command(row.id, 1, 'COMMENT', { text: 'Comentário antigo' })).status).toBe(409);
  await expect(
    database.orm.em
      .fork()
      .execute('update action_plan_event set text=? where action_plan_id=?', ['alterado', row.id]),
  ).rejects.toThrow(/immutable/i);
  expect(
    (await call(`/files/${file.id}/detach`, 'POST', { revision: row.revision }, 2)).status,
  ).toBe(409);
});
it('rejects concurrent stale mutations and candidates without current sector access', async () => {
  const row = await create();
  const results = await Promise.all([1, 2].map(() => command(row.id, row.revision, 'START')));
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  const current = await (await call(`/action-plans/${row.id}`)).json();
  expect(
    (
      await command(
        row.id,
        current.revision,
        'ASSIGN',
        { responsibleId: users[3]!.id, description: row.description, priority: 'HIGH', dueDate },
        1,
      )
    ).status,
  ).toBe(400);
  const assigned = await command(
    row.id,
    current.revision,
    'ASSIGN',
    {
      responsibleId: users[2]!.id,
      description: 'Descrição revisada para histórico',
      priority: 'CRITICAL',
      dueDate,
    },
    1,
  );
  expect(assigned.status).toBe(201);
  const changed = await assigned.json();
  expect(changed.history.data[0]).toMatchObject({
    type: 'ASSIGN',
    text: 'Descrição revisada para histórico',
    assignment: { responsibleId: users[2]!.id, dueDate, priority: 'CRITICAL' },
  });
});
it('rejects assignment to collaborators and prevents legacy assignments exposing source evidence', async () => {
  const em = database.orm.em.fork();
  const parent = new UnitMembership();
  Object.assign(parent, { user: users[3]!, unit });
  const membership = new SectorMembership();
  Object.assign(membership, { unitMembership: parent, sector });
  em.persist([parent, membership]);
  await em.flush();
  const inspection = await (
    await call('/inspections', 'POST', { unitId: unit.id, sectorId: sector.id, formId: form.id }, 2)
  ).json();
  let revision = 1;
  const ids: string[] = [];
  for (const questionId of [item.id, otherQuestion.id]) {
    const file = await (
      await call(
        '/files/prepare',
        'POST',
        {
          inspectionId: inspection.id,
          questionId,
          revision,
          filename: 'origem.png',
          mime: 'image/png',
          size: bytes.length,
        },
        2,
      )
    ).json();
    await fetch(`${origin}/api/files/${file.id}/content`, {
      method: 'PUT',
      headers: { cookie: cookies[2]!, 'content-type': 'application/octet-stream' },
      body: bytes,
    });
    const receipt = await (
      await call(`/files/${file.id}/finalize`, 'POST', { revision }, 2)
    ).json();
    revision = receipt.revision;
    ids.push(file.id);
  }
  const saved = await (
    await call(
      `/inspections/${inspection.id}/draft`,
      'PUT',
      { revision, answers: [{ questionId: item.id, value: 'NO' }] },
      2,
    )
  ).json();
  const completed = await (
    await call(
      `/inspections/${inspection.id}/complete`,
      'POST',
      { revision: saved.revision, cycle: 1 },
      2,
    )
  ).json();
  const input = {
    sourceSubmissionId: completed.submissions[0].id,
    questionId: item.id,
    responsibleId: users[3]!.id,
    description: 'Instalar a proteção',
    priority: 'HIGH',
    dueDate,
  };
  expect((await call('/action-plans', 'POST', input)).status).toBe(400);
  const created = await call('/action-plans', 'POST', { ...input, responsibleId: users[2]!.id });
  expect(created.status).toBe(201);
  const plan = await created.json();
  expect(plan.sourceEvidence).toHaveLength(1);
  await em.execute('update action_plan set responsible_id=? where id=?', [users[3]!.id, plan.id]);
  expect((await call(`/inspections/${inspection.id}`, 'GET', undefined, 3)).status).toBe(403);
  expect((await call(`/files/${ids[0]}/download`, 'GET', undefined, 3)).status).toBe(403);
  expect((await call(`/files/${ids[1]}/download`, 'GET', undefined, 3)).status).toBe(403);
  membership.isActive = false;
  await em.flush();
  expect((await call(`/files/${ids[0]}/download`, 'GET', undefined, 3)).status).toBe(403);
  expect((await call(`/action-plans/${plan.id}`, 'GET', undefined, 3)).status).toBe(403);
  expect((await command(plan.id, plan.revision, 'START', {}, 3)).status).toBe(403);
});
