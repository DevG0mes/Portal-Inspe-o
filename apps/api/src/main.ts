import 'reflect-metadata';
import { loadApiEnvironment } from '@portal/config';
import { MikroORM } from '@mikro-orm/postgresql';
import { createDatabaseOptions } from './database/mikro-orm.config.js';
import { createApplication } from './app.js';
import { createInfrastructure } from './health/infrastructure.js';

async function bootstrap() {
  const environment = loadApiEnvironment(process.env);
  const database = await MikroORM.init(createDatabaseOptions(environment.DATABASE_URL));
  const infrastructure = environment.pilot
    ? {
        checks: {
          postgres: async () => {
            await database.em.getConnection().execute('select 1');
          },
        },
        close: async () => {},
      }
    : createInfrastructure(environment);
  const close = async () => {
    await infrastructure.close();
    await database.close(true);
  };
  let app;
  try {
    app = await createApplication(
      infrastructure.checks,
      close,
      database,
      {
        secureCookies: environment.NODE_ENV === 'production',
        origin: environment.APP_ORIGIN,
      },
      undefined,
      { pilot: environment.pilot },
    );
    await app.listen(environment.API_PORT, environment.API_HOST);
  } catch (error) {
    if (app) await app.close();
    else await close();
    throw error;
  }
}

bootstrap().catch(() => {
  console.error(JSON.stringify({ event: 'api.startup_failed' }));
  process.exitCode = 1;
});
