import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { LockMode } from '@mikro-orm/core';
import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApplication } from '../src/app.js';
import { User } from '../src/identity/user.entity.js';
import { Session } from '../src/identity/session.entity.js';
import { Sector } from '../src/organization/sector.entity.js';
import { UnitMembership, SectorMembership } from '../src/organization/membership.entity.js';
import { AccessPolicy } from '../src/access/access-policy.service.js';
import { AuditEvent } from '../src/audit/audit-event.entity.js';
import { PasswordService } from '../src/auth/password.service.js';
import { createTestDatabase } from './helpers/test-database.js';

const password = 'Uma senha forte para o portal 2026!';
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let app: INestApplication;
let origin: string;
let digest: string;
let admin: User, collaborator: User, manager: User, outsider: User;
let adminCookie: string, collaboratorCookie: string, managerCookie: string, outsiderCookie: string;
let unitA: { id: string; name: string }, unitB: { id: string; name: string };
let allowed: { id: string }, denied: { id: string }, other: { id: string };
let unitGrant: { id: string }, sectorGrant: { id: string };

beforeAll(async () => {
  database = await createTestDatabase();
  digest = await new PasswordService().hash(password);
  app = await createApplication({}, undefined, database.orm);
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
}, 20000);

afterAll(async () => {
  await app?.close();
  await database?.close();
});

function call(path: string, cookie: string, method = 'GET', body?: unknown) {
  return fetch(`${origin}/api/${path}`, {
    method,
    headers: { cookie, ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}) },
    ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
}

async function login(user: User, currentPassword = password) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: currentPassword }),
  });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

async function create(path: string, body: unknown) {
  const response = await call(path, adminCookie, 'POST', body);
  expect(response.status).toBe(201);
  return response.json();
}

beforeEach(async () => {
  const em = database.orm.em.fork();
  function user(role: User['role']) {
    const value = new User();
    value.name = 'Usuário de teste';
    value.email = `${randomUUID()}@psi.test`;
    value.role = role;
    value.passwordHash = digest;
    value.mustChangePassword = false;
    em.persist(value);
    return value;
  }
  admin = user('ADMIN');
  collaborator = user('COLLABORATOR');
  manager = user('MANAGER');
  outsider = user('COLLABORATOR');
  await em.flush();
  [adminCookie, collaboratorCookie, managerCookie, outsiderCookie] = await Promise.all([
    login(admin),
    login(collaborator),
    login(manager),
    login(outsider),
  ]);
  const prefix = randomUUID();
  unitA = await create('organization/units', { name: `${prefix} A` });
  unitB = await create('organization/units', { name: `${prefix} B` });
  allowed = await create('organization/sectors', { unitId: unitA.id, name: 'Operação' });
  denied = await create('organization/sectors', { unitId: unitA.id, name: 'Almoxarifado' });
  other = await create('organization/sectors', { unitId: unitB.id, name: 'Operação' });
  unitGrant = await create('organization/unit-memberships', {
    userId: collaborator.id,
    unitId: unitA.id,
  });
  await create('organization/unit-memberships', { userId: collaborator.id, unitId: unitB.id });
  await create('organization/unit-memberships', { userId: manager.id, unitId: unitA.id });
  sectorGrant = await create('organization/sector-memberships', {
    userId: collaborator.id,
    unitId: unitA.id,
    sectorId: allowed.id,
  });
  await create('organization/sector-memberships', {
    userId: collaborator.id,
    unitId: unitB.id,
    sectorId: other.id,
  });
  await create('organization/sector-memberships', {
    userId: manager.id,
    unitId: unitA.id,
    sectorId: denied.id,
  });
}, 20000);

