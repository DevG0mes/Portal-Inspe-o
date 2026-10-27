import { MikroORM } from '@mikro-orm/postgresql';
import { loadEnvironment } from '@portal/config';
import { createDatabaseOptions } from '../database/mikro-orm.config.js';
import { bootstrapAdministrator } from './bootstrap-administrator.js';

async function createAdmin() {
  const environment = loadEnvironment(process.env);
  const database = await MikroORM.init(createDatabaseOptions(environment.DATABASE_URL));
  try {
    const administrator = await bootstrapAdministrator(database, {
      email: process.env.INITIAL_ADMIN_EMAIL,
      password: process.env.INITIAL_ADMIN_PASSWORD,
    });
    console.info(
      `Administrador inicial criado: ${administrator.id}. Troca de senha obrigatória no primeiro acesso.`,
    );
  } finally {
    await database.close(true);
  }
}

createAdmin().catch(() => {
  console.error(
    'Administrador não criado. Confira o e-mail, a senha e se já existem usuários no portal.',
  );
  process.exitCode = 1;
});
