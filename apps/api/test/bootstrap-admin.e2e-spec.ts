import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDatabase } from './helpers/test-database.js';
import { bootstrapAdministrator } from '../src/identity/bootstrap-administrator.js';
import { User } from '../src/identity/user.entity.js';
import { AuditEvent } from '../src/audit/audit-event.entity.js';

let database: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  database = await createTestDatabase();
}, 20000);
afterAll(async () => {
  await database?.close();
});

it('creates exactly one initial administrator even when bootstrap commands overlap', async () => {
  const attempts = await Promise.allSettled([
    bootstrapAdministrator(database.orm, {
      email: `admin-${randomUUID()}@psi.test`,
      password: 'Uma senha temporária para o portal!',
    }),
    bootstrapAdministrator(database.orm, {
      email: `admin-${randomUUID()}@psi.test`,
      password: 'Outra senha temporária para o portal!',
    }),
  ]);
  expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
  expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
  const users = await database.orm.em.fork().find(User, {});
  expect(users).toHaveLength(1);
  expect(users[0]).toMatchObject({ role: 'ADMIN', mustChangePassword: true });
  expect(users[0]!.passwordHash).toMatch(/^\$argon2id\$/);
  expect(await database.orm.em.fork().count(AuditEvent, { action: 'identity.bootstrap' })).toBe(1);
});
