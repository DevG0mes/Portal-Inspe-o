import { MikroORM } from '@mikro-orm/postgresql';
import { createDatabaseOptions } from '../database/mikro-orm.config.js';
import { AuditService } from '../audit/audit.service.js';
import { RecurrenceService } from './recurrence.service.js';
/** Server-only worker entrypoint. Reuses the domain transaction without starting HTTP. */
export async function createSchedulingRuntime(databaseUrl: string) {
  const database = await MikroORM.init(createDatabaseOptions(databaseUrl));
  const recurrence = new RecurrenceService(database.em, new AuditService(database.em));
  return {
    due: () => recurrence.due(),
    materialize: (id: string, at: string, key: string) => recurrence.materialize(id, at, key),
    close: () => database.close(true),
  };
}
