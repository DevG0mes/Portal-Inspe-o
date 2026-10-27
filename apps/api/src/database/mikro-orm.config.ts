import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { baseEntitySchema } from './base.entity.js';
import { auditEventSchema } from '../audit/audit-event.entity.js';
import { Migration202610270001 } from './migrations/Migration202610270001.js';
import { Migration202610270002 } from './migrations/Migration202610270002.js';
import { userSchema } from '../identity/user.entity.js';
import { sessionSchema } from '../identity/session.entity.js';

/** Explicit entities and migration classes work identically from source and compiled ESM. */
export function createDatabaseOptions(clientUrl: string) {
  return defineConfig({
    clientUrl,
    entities: [baseEntitySchema, auditEventSchema, userSchema, sessionSchema],
    extensions: [Migrator],
    migrations: {
      snapshot: false,
      migrationsList: [Migration202610270001, Migration202610270002],
      transactional: true,
      allOrNothing: true,
    },
    allowGlobalContext: false,
    debug: false,
  });
}