describe('organizational scope and user administration', () => {
  it.each(['unit-memberships', 'sector-memberships'] as const)(
    'persists reactivation after overlapping changes to %s',
    async (path) => {
      const id = path === 'unit-memberships' ? unitGrant.id : sectorGrant.id;
      const blocker = database.orm.em.fork();
      await blocker.begin();
      await blocker.findOneOrFail(User, collaborator.id, { lockMode: LockMode.PESSIMISTIC_WRITE });
      const pending: Promise<Response>[] = [];
      const waiting = async () => {
        const rows = await database.orm.em
          .fork()
          .execute(
            "select count(*)::int as total from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
          );
        return Number(rows[0].total);
      };
      try {
        pending.push(call(`organization/${path}/${id}`, adminCookie, 'PATCH', { isActive: false }));
        await expect.poll(waiting, { timeout: 3000 }).toBe(1);
        pending.push(call(`organization/${path}/${id}`, adminCookie, 'PATCH', { isActive: true }));
        await expect.poll(waiting, { timeout: 3000 }).toBe(2);
        await blocker.commit();
        const responses = await Promise.all(pending);
        expect(responses.map((response) => response.status)).toEqual([200, 200]);
        expect((await responses[1]!.json()).isActive).toBe(true);
        const persisted =
          path === 'unit-memberships'
            ? await database.orm.em.fork().findOneOrFail(UnitMembership, id)
            : await database.orm.em.fork().findOneOrFail(SectorMembership, id);
        expect(persisted.isActive).toBe(true);
      } finally {
        if (blocker.isInTransaction()) await blocker.rollback();
        await Promise.allSettled(pending);
      }
    },
  );

  it('reads paginated grants and their details, and revokes a sector independently', async () => {
    const units = await (
      await call(`organization/unit-memberships?userId=${collaborator.id}&pageSize=1`, adminCookie)
    ).json();
    expect(units.total).toBe(2);
    expect(units.data).toHaveLength(1);
    const sectors = await (
      await call(
        `organization/sector-memberships?userId=${collaborator.id}&unitId=${unitA.id}`,
        adminCookie,
      )
    ).json();
    expect(sectors.total).toBe(1);
    expect(sectors.data[0].id).toBe(sectorGrant.id);
    expect((await call(`organization/unit-memberships/${unitGrant.id}`, adminCookie)).status).toBe(
      200,
    );
    expect(
      (await call(`organization/sector-memberships/${sectorGrant.id}`, adminCookie)).status,
    ).toBe(200);
    expect(
      (await call(`organization/sector-memberships/${sectorGrant.id}`, adminCookie, 'DELETE'))
        .status,
    ).toBe(204);
    expect(
      (await call(`organization/units/${unitA.id}/sectors/${allowed.id}`, collaboratorCookie))
        .status,
    ).toBe(403);
    expect(
      (
        await call(`organization/sector-memberships/${sectorGrant.id}`, adminCookie, 'PATCH', {
          isActive: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (await call(`organization/units/${unitA.id}/sectors/${allowed.id}`, collaboratorCookie))
        .status,
    ).toBe(200);
  });

  it('rejects grants without an active parent unit membership or with inactive users', async () => {
    expect(
      (
        await call('organization/sector-memberships', adminCookie, 'POST', {
          userId: outsider.id,
          unitId: unitA.id,
          sectorId: allowed.id,
        })
      ).status,
    ).toBe(400);
    expect((await call(`users/${outsider.id}`, adminCookie, 'DELETE')).status).toBe(204);
    expect(
      (
        await call('organization/unit-memberships', adminCookie, 'POST', {
          userId: outsider.id,
          unitId: unitA.id,
        })
      ).status,
    ).toBe(400);
  });

  it('rolls back conflicting renames and soft-deletes sectors without losing bindings', async () => {
    expect(
      (await call(`organization/units/${unitA.id}`, adminCookie, 'PATCH', { name: unitB.name }))
        .status,
    ).toBe(409);
    expect((await (await call(`organization/units/${unitA.id}`, adminCookie)).json()).name).toBe(
      unitA.name,
    );
    expect(
      (
        await call(`organization/sectors/${allowed.id}`, adminCookie, 'PATCH', {
          name: 'Nova operação',
        })
      ).status,
    ).toBe(200);
    expect((await call(`organization/sectors/${allowed.id}`, adminCookie, 'DELETE')).status).toBe(
      204,
    );
    expect(
      (await call(`organization/units/${unitA.id}/sectors/${allowed.id}`, collaboratorCookie))
        .status,
    ).toBe(403);
    expect(await database.orm.em.fork().count(SectorMembership, { id: sectorGrant.id })).toBe(1);
  });

  it('denies an unassigned sector inside an assigned unit', async () => {
    expect(
      (await call(`organization/units/${unitA.id}/sectors/${allowed.id}`, collaboratorCookie))
        .status,
    ).toBe(200);
    expect(
      (await call(`organization/units/${unitA.id}/sectors/${denied.id}`, collaboratorCookie))
        .status,
    ).toBe(403);
    expect((await call(`organization/sectors/${denied.id}`, collaboratorCookie)).status).toBe(403);
  });

  it('isolates managers and collaborators and permits multiple explicit scopes', async () => {
    expect(
      (await call(`organization/units/${unitB.id}/sectors/${other.id}`, collaboratorCookie)).status,
    ).toBe(200);
    expect(
      (await call(`organization/units/${unitA.id}/sectors/${denied.id}`, managerCookie)).status,
    ).toBe(200);
    expect(
      (await call(`organization/units/${unitA.id}/sectors/${allowed.id}`, managerCookie)).status,
    ).toBe(403);
    expect(
      (await call(`organization/units/${unitB.id}/sectors/${other.id}`, managerCookie)).status,
    ).toBe(403);
    expect(
      (await call(`organization/units/${unitA.id}/sectors/${allowed.id}`, outsiderCookie)).status,
    ).toBe(403);
  });

  it('filters both rows and totals before pagination', async () => {
    const units = await (await call('organization/units?pageSize=1', collaboratorCookie)).json();
    expect(units.total).toBe(2);
    expect(units.data).toHaveLength(1);
    const pageTwo = await (
      await call('organization/units?pageSize=1&page=2', collaboratorCookie)
    ).json();
    expect(pageTwo.data[0].id).not.toBe(units.data[0].id);
    const sectors = await (await call('organization/sectors', collaboratorCookie)).json();
    expect(sectors.total).toBe(2);
    expect(sectors.data.map((value: { id: string }) => value.id).sort()).toEqual(
      [allowed.id, other.id].sort(),
    );
    const hidden = await (
      await call(`organization/sectors?unitId=${unitA.id}&q=Almoxarifado`, collaboratorCookie)
    ).json();
    expect(hidden).toMatchObject({ data: [], total: 0 });
    expect(await (await call('organization/units', outsiderCookie)).json()).toMatchObject({
      data: [],
      total: 0,
    });
  });

  it('rejects a sector from another unit even when both scopes are assigned', async () => {
    expect(
      (await call(`organization/units/${unitA.id}/sectors/${other.id}`, collaboratorCookie)).status,
    ).toBe(403);
    expect(
      (
        await call('organization/sector-memberships', adminCookie, 'POST', {
          userId: collaborator.id,
          unitId: unitA.id,
          sectorId: other.id,
        })
      ).status,
    ).toBe(400);
  });

  it('enforces membership compatibility at the database boundary too', async () => {
    const em = database.orm.em.fork();
    const membership = new SectorMembership();
    membership.unitMembership = em.getReference(UnitMembership, unitGrant.id);
    membership.sector = em.getReference(Sector, other.id);
    em.persist(membership);
    await expect(em.flush()).rejects.toThrow(/assigned unit/i);
  });

  it('gives administrators global access and audits the scope bypass', async () => {
    expect(
      (await call(`organization/units/${unitA.id}/sectors/${denied.id}`, adminCookie)).status,
    ).toBe(200);
    expect(
      await database.orm.em
        .fork()
        .count(AuditEvent, { action: 'access.global_scope', resourceId: denied.id }),
    ).toBeGreaterThan(0);
  });

  it('does not trust stale administrator claims or inactive accounts in the policy service', async () => {
    const policy = app.get(AccessPolicy);
    const actor = {
      userId: collaborator.id,
      role: 'ADMIN' as const,
      sessionId: randomUUID(),
      mustChangePassword: false,
    };
    await expect(policy.assertUnitSector(actor, unitA.id, denied.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await database.orm.em.fork().nativeUpdate(User, { id: collaborator.id }, { isActive: false });
    await expect(policy.assertUnitSector(actor, unitA.id, allowed.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('restricts organization and user administration to administrators', async () => {
    for (const cookie of [collaboratorCookie, managerCookie]) {
      expect((await call('users', cookie)).status).toBe(403);
      expect(
        (await call('organization/units', cookie, 'POST', { name: randomUUID() })).status,
      ).toBe(403);
      expect((await call('organization/unit-memberships', cookie)).status).toBe(403);
      expect((await call(`users/${outsider.id}`, cookie, 'PATCH', { role: 'ADMIN' })).status).toBe(
        403,
      );
    }
  });

  it('rejects duplicate names inside a unit and keeps immutable organizational relationships', async () => {
    expect(
      (
        await call('organization/sectors', adminCookie, 'POST', {
          unitId: unitA.id,
          name: ' operação ',
        })
      ).status,
    ).toBe(409);
    expect(
      (await call(`organization/sectors/${allowed.id}`, adminCookie, 'PATCH', { unitId: unitB.id }))
        .status,
    ).toBe(400);
    const em = database.orm.em.fork();
    await expect(
      em
        .getConnection()
        .execute('update organization_sector set unit_id = ? where id = ?', [unitB.id, allowed.id]),
    ).rejects.toThrow(/reassigned/i);
    await expect(
      em
        .getConnection()
        .execute('update unit_membership set unit_id = ? where id = ?', [unitB.id, unitGrant.id]),
    ).rejects.toThrow(/reassigned/i);
  });

  it('revokes unit access without deleting historical bindings or restoring sector permissions implicitly', async () => {
    const before = await database.orm.em.fork().findOneOrFail(SectorMembership, sectorGrant.id);
    expect(
      (await call(`organization/unit-memberships/${unitGrant.id}`, adminCookie, 'DELETE')).status,
    ).toBe(204);
    expect(
      (await call(`organization/units/${unitA.id}/sectors/${allowed.id}`, collaboratorCookie))
        .status,
    ).toBe(403);
    expect(
      (
        await call(`organization/unit-memberships/${unitGrant.id}`, adminCookie, 'PATCH', {
          isActive: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (await call(`organization/units/${unitA.id}/sectors/${allowed.id}`, collaboratorCookie))
        .status,
    ).toBe(403);
    const restored = await create('organization/sector-memberships', {
      userId: collaborator.id,
      unitId: unitA.id,
      sectorId: allowed.id,
    });
    expect(restored.id).toBe(sectorGrant.id);
    expect(
      (await database.orm.em.fork().findOneOrFail(SectorMembership, sectorGrant.id)).createdAt,
    ).toEqual(before.createdAt);
    expect(
      (await call(`organization/units/${unitA.id}/sectors/${allowed.id}`, collaboratorCookie))
        .status,
    ).toBe(200);
  });

  it('deactivates users atomically with session revocation and preserves their memberships', async () => {
    expect(
      (await call(`users/${collaborator.id}`, adminCookie, 'PATCH', { isActive: false })).status,
    ).toBe(200);
    expect((await call('auth/me', collaboratorCookie)).status).toBe(401);
    expect(
      await database.orm.em.fork().count(Session, { user: collaborator.id, revokedAt: null }),
    ).toBe(0);
    expect(await database.orm.em.fork().count(UnitMembership, { user: collaborator.id })).toBe(2);
    expect(
      (await call(`users/${collaborator.id}`, adminCookie, 'PATCH', { isActive: true })).status,
    ).toBe(200);
    expect((await call('auth/me', collaboratorCookie)).status).toBe(401);
    expect((await call('auth/me', await login(collaborator))).status).toBe(200);
  });

  it('creates users with temporary passwords and never returns credential fields', async () => {
    const email = `${randomUUID()}@psi.test`;
    const created = await create('users', {
      name: 'Nova gestora',
      email,
      role: 'MANAGER',
      password,
    });
    expect(created).toMatchObject({ email, role: 'MANAGER', mustChangePassword: true });
    expect(JSON.stringify(created)).not.toContain('passwordHash');
    const response = await call(`users?q=${email}`, adminCookie);
    const result = await response.json();
    expect(result.total).toBe(1);
    expect(result.data[0].id).toBe(created.id);
    expect(JSON.stringify(result)).not.toContain(digest);
    expect(
      (
        await call('users', adminCookie, 'POST', {
          name: 'Duplicada',
          email: email.toUpperCase(),
          password,
        })
      ).status,
    ).toBe(409);
  });

  it('revokes existing sessions when roles change or an administrator resets a password', async () => {
    expect(
      (await call(`users/${collaborator.id}`, adminCookie, 'PATCH', { role: 'MANAGER' })).status,
    ).toBe(200);
    expect((await call('auth/me', collaboratorCookie)).status).toBe(401);
    const freshCookie = await login(collaborator);
    expect((await (await call('auth/me', freshCookie)).json()).role).toBe('MANAGER');
    const temporaryPassword = 'Uma nova senha temporária para o portal!';
    expect(
      (
        await call(`users/${collaborator.id}/reset-password`, adminCookie, 'POST', {
          newPassword: temporaryPassword,
        })
      ).status,
    ).toBe(204);
    expect((await call('auth/me', freshCookie)).status).toBe(401);
    const replacedCookie = await login(collaborator, temporaryPassword);
    expect((await (await call('auth/me', replacedCookie)).json()).mustChangePassword).toBe(true);
  });

  it('preserves at least one active administrator under concurrent deactivations', async () => {
    const administrators = await database.orm.em
      .fork()
      .find(User, { role: 'ADMIN', isActive: true });
    // Prior fixtures remain in the isolated database; only one administrator is active for this case.
    for (const value of administrators)
      if (value.id !== admin.id)
        await database.orm.em.fork().nativeUpdate(User, { id: value.id }, { isActive: false });
    expect((await call(`users/${admin.id}`, adminCookie, 'DELETE')).status).toBe(409);
    expect(
      (await call(`users/${admin.id}`, adminCookie, 'PATCH', { role: 'COLLABORATOR' })).status,
    ).toBe(409);
    const em = database.orm.em.fork();
    const second = new User();
    second.name = 'Segundo administrador';
    second.email = `${randomUUID()}@psi.test`;
    second.passwordHash = digest;
    second.role = 'ADMIN';
    second.mustChangePassword = false;
    em.persist(second);
    await em.flush();
    const secondCookie = await login(second);
    const responses = await Promise.all([
      call(`users/${admin.id}`, adminCookie, 'PATCH', { isActive: false }),
      call(`users/${second.id}`, secondCookie, 'PATCH', { isActive: false }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await database.orm.em.fork().count(User, { role: 'ADMIN', isActive: true })).toBe(1);
  });

  it('blocks inactive organizational resources without deleting their recorded grants', async () => {
    expect(
      (await call(`organization/units/${unitA.id}`, adminCookie, 'PATCH', { isActive: false }))
        .status,
    ).toBe(200);
    expect(
      (await call(`organization/units/${unitA.id}/sectors/${allowed.id}`, collaboratorCookie))
        .status,
    ).toBe(403);
    const units = await (await call('organization/units', collaboratorCookie)).json();
    expect(units.total).toBe(1);
    expect(units.data[0].id).toBe(unitB.id);
    expect(
      await (await call('organization/units?isActive=false', collaboratorCookie)).json(),
    ).toMatchObject({ data: [], total: 0 });
    expect(
      await (await call(`organization/sectors?unitId=${unitA.id}`, collaboratorCookie)).json(),
    ).toMatchObject({ data: [], total: 0 });
    expect(await database.orm.em.fork().count(UnitMembership, { id: unitGrant.id })).toBe(1);
  });

  it('treats search wildcards literally and validates pagination and identifiers', async () => {
    expect(await (await call('organization/units?q=%25', collaboratorCookie)).json()).toMatchObject(
      { data: [], total: 0 },
    );
    expect((await call('organization/units?pageSize=1000', adminCookie)).status).toBe(400);
    expect((await call('organization/sectors/not-a-uuid', adminCookie)).status).toBe(400);
  });
});
