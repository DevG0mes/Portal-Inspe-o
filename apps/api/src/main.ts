import 'reflect-metadata';
import { loadEnvironment } from '@portal/config';
import { MikroORM } from '@mikro-orm/postgresql';
import { createDatabaseOptions } from './database/mikro-orm.config.js';
import { createApplication } from './app.js';
import { createInfrastructure } from './health/infrastructure.js';

async function bootstrap() {
  const environment = loadEnvironment(process.env);
  const database = await MikroORM.init(createDatabaseOptions(environment.DATABASE_URL));
  const infrastructure = createInfrastructure(environment);
  const close = async () => {
    await infrastructure.close();
    await database.close(true);
  };
  let app;
  try {
    app = await createApplication(infrastructure.checks, close, database, {
      secureCookies: environment.NODE_ENV === 'production',
      origin: environment.APP_ORIGIN,
    });
    await app.listen(environment.API_PORT, environment.API_HOST);
  } catch (error) {
    if (app) await app.close();
    else await close();
    throw error;
  }
}

bootstrap().catch(() => {
  console.error('API startup failed. Check configuration and service availability.');
  process.exitCode = 1;
});
