import { MikroORM } from '@mikro-orm/postgresql';
import { createDatabaseOptions } from '../database/mikro-orm.config.js';
import { AuditService } from '../audit/audit.service.js';
import { RecurrenceService } from './recurrence.service.js';
import { FileService } from '../files/file.service.js';
import { InspectionService } from '../inspections/inspection.service.js';
import { AccessPolicy } from '../access/access-policy.service.js';
import { MinioStorageAdapter } from '../files/minio-storage.adapter.js';
import { loadEnvironment } from '@portal/config';
/** Server-only worker entrypoint. Reuses the domain transaction without starting HTTP. */
export async function createSchedulingRuntime(databaseUrl: string) {
  const database = await MikroORM.init(createDatabaseOptions(databaseUrl));
  const recurrence = new RecurrenceService(database.em, new AuditService(database.em));
  const environment = loadEnvironment(process.env),
    audit = new AuditService(database.em);
  const files = new FileService(
    database.em,
    new InspectionService(database.em, new AccessPolicy(database.em, audit), audit),
    audit,
    new MinioStorageAdapter(environment),
    environment.EVIDENCE_MAX_BYTES,
  );
  return {
    due: () => recurrence.due(),
    cleanupUploads: () => files.cleanup(),
    materialize: (id: string, at: string, key: string) => recurrence.materialize(id, at, key),
    close: () => database.close(true),
  };
}
