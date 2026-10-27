import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { baseEntitySchema } from './base.entity.js';
import { auditEventSchema } from '../audit/audit-event.entity.js';
import { Migration202610270001 } from './migrations/Migration202610270001.js';

/** Explicit entities and migration classes work identically from source and compiled ESM. */
export function createDatabaseOptions(clientUrl: string) {
  return defineConfig({
    clientUrl,
    entities: [baseEntitySchema, auditEventSchema],
    extensions: [Migrator],
    migrations: {
      snapshot: false,
      migrationsList: [Migration202610270001],
      transactional: true,
      allOrNothing: true,
    },
    allowGlobalContext: false,
    debug: false,
  });
}
