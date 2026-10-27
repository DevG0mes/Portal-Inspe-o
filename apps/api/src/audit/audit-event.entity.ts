import { EntitySchema } from '@mikro-orm/core';
import { BaseEntity } from '../database/base.entity.js';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Append-only history. Database triggers reject mutation even through raw SQL. */
export class AuditEvent extends BaseEntity {
  actorId: string | null = null;
  action!: string;
  resource!: string;
  resourceId!: string;
  requestId!: string;
  changes: Record<string, JsonValue> = {};
}

export const auditEventSchema = new EntitySchema<AuditEvent, BaseEntity>({
  class: AuditEvent,
  extends: BaseEntity,
  tableName: 'audit_event',
  properties: {
    actorId: { type: 'uuid', nullable: true },
    action: { type: 'string', length: 120 },
    resource: { type: 'string', length: 120 },
    resourceId: { type: 'string', length: 255 },
    requestId: { type: 'string', length: 120 },
    changes: { type: 'json', columnType: 'jsonb' },
  },
  indexes: [
    { properties: ['resource', 'resourceId', 'createdAt'] },
    { properties: ['actorId', 'createdAt'] },
    { properties: ['requestId'] },
  ],
});
