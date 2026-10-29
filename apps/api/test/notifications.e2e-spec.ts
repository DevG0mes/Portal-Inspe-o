import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, it, expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestDatabase } from './helpers/test-database.js';
import { createApplication } from '../src/app.js';
import { User } from '../src/identity/user.entity.js';
import { PasswordService } from '../src/auth/password.service.js';
import { emitOnce } from '../src/notifications/notification-events.js';
let db: Awaited<ReturnType<typeof createTestDatabase>>, app: INestApplication, origin: string;
const users: User[] = [],
  cookies: string[] = [];
beforeAll(async () => {
  db = await createTestDatabase();
  const em = db.orm.em.fork(),
    hash = await new PasswordService().hash('Teste de notificações 2026!');
  for (let i = 0; i < 2; i++) {
    const u = new User();
    Object.assign(u, {
      name: 'Teste',
      email: `${randomUUID()}@example.test`,
      role: 'ADMIN',
      mustChangePassword: false,
      passwordHash: hash,
    });
    em.persist(u);
    users.push(u);
  }
  await em.flush();
  app = await createApplication({}, undefined, db.orm);
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
  for (const u of users) {
    const r = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: 'Teste de notificações 2026!' }),
    });
    cookies.push(r.headers.get('set-cookie')!.split(';')[0]!);
  }
}, 30000);
afterAll(async () => {
  await app?.close();
  await db?.close();
});
function call(path: string, method = 'GET', user = 0) {
  return fetch(`${origin}/api/notifications${path}`, {
    method,
    headers: {
      cookie: cookies[user]!,
      ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}),
    },
    ...(method !== 'GET' ? { body: '{}' } : {}),
  });
}
it('deduplicates concurrently, preserves read state and rolls back with the business transaction', async () => {
  const payload = {
    kind: 'ACTION_ASSIGNED' as const,
    resourceType: 'ACTION_PLAN' as const,
    resourceId: randomUUID(),
  };
  await Promise.all(
    [1, 2].map(() =>
      db.orm.em.fork().transactional((em) => emitOnce(em, 'same-event', users[0]!.id, payload)),
    ),
  );
  const list = await (await call('')).json();
  expect(list.total).toBe(1);
  expect(list.data[0].href).toBeNull();
  expect(list.data[0].resourceTitle).toBeNull();
  const id = list.data[0].id;
  expect((await call(`/${id}/read`, 'POST', 1)).status).toBe(404);
  expect((await call(`/${id}/read`, 'POST')).status).toBe(201);
  await db.orm.em.fork().transactional((em) => emitOnce(em, 'same-event', users[0]!.id, payload));
  expect((await (await call('/unread-count')).json()).count).toBe(0);
  await expect(
    db.orm.em.fork().transactional(async (em) => {
      await emitOnce(em, 'rollback', users[0]!.id, payload);
      throw new Error('rollback');
    }),
  ).rejects.toThrow('rollback');
  expect((await (await call('')).json()).total).toBe(1);
  expect((await (await call('', 'GET', 1)).json()).total).toBe(0);
});
it('marks a bounded snapshot as read and validates pagination and identifiers', async () => {
  await call('/read-all', 'POST');
  await db.orm.em.fork().transactional((em) =>
    emitOnce(em, 'another', users[0]!.id, {
      kind: 'ACTION_OVERDUE',
      resourceType: 'ACTION_PLAN',
      resourceId: randomUUID(),
    }),
  );
  expect((await (await call('/unread-count')).json()).count).toBe(1);
  expect((await call('/read-all', 'POST')).status).toBe(201);
  expect((await (await call('/unread-count')).json()).count).toBe(0);
  expect((await call('?pageSize=101')).status).toBe(400);
  expect((await call('/invalid/read', 'POST')).status).toBe(400);
});
