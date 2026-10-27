import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { RequestContext } from '@mikro-orm/core';
import { loadEnvironment } from '@portal/config';
import { createDatabaseOptions } from '../src/database/mikro-orm.config.js';
import { AuditEvent } from '../src/audit/audit-event.entity.js';
import { AuditService } from '../src/audit/audit.service.js';
import { TransactionService } from '../src/database/transaction.service.js';
import { createApplication } from '../src/app.js';

process.loadEnvFile('.env');
const environment = loadEnvironment(process.env);
// Every schema/migration mutation targets a database created by this suite only.
const databaseName = `portal_test_${randomUUID().replaceAll('-', '')}`;
const admin = new Pool({ connectionString: environment.DATABASE_URL });
const testUrl = new URL(environment.DATABASE_URL);
testUrl.pathname = `/${databaseName}`;
let orm: MikroORM | undefined;
let created = false;

beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  orm = await MikroORM.init(createDatabaseOptions(testUrl.toString()));
  await orm.migrator.up();
});

afterAll(async () => {
  await orm?.close(true);
  if (created && /^portal_test_[a-f0-9]{32}$/.test(databaseName)) {
    await admin.query(`DROP DATABASE "${databaseName}"`);
  }
  await admin.end();
});

describe('persistence and append-only audit', () => {
  it('keeps the entity definitions aligned with the migrated schema', async () => {
    expect(await orm!.schema.getUpdateSchemaSQL({ safe: true })).toBe('');
  });

  it('isolates concurrent HTTP requests while resolving shared audit services', async () => {
    const contexts = new Set();
    let audit: AuditService;
    const app = await createApplication(
      {
        database: async () => {
          contexts.add(RequestContext.getEntityManager());
          await audit.record({
            action: 'context.test',
            resource: 'test',
            resourceId: 'http-context',
            requestId: randomUUID(),
          });
        },
      },
      undefined,
      orm,
    );
    try {
      await app.listen(0, '127.0.0.1');
      audit = app.get(AuditService);
      const origin = await app.getUrl();
      const responses = await Promise.all([
        fetch(`${origin}/api/health/ready`),
        fetch(`${origin}/api/health/ready`),
      ]);
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(contexts.has(undefined)).toBe(false);
      expect(contexts.size).toBe(2);
      expect(await orm!.em.fork().count(AuditEvent, { resourceId: 'http-context' })).toBe(2);
    } finally {
      await app.close();
    }
  });

  it('persists actor, resource, request context, UUID and UTC timestamps without secrets', async () => {
    const em = orm!.em.fork();
    const audit = new AuditService(em);
    const actorId = randomUUID();
    const id = await audit.record({
      actorId,
      action: 'form.published',
      resource: 'form',
      resourceId: 'form-1',
      requestId: 'request-1',
      changes: { title: 'Inspeção', password: 'private' },
    });
    em.clear();
    const saved = await em.findOneOrFail(AuditEvent, id);
    expect(saved).toMatchObject({
      actorId,
      action: 'form.published',
      resource: 'form',
      resourceId: 'form-1',
      requestId: 'request-1',
      changes: { title: 'Inspeção' },
    });
    expect(saved.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(saved.createdAt.toISOString()).toMatch(/Z$/);
    expect(saved.updatedAt.toISOString()).toBe(saved.createdAt.toISOString());
  });

  it('rolls back the audit with the surrounding business transaction', async () => {
    const em = orm!.em.fork();
    const audit = new AuditService(em);
    const transactions = new TransactionService(em);
    await expect(
      transactions.run(async (transaction) => {
        await audit.record(
          {
            action: 'rollback.test',
            resource: 'test',
            resourceId: 'rollback',
            requestId: 'request-2',
          },
          transaction,
        );
        throw new Error('Business operation failed');
      }),
    ).rejects.toThrow('Business operation failed');
    expect(await em.fork().count(AuditEvent, { resourceId: 'rollback' })).toBe(0);
  });

  it('rejects direct updates and deletes at the database boundary', async () => {
    const em = orm!.em.fork();
    const id = await new AuditService(em).record({
      action: 'immutable.test',
      resource: 'test',
      resourceId: 'immutable',
      requestId: 'request-3',
    });
    await expect(
      em
        .getConnection()
        .execute('update audit_event set action = ? where id = ?', ['tampered', id]),
    ).rejects.toThrow(/append.only/i);
    await expect(
      em.getConnection().execute('delete from audit_event where id = ?', [id]),
    ).rejects.toThrow(/append.only/i);
    await expect(em.getConnection().execute('truncate audit_event')).rejects.toThrow(
      /append.only/i,
    );
    expect(await em.fork().count(AuditEvent, { id })).toBe(1);
  });

  it('replays the first migration after a down/up cycle on the isolated test database', async () => {
    await orm!.migrator.down();
    await orm!.migrator.up();
    expect(await orm!.em.fork().count(AuditEvent, {})).toBe(0);
  });
});
