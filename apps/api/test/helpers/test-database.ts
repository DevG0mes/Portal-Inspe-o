import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { MikroORM } from '@mikro-orm/postgresql';
import { loadEnvironment } from '@portal/config';
import { createDatabaseOptions } from '../../src/database/mikro-orm.config.js';

/** Each suite owns a fresh local database; never clean the portal's application database. */
export async function createTestDatabase() {
  process.loadEnvFile('.env');
  const environment = loadEnvironment(process.env);
  const url = new URL(environment.DATABASE_URL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Integration suites require a local PostgreSQL server');
  }
  const name = `portal_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: environment.DATABASE_URL });
  url.pathname = `/${name}`;
  let created = false;
  let orm: MikroORM | undefined;
  const close = async () => {
    await orm?.close(true);
    if (created && /^portal_test_[a-f0-9]{32}$/.test(name)) {
      await admin.query(`DROP DATABASE "${name}"`);
      created = false;
    }
    await admin.end();
  };
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    orm = await MikroORM.init(createDatabaseOptions(url.toString()));
    await orm.migrator.up();
    return { orm, close };
  } catch (error) {
    await close();
    throw error;
  }
}
