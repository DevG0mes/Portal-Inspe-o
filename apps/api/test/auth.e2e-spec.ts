import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createApplication } from '../src/app.js';
import { User } from '../src/identity/user.entity.js';
import { Session } from '../src/identity/session.entity.js';
import { PasswordService } from '../src/auth/password.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuditEvent } from '../src/audit/audit-event.entity.js';
import { createTestDatabase } from './helpers/test-database.js';

const password = 'Uma senha forte para o portal 2026!';
const newPassword = 'Uma nova senha forte para o portal 2026!';
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let app: INestApplication;
let origin: string;
let user: User;
let passwordHash: string;

beforeAll(async () => {
  database = await createTestDatabase();
  passwordHash = await new PasswordService().hash(password);
  app = await createApplication({ postgres: async () => {} }, undefined, database.orm);
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
}, 20000);

afterAll(async () => {
  await app?.close();
  await database?.close();
});

beforeEach(async () => {
  const em = database.orm.em.fork();
  user = new User();
  user.email = `${randomUUID()}@psi.test`;
  user.name = 'Colaborador de teste';
  user.passwordHash = passwordHash;
  user.mustChangePassword = false;
  em.persist(user);
  await em.flush();
});

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
function cookieOf(response: Response) {
  return response.headers.get('set-cookie')!.split(';')[0]!;
}
function post(path: string, body: unknown = {}, cookie?: string, requestOrigin?: string) {
  return fetch(`${origin}/api/auth/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(requestOrigin ? { origin: requestOrigin } : {}),
    },
    body: JSON.stringify(body),
  });
}
function login(cookie?: string) {
  return post('login', { email: user.email, password }, cookie);
}

describe('local authentication HTTP contract', () => {
  it('logs in with an opaque HttpOnly cookie and exposes only the principal', async () => {
    const response = await login();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toMatch(/^[a-f0-9-]{36}$/);
    const principal = await response.json();
    expect(principal).toEqual({
      userId: user.id,
      role: 'COLLABORATOR',
      sessionId: expect.any(String),
      mustChangePassword: false,
    });
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api');
    expect(cookie).not.toContain('Secure');
    const rawToken = cookieOf(response).split('=')[1]!;
    const stored = await database.orm.em.fork().findOneOrFail(Session, { id: principal.sessionId });
    expect(stored.tokenHash).toBe(tokenHash(rawToken));
    expect(JSON.stringify(stored)).not.toContain(rawToken);
    const me = await fetch(`${origin}/api/auth/me`, { headers: { cookie: cookieOf(response) } });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual(principal);
  });

  it('uses Secure cookies in production options', async () => {
    const secureApp = await createApplication({}, undefined, database.orm, {
      secureCookies: true,
      origin: 'https://portal.psi.test',
    });
    try {
      await secureApp.listen(0, '127.0.0.1');
      const response = await fetch(`${await secureApp.getUrl()}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: user.email, password }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('set-cookie')).toContain('Secure');
    } finally {
      await secureApp.close();
    }
  });

  it('returns identical generic failures for unknown, wrong-password and inactive accounts', async () => {
    const wrong = await post('login', { email: user.email, password: 'incorrect password' });
    const unknown = await post('login', { email: `${randomUUID()}@psi.test`, password });
    await database.orm.em.fork().nativeUpdate(User, { id: user.id }, { isActive: false });
    const inactive = await login();
    expect([wrong.status, unknown.status, inactive.status]).toEqual([401, 401, 401]);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect(await inactive.json()).toEqual({
      statusCode: 401,
      message: 'Credenciais inválidas.',
      error: 'Unauthorized',
    });
  });

  it('locks an account temporarily after five failed attempts, without extending the lock', async () => {
    for (let attempt = 0; attempt < 5; attempt++)
      await post('login', { email: user.email, password: 'incorrect password' });
    const locked = await database.orm.em.fork().findOneOrFail(User, user.id);
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect((await login()).status).toBe(401);
    expect((await database.orm.em.fork().findOneOrFail(User, user.id)).lockedUntil).toEqual(
      locked.lockedUntil,
    );
    await database.orm.em
      .fork()
      .nativeUpdate(User, { id: user.id }, { lockedUntil: new Date(Date.now() - 1000) });
    expect((await login()).status).toBe(200);
    expect((await database.orm.em.fork().findOneOrFail(User, user.id)).failedLoginAttempts).toBe(0);
  });

  it('keeps concurrent failures from losing attempts', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        post('login', { email: user.email, password: 'incorrect password' }),
      ),
    );
    expect(responses.every((response) => response.status === 401)).toBe(true);
    expect((await database.orm.em.fork().findOneOrFail(User, user.id)).lockedUntil).not.toBeNull();
  });

  it('rotates a presented session on login and rejects the old cookie', async () => {
    const first = await login();
    const oldCookie = cookieOf(first);
    const second = await login(oldCookie);
    expect(cookieOf(second)).not.toBe(oldCookie);
    expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie: oldCookie } })).status).toBe(
      401,
    );
  });

  it('revokes the current session on logout and clears the cookie', async () => {
    const cookie = cookieOf(await login());
    const response = await post('logout', {}, cookie);
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toContain('portal_session=;');
    expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie } })).status).toBe(401);
  });

  it('revokes all sessions for the user without affecting another account', async () => {
    const first = cookieOf(await login());
    const second = cookieOf(await login());
    const em = database.orm.em.fork();
    const other = new User();
    other.email = `${randomUUID()}@psi.test`;
    other.name = 'Outro colaborador';
    other.passwordHash = passwordHash;
    other.mustChangePassword = false;
    em.persist(other);
    await em.flush();
    const otherLogin = await post('login', { email: other.email, password });
    expect((await post('logout-all', {}, first)).status).toBe(204);
    expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie: second } })).status).toBe(
      401,
    );
    expect(
      (await fetch(`${origin}/api/auth/me`, { headers: { cookie: cookieOf(otherLogin) } })).status,
    ).toBe(200);
  });

  it('requires the current password and rotates every session after password change', async () => {
    const first = cookieOf(await login());
    const second = cookieOf(await login());
    expect(
      (await post('change-password', { currentPassword: 'incorrect', newPassword }, first)).status,
    ).toBe(401);
    const changed = await post(
      'change-password',
      { currentPassword: password, newPassword },
      first,
    );
    expect(changed.status).toBe(200);
    expect((await changed.json()).mustChangePassword).toBe(false);
    expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie: first } })).status).toBe(401);
    expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie: second } })).status).toBe(
      401,
    );
    expect(
      (await fetch(`${origin}/api/auth/me`, { headers: { cookie: cookieOf(changed) } })).status,
    ).toBe(200);
    expect((await login()).status).toBe(401);
    expect((await post('login', { email: user.email, password: newPassword })).status).toBe(200);
  });

  it('blocks other protected operations until the required password change is complete', async () => {
    await database.orm.em.fork().nativeUpdate(User, { id: user.id }, { mustChangePassword: true });
    const cookie = cookieOf(await login());
    expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie } })).status).toBe(200);
    expect((await post('logout-all', {}, cookie)).status).toBe(403);
    expect(
      (await post('change-password', { currentPassword: password, newPassword }, cookie)).status,
    ).toBe(200);
  });

  it('rejects expired sessions and sessions belonging to disabled users', async () => {
    const first = await login();
    const principal = await first.json();
    await database.orm.em
      .fork()
      .nativeUpdate(
        Session,
        { id: principal.sessionId },
        { expiresAt: new Date(Date.now() - 1000) },
      );
    expect(
      (await fetch(`${origin}/api/auth/me`, { headers: { cookie: cookieOf(first) } })).status,
    ).toBe(401);
    const second = cookieOf(await login());
    await database.orm.em.fork().nativeUpdate(User, { id: user.id }, { isActive: false });
    expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie: second } })).status).toBe(
      401,
    );
  });

  it('allows logout during a required password change', async () => {
    await database.orm.em.fork().nativeUpdate(User, { id: user.id }, { mustChangePassword: true });
    const cookie = cookieOf(await login());
    expect((await post('logout', {}, cookie)).status).toBe(204);
  });

  it('does not let a collaborator invoke the administrative reset service', async () => {
    const principal = await (await login()).json();
    await expect(
      app.get(AuthService).resetPassword(principal, user.id, newPassword, randomUUID()),
    ).rejects.toThrow();
    expect((await login()).status).toBe(200);
  });

  it('rejects cross-origin credential changes and non-JSON login requests', async () => {
    const cookie = cookieOf(await login());
    expect(
      (
        await post(
          'change-password',
          { currentPassword: password, newPassword },
          cookie,
          'https://attacker.example',
        )
      ).status,
    ).toBe(403);
    expect(
      (await post('login', { email: user.email, password }, undefined, 'https://attacker.example'))
        .status,
    ).toBe(403);
    expect(
      (
        await fetch(`${origin}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: `email=${user.email}&password=x`,
        })
      ).status,
    ).toBe(415);
  });

  it('rejects malformed inputs and fabricated cookies without exposing credentials', async () => {
    expect((await post('login', { email: user.email, password, role: 'ADMIN' })).status).toBe(400);
    expect((await fetch(`${origin}/api/auth/me`)).status).toBe(401);
    expect(
      (
        await fetch(`${origin}/api/auth/me`, {
          headers: { cookie: `portal_session=${'x'.repeat(43)}` },
        })
      ).status,
    ).toBe(401);
    const events = await database.orm.em.fork().find(AuditEvent, {});
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(passwordHash);
  });

  it('audits credential changes and makes administrator resets require a password change', async () => {
    const cookie = cookieOf(await login());
    const em = database.orm.em.fork();
    const admin = new User();
    admin.email = `${randomUUID()}@psi.test`;
    admin.name = 'Administrador';
    admin.passwordHash = passwordHash;
    admin.role = 'ADMIN';
    admin.mustChangePassword = false;
    em.persist(admin);
    await em.flush();
    const service = app.get(AuthService);
    await service.resetPassword(
      { userId: admin.id, role: 'ADMIN', sessionId: randomUUID(), mustChangePassword: false },
      user.id,
      newPassword,
      randomUUID(),
    );
    expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie } })).status).toBe(401);
    const response = await post('login', { email: user.email, password: newPassword });
    expect((await response.json()).mustChangePassword).toBe(true);
    expect(
      await em.fork().count(AuditEvent, { action: 'auth.password_reset', resourceId: user.id }),
    ).toBe(1);
  });
});
