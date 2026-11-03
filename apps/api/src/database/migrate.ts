import { MikroORM } from '@mikro-orm/postgresql';
import { loadApiEnvironment } from '@portal/config';
import { createDatabaseOptions } from './mikro-orm.config.js';

/** Deployment command. The API never changes schema implicitly on startup. */
async function migrate() {
  const environment = loadApiEnvironment(process.env);
  const database = await MikroORM.init(createDatabaseOptions(environment.DATABASE_URL));
  try {
    await database.migrator.up();
    console.info('Database migrations applied.');
  } finally {
    await database.close(true);
  }
}

migrate().catch(() => {
  console.error('Database migration failed. Check configuration and database availability.');
  process.exitCode = 1;
});
