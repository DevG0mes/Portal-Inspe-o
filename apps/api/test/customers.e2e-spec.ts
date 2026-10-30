import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestDatabase } from './helpers/test-database.js';
import { createApplication } from '../src/app.js';
import { User } from '../src/identity/user.entity.js';
import { Unit } from '../src/organization/unit.entity.js';
import { UnitMembership } from '../src/organization/membership.entity.js';
import { SectorMembership } from '../src/organization/membership.entity.js';
import { Sector } from '../src/organization/sector.entity.js';
import { definition, question } from './helpers/form-fixtures.js';
import { PasswordService } from '../src/auth/password.service.js';
import { RecurrenceService } from '../src/schedules/recurrence.service.js';
import { InspectionAssignment } from '../src/schedules/schedule.entity.js';
import { AuditService } from '../src/audit/audit.service.js';
import { materializationKey } from '@portal/scheduling';
import { Inspection } from '../src/inspections/inspection.entity.js';
let db: Awaited<ReturnType<typeof createTestDatabase>>, app: INestApplication, origin: string;
const units: Unit[] = [],
  cookies: string[] = [],
  users: User[] = [];
beforeAll(async () => {
  db = await createTestDatabase();
  const em = db.orm.em.fork(),
    hash = await new PasswordService().hash('Clientes seguros para teste 2026!');
  for (let i = 0; i < 2; i++) {
    const u = new Unit();
    Object.assign(u, { name: `Unidade ${i}`, nameKey: `unidade ${i}` });
    em.persist(u);
    units.push(u);
  }
  for (let i = 0; i < 3; i++) {
    const u = new User();
    Object.assign(u, {
      name: `Pessoa ${i}`,
      email: `${randomUUID()}@test.local`,
      passwordHash: hash,
      role: i === 0 ? 'ADMIN' : 'COLLABORATOR',
      mustChangePassword: false,
    });
    em.persist(u);
    users.push(u);
    if (i) {
      const m = new UnitMembership();
      Object.assign(m, { unit: units[i - 1], user: u });
      em.persist(m);
    }
  }
  await em.flush();
  app = await createApplication({}, undefined, db.orm);
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
  for (const u of users) {
    const r = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: 'Clientes seguros para teste 2026!' }),
    });
    cookies.push(r.headers.get('set-cookie')!.split(';')[0]!);
  }
}, 20000);
afterAll(async () => {
  await app?.close();
  await db?.close();
});
function call(path: string, method = 'GET', body?: unknown, actor = 0) {
  return fetch(`${origin}/api/organization/${path}`, {
    method,
    headers: { cookie: cookies[actor]!, 'content-type': 'application/json' },
    ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
}
function domain(path: string, method = 'GET', body?: unknown, actor = 0) {
  return fetch(`${origin}/api/${path}`, {
    method,
    headers: { cookie: cookies[actor]!, 'content-type': 'application/json' },
    ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
}
it('freezes client/local identification and participants, rejects cross links and grants no participant rights', async () => {
  const em = db.orm.em.fork(),
    sector = new Sector();
  Object.assign(sector, {
    unit: em.getReference(Unit, units[0]!.id),
    name: 'Campo',
    nameKey: 'campo',
  });
  em.persist(sector);
  for (const user of users.slice(1)) {
    let parent = await em.findOne(UnitMembership, { unit: units[0]!.id, user: user.id });
    if (!parent) {
      parent = new UnitMembership();
      Object.assign(parent, { unit: sector.unit, user: em.getReference(User, user.id) });
      em.persist(parent);
    }
    const m = new SectorMembership();
    Object.assign(m, { unitMembership: parent, sector });
    em.persist(m);
  }
  await em.flush();
  const customer = await (
    await call('customers', 'POST', {
      name: `Cliente contexto ${randomUUID()}`,
      unitIds: [units[0]!.id],
    })
  ).json();
  const location = await (
    await call('locations', 'POST', { name: 'Canteiro original', customerId: customer.id })
  ).json();
  const other = await (
    await call('customers', 'POST', {
      name: `Outro contexto ${randomUUID()}`,
      unitIds: [units[1]!.id],
    })
  ).json();
  const wrong = await (
    await call('locations', 'POST', { name: 'Local diferente', customerId: other.id })
  ).json();
  const form = await (await domain('forms', 'POST', { name: `Contexto ${randomUUID()}` })).json();
  const draft = await (
    await domain(`forms/${form.id}/draft`, 'PUT', {
      revision: 1,
      snapshot: definition([question('YES_NO_NA')]),
    })
  ).json();
  await domain(`forms/${form.id}/publish`, 'POST', { revision: draft.revision });
  const input = {
    unitId: units[0]!.id,
    sectorId: sector.id,
    formId: form.id,
    context: { customerId: customer.id, locationId: location.id, participants: [users[2]!.name] },
  };
  expect(
    (
      await domain(
        'inspections',
        'POST',
        { ...input, context: { ...input.context, locationId: wrong.id } },
        1,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await domain(
        'inspections',
        'POST',
        { unitId: units[0]!.id, sectorId: sector.id, formId: form.id },
        1,
      )
    ).status,
  ).toBe(400);
  const response = await domain('inspections', 'POST', input, 1);
  expect(response.status).toBe(201);
  const row = await response.json();
  await expect(
    db.orm.em.fork().nativeUpdate(Inspection, row.id, { context: null }),
  ).rejects.toThrow(/immutable/);
  expect(row.context).toMatchObject({
    customerName: customer.name,
    locationName: 'Canteiro original',
    participants: [users[2]!.name],
  });
  expect((await domain(`inspections/${row.id}`, 'GET', undefined, 2)).status).toBe(403);
  const scheduled = await domain('schedules', 'POST', {
    ...input,
    name: 'Identificação programada',
    responsibleIds: [users[1]!.id],
    frequency: 'ONCE',
    startDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    time: '12:00',
    deadlineHours: 24,
  });
  expect(scheduled.status).toBe(201);
  const schedule = await scheduled.json();
  await call(`customers/${customer.id}`, 'PATCH', { revision: 1, name: 'Cliente renomeado' });
  const recurrence = new RecurrenceService(db.orm.em, new AuditService(db.orm.em));
  const assignment = await recurrence.materialize(
    schedule.id,
    schedule.nextOccurrenceAt,
    materializationKey(schedule.id, schedule.nextOccurrenceAt),
  );
  expect(assignment.context).toEqual(row.context);
  await call(`locations/${location.id}`, 'PATCH', { revision: 1, name: 'Nome posterior' });
  // Move only this test occurrence into the opening window.
  await db.orm.em.fork().nativeUpdate(InspectionAssignment, assignment.id, {
    occurrenceAt: new Date(Date.now() - 60000),
  });
  const started = await domain('inspections', 'POST', { assignmentId: assignment.id }, 1);
  expect(started.status).toBe(201);
  expect((await started.json()).context).toEqual(assignment.context);
  await call(`locations/${location.id}`, 'PATCH', {
    revision: 2,
    name: 'Nome posterior',
    isActive: false,
  });
  expect(
    (await (await domain(`inspections/${row.id}`, 'GET', undefined, 1)).json()).context
      .locationName,
  ).toBe('Canteiro original');
  expect((await domain('inspections', 'POST', input, 1)).status).toBe(403);
});
it('supports clients across units, scoped paginated reads and locations per client without leaking other unit names', async () => {
  const result = await call('customers', 'POST', {
    name: 'Cliente compartilhado',
    unitIds: units.map((u) => u.id),
  });
  expect(result.status).toBe(201);
  const client = await result.json();
  expect(
    (await call('customers', 'POST', { name: ' CLIENTE COMPARTILHADO ', unitIds: [units[0]!.id] }))
      .status,
  ).toBe(409);
  const onlyB = await (
    await call('customers', 'POST', { name: 'Cliente privado B', unitIds: [units[1]!.id] })
  ).json();
  const location = await (
    await call('locations', 'POST', { name: 'Obra Central', customerId: client.id })
  ).json();
  expect(
    (await call('locations', 'POST', { name: 'obra central', customerId: client.id })).status,
  ).toBe(409);
  const privateLocation = await (
    await call('locations', 'POST', { name: 'Obra B', customerId: onlyB.id })
  ).json();
  const own = await (
    await call('customers?pageSize=1&q=Cliente%20compartilhado', 'GET', undefined, 1)
  ).json();
  expect(own.total).toBe(1);
  expect(own.data[0].unitIds).toEqual([units[0]!.id]);
  expect(JSON.stringify(own)).not.toContain(units[1]!.name);
  expect((await call(`locations/${privateLocation.id}`, 'GET', undefined, 1)).status).toBe(403);
  const sites = await (await call(`locations?customerId=${client.id}`, 'GET', undefined, 1)).json();
  expect(sites.data.map((s: { id: string }) => s.id)).toEqual([location.id]);
  expect(
    (await call('customers', 'POST', { name: 'Proibido', unitIds: [units[0]!.id] }, 1)).status,
  ).toBe(403);
  expect(
    (await call(`customers/${client.id}`, 'PATCH', { revision: 1, name: 'Cliente atualizado' }))
      .status,
  ).toBe(200);
  expect(
    (await call(`customers/${client.id}`, 'PATCH', { revision: 1, name: 'Versão antiga' })).status,
  ).toBe(409);
  expect(
    (await call(`customers/${client.id}`, 'PATCH', { revision: 2, isActive: false })).status,
  ).toBe(200);
  expect(
    (await (await call(`locations?customerId=${client.id}`, 'GET', undefined, 1)).json()).total,
  ).toBe(0);
});
