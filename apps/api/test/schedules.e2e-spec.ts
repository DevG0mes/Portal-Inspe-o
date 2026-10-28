import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AccessPolicy } from '../src/access/access-policy.service.js';
import type { INestApplication } from '@nestjs/common';
import { createApplication } from '../src/app.js';
import { createTestDatabase } from './helpers/test-database.js';
import { User } from '../src/identity/user.entity.js';
import { Unit } from '../src/organization/unit.entity.js';
import { Sector } from '../src/organization/sector.entity.js';
import { UnitMembership, SectorMembership } from '../src/organization/membership.entity.js';
import { PasswordService } from '../src/auth/password.service.js';
import { RecurrenceService } from '../src/schedules/recurrence.service.js';
import { ScheduleService } from '../src/schedules/schedule.service.js';
import { AuditService } from '../src/audit/audit.service.js';
import { InspectionAssignment, InspectionSchedule } from '../src/schedules/schedule.entity.js';
import { materializationKey } from '@portal/scheduling';
import { definition, question } from './helpers/form-fixtures.js';
let database: Awaited<ReturnType<typeof createTestDatabase>>, app: INestApplication, origin: string;
let users: User[], unit: Unit, sector: Sector, outside: Sector, formId: string;
const cookies: string[] = [];
const startDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
beforeAll(async () => {
  database = await createTestDatabase();
  const em = database.orm.em.fork();
  const hash = await new PasswordService().hash('Senha de teste segura 2026!');
  users = ['ADMIN', 'MANAGER', 'COLLABORATOR', 'COLLABORATOR'].map((role, index) => {
    const user = new User();
    Object.assign(user, {
      name: `Pessoa ${index}`,
      email: `${randomUUID()}@example.test`,
      role,
      passwordHash: hash,
      mustChangePassword: false,
    });
    em.persist(user);
    return user;
  });
  unit = new Unit();
  unit.name = 'Unidade';
  unit.nameKey = 'unidade';
  sector = new Sector();
  sector.name = 'Setor';
  sector.nameKey = 'setor';
  sector.unit = unit;
  outside = new Sector();
  outside.name = 'Outro setor';
  outside.nameKey = 'outro';
  outside.unit = unit;
  em.persist([unit, sector, outside]);
  for (const user of users.slice(1, 3)) {
    const parent = new UnitMembership();
    parent.user = user;
    parent.unit = unit;
    const link = new SectorMembership();
    link.unitMembership = parent;
    link.sector = sector;
    em.persist([parent, link]);
  }
  await em.flush();
  app = await createApplication({}, undefined, database.orm);
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
  for (const user of users) {
    const response = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'Senha de teste segura 2026!' }),
    });
    cookies.push(response.headers.get('set-cookie')!.split(';')[0]!);
  }
  const created = await call('/forms', 'POST', { name: 'Ficha publicada' }, 0);
  const form = await created.json();
  formId = form.id;
  const draft = await (
    await call(
      `/forms/${formId}/draft`,
      'PUT',
      { revision: form.revision, snapshot: definition([question('YES_NO_NA')]) },
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
function input(extra: object = {}) {
  return {
    name: `Programa ${randomUUID()}`,
    unitId: unit.id,
    sectorId: sector.id,
    formId,
    responsibleIds: [users[2]!.id],
    frequency: 'DAILY',
    startDate,
    time: '12:00',
    deadlineHours: 24,
    ...extra,
  };
}
async function create(extra: object = {}) {
  const response = await call('/schedules', 'POST', input(extra));
  expect(response.status).toBe(201);
  return response.json();
}
it('materializes concurrent duplicate jobs exactly once, pins the version and computes the deadline', async () => {
  const schedule = await create();
  const recurrence = new RecurrenceService(database.orm.em, new AuditService(database.orm.em));
  const at = schedule.nextOccurrenceAt,
    key = materializationKey(schedule.id, at);
  const [a, b] = await Promise.all([
    recurrence.materialize(schedule.id, at, key),
    recurrence.materialize(schedule.id, at, key),
  ]);
  expect(a.id).toBe(b.id);
  expect(await database.orm.em.fork().count(InspectionAssignment, { schedule: schedule.id })).toBe(
    1,
  );
  expect(a.dueAt.getTime() - a.occurrenceAt.getTime()).toBe(24 * 3600000);
  await expect(recurrence.materialize(schedule.id, at, 'wrong')).rejects.toThrow();
  const rows = await (
    await call('/schedules/assignments?state=UPCOMING', 'GET', undefined, 2)
  ).json();
  expect(
    rows.data.some(
      (row: { id: string; formVersionNumber: number }) =>
        row.id === a.id && row.formVersionNumber === 1,
    ),
  ).toBe(true);
});
it('applies scope before candidates, schedules, assignments and totals', async () => {
  const response = await call(
    `/schedules/candidates?unitId=${unit.id}&sectorId=${sector.id}&pageSize=1`,
  );
  const page = await response.json();
  expect(page.total).toBe(3);
  expect(page.data).toHaveLength(1);
  expect(page.data[0]).not.toHaveProperty('email');
  expect(
    (await call(`/schedules/candidates?unitId=${unit.id}&sectorId=${outside.id}`)).status,
  ).toBe(403);
  expect((await call('/schedules', 'GET', undefined, 2)).status).toBe(403);
  expect(
    (await call('/schedules', 'POST', input({ sectorId: outside.id }))).status,
  ).toBeGreaterThanOrEqual(400);
  expect((await call('/schedules', 'POST', input({ responsibleIds: [users[3]!.id] }))).status).toBe(
    400,
  );
  expect((await (await call('/schedules/assignments', 'GET', undefined, 3)).json()).total).toBe(0);
});
it('pauses future assignments, resumes the same occurrence without duplicates and rejects stale revisions', async () => {
  const schedule = await create();
  const recurrence = new RecurrenceService(database.orm.em, new AuditService(database.orm.em));
  const at = schedule.nextOccurrenceAt;
  const original = await recurrence.materialize(
    schedule.id,
    at,
    materializationKey(schedule.id, at),
  );
  const paused = await (
    await call(`/schedules/${schedule.id}`, 'PATCH', {
      revision: schedule.revision,
      isActive: false,
    })
  ).json();
  expect(
    (await database.orm.em.fork().findOneOrFail(InspectionAssignment, original.id)).status,
  ).toBe('CANCELLED');
  expect(
    (
      await call(`/schedules/${schedule.id}`, 'PATCH', {
        revision: schedule.revision,
        name: 'Stale',
      })
    ).status,
  ).toBe(409);
  const resumed = await (
    await call(`/schedules/${schedule.id}`, 'PATCH', { revision: paused.revision, isActive: true })
  ).json();
  expect(resumed.nextOccurrenceAt).toBe(at);
  const restored = await recurrence.materialize(
    schedule.id,
    at,
    materializationKey(schedule.id, at),
  );
  expect(restored.id).toBe(original.id);
  expect(restored.status).toBe('PLANNED');
});
it('rejects invalid configurations and suspends rather than granting access to a disabled responsible', async () => {
  expect(
    (await call('/schedules', 'POST', input({ responsibleIds: [users[2]!.id, users[2]!.id] })))
      .status,
  ).toBe(400);
  expect((await call('/schedules', 'POST', input({ startDate: '2020-01-01' }))).status).toBe(400);
  const schedule = await create();
  const em = database.orm.em.fork();
  await em.nativeUpdate(User, users[2]!.id, { isActive: false });
  const recurrence = new RecurrenceService(database.orm.em, new AuditService(database.orm.em));
  await expect(
    recurrence.materialize(
      schedule.id,
      schedule.nextOccurrenceAt,
      materializationKey(schedule.id, schedule.nextOccurrenceAt),
    ),
  ).rejects.toThrow(/suspensa/);
  expect(
    (await em.findOneOrFail(InspectionSchedule, schedule.id, { refresh: true })).isActive,
  ).toBe(false);
  expect(await em.count(InspectionAssignment, { schedule: schedule.id })).toBe(0);
  expect((await call('/schedules/assignments', 'GET', undefined, 2)).status).toBe(401);
  await em.nativeUpdate(User, users[2]!.id, { isActive: true });
});
it('activating an active schedule does not rewind its cursor and a resumed planned occurrence advances', async () => {
  const schedule = await create();
  const recurrence = new RecurrenceService(database.orm.em, new AuditService(database.orm.em));
  const at = schedule.nextOccurrenceAt;
  await recurrence.materialize(schedule.id, at, materializationKey(schedule.id, at));
  const current = await (await call(`/schedules/${schedule.id}`)).json();
  const unchanged = await (
    await call(`/schedules/${schedule.id}`, 'PATCH', { revision: current.revision, isActive: true })
  ).json();
  expect(unchanged.nextOccurrenceAt).toBe(current.nextOccurrenceAt);
  const em = database.orm.em.fork();
  await em.nativeUpdate(InspectionSchedule, schedule.id, { isActive: false });
  const resumed = await (
    await call(`/schedules/${schedule.id}`, 'PATCH', {
      revision: unchanged.revision,
      isActive: true,
    })
  ).json();
  await recurrence.materialize(schedule.id, at, materializationKey(schedule.id, at));
  const advanced = await em.findOneOrFail(InspectionSchedule, schedule.id, { refresh: true });
  expect(advanced.nextOccurrenceAt!.getTime()).toBeGreaterThan(
    Date.parse(resumed.nextOccurrenceAt),
  );
});
it('revalidates a manager role changed between the initial check and locked refresh', async () => {
  const schedule = await create();
  const paused = await (
    await call(`/schedules/${schedule.id}`, 'PATCH', {
      revision: schedule.revision,
      isActive: false,
    })
  ).json();
  const original = AccessPolicy.prototype.requireRoles;
  let changed = false;
  let checks = 0;
  const spy = vi.spyOn(AccessPolicy.prototype, 'requireRoles').mockImplementation(async function (
    this: AccessPolicy,
    ...args: Parameters<typeof original>
  ) {
    const user = await original.apply(this, args);
    if (
      args[0].userId === users[1]!.id &&
      args[1].includes('MANAGER') &&
      ++checks === 2 &&
      !changed
    ) {
      changed = true;
      await database.orm.em.fork().nativeUpdate(User, users[1]!.id, { role: 'COLLABORATOR' });
    }
    return user;
  });
  try {
    expect(
      (
        await call(`/schedules/${schedule.id}`, 'PATCH', {
          revision: paused.revision,
          isActive: true,
        })
      ).status,
    ).toBe(403);
    expect(
      (await database.orm.em.fork().findOneOrFail(InspectionSchedule, schedule.id)).isActive,
    ).toBe(false);
  } finally {
    spy.mockRestore();
    await database.orm.em.fork().nativeUpdate(User, users[1]!.id, { role: 'MANAGER' });
  }
});
it('classifies pending and overdue assignments using a single server clock and current scope', async () => {
  const schedule = await create();
  const em = database.orm.em;
  const audit = new AuditService(em),
    access = new AccessPolicy(em, audit);
  const recurrence = new RecurrenceService(em, audit);
  const assigned = await recurrence.materialize(
    schedule.id,
    schedule.nextOccurrenceAt,
    materializationKey(schedule.id, schedule.nextOccurrenceAt),
  );
  const actor = {
    userId: users[2]!.id,
    role: 'COLLABORATOR' as const,
    sessionId: randomUUID(),
    mustChangePassword: false,
  };
  const pending = new ScheduleService(
    em,
    access,
    audit,
    () => new Date(assigned.occurrenceAt.getTime() + 3600000),
  );
  const overdue = new ScheduleService(
    em,
    access,
    audit,
    () => new Date(assigned.dueAt.getTime() + 1),
  );
  expect(
    (await pending.assignments(actor, { state: 'PENDING', pageSize: '100' }, randomUUID())).data,
  ).toContainEqual(expect.objectContaining({ id: assigned.id, state: 'PENDING' }));
  expect(
    (await overdue.assignments(actor, { state: 'OVERDUE', pageSize: '100' }, randomUUID())).data,
  ).toContainEqual(expect.objectContaining({ id: assigned.id, state: 'OVERDUE' }));
});
