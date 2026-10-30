import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { baseEntitySchema } from './base.entity.js';
import { auditEventSchema } from '../audit/audit-event.entity.js';
import { Migration202610270001 } from './migrations/Migration202610270001.js';
import { Migration202610270002 } from './migrations/Migration202610270002.js';
import { userSchema } from '../identity/user.entity.js';
import { sessionSchema } from '../identity/session.entity.js';
import { unitSchema } from '../organization/unit.entity.js';
import { sectorSchema } from '../organization/sector.entity.js';
import { unitMembershipSchema, sectorMembershipSchema } from '../organization/membership.entity.js';
import { Migration202610270003 } from './migrations/Migration202610270003.js';
import { Migration202610280001 } from './migrations/Migration202610280001.js';
import { formTemplateSchema } from '../forms/entities/form-template.entity.js';
import { formVersionSchema } from '../forms/entities/form-version.entity.js';
import {
  scheduleSchema,
  scheduleResponsibleSchema,
  assignmentSchema,
  assignmentResponsibleSchema,
} from '../schedules/schedule.entity.js';
import { Migration202610280002 } from './migrations/Migration202610280002.js';
import { Migration202610280003 } from './migrations/Migration202610280003.js';
import { Migration202610280004 } from './migrations/Migration202610280004.js';
import { evidenceArtifactSchema } from '../files/file.entity.js';
import { actionPlanSchema, actionPlanEventSchema } from '../action-plans/action-plan.entity.js';
import { Migration202610290001 } from './migrations/Migration202610290001.js';
import { Migration202610290002 } from './migrations/Migration202610290002.js';
import { notificationSchema } from '../notifications/notification.entity.js';
import { reportRequestSchema } from '../reports/report-request.entity.js';
import { Migration202610290003 } from './migrations/Migration202610290003.js';
import { inspectionSchema, inspectionSubmissionSchema } from '../inspections/inspection.entity.js';
import { Migration202610300001 } from './migrations/Migration202610300001.js';
import { Migration202610300002 } from './migrations/Migration202610300002.js';
import { Migration202610300003 } from './migrations/Migration202610300003.js';
import { Migration202610300004 } from './migrations/Migration202610300004.js';
import { formUnitSchema } from '../forms/entities/form-unit.entity.js';
import {
  customerSchema,
  customerUnitSchema,
  customerLocationSchema,
} from '../organization/customer.entity.js';

/** Explicit entities and migration classes work identically from source and compiled ESM. */
export function createDatabaseOptions(clientUrl: string) {
  return defineConfig({
    clientUrl,
    entities: [
      baseEntitySchema,
      auditEventSchema,
      userSchema,
      sessionSchema,
      unitSchema,
      sectorSchema,
      unitMembershipSchema,
      sectorMembershipSchema,
      formTemplateSchema,
      formVersionSchema,
      scheduleSchema,
      scheduleResponsibleSchema,
      assignmentSchema,
      assignmentResponsibleSchema,
      inspectionSchema,
      inspectionSubmissionSchema,
      evidenceArtifactSchema,
      actionPlanSchema,
      actionPlanEventSchema,
      notificationSchema,
      reportRequestSchema,
      customerSchema,
      customerUnitSchema,
      customerLocationSchema,
      formUnitSchema,
    ],
    extensions: [Migrator],
    migrations: {
      snapshot: false,
      migrationsList: [
        Migration202610270001,
        Migration202610270002,
        Migration202610270003,
        Migration202610280001,
        Migration202610280002,
        Migration202610280003,
        Migration202610280004,
        Migration202610290001,
        Migration202610290002,
        Migration202610290003,
        Migration202610300001,
        Migration202610300002,
        Migration202610300003,
        Migration202610300004,
      ],
      transactional: true,
      allOrNothing: true,
    },
    allowGlobalContext: false,
    debug: false,
  });
}
