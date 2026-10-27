import type { EntityManager } from '@mikro-orm/postgresql';
import { AuditEvent } from './audit-event.entity.js';
import { sanitizeChanges } from './sanitize-changes.js';

export interface AuditRecordInput {
  /** Null/absent for explicitly system-generated events. */
  actorId?: string | null;
  action: string;
  resource: string;
  resourceId: string;
  requestId: string;
  changes?: Record<string, unknown>;
}

export class AuditService {
  constructor(private readonly entityManager: EntityManager) {}

  /** Supply the business transaction's manager to make its audit event atomic with it. */
  async record(input: AuditRecordInput, em = this.entityManager): Promise<string> {
    const event = new AuditEvent();
    event.actorId = input.actorId ?? null;
    event.action = input.action;
    event.resource = input.resource;
    event.resourceId = input.resourceId;
    event.requestId = input.requestId;
    event.changes = sanitizeChanges(input.changes ?? {});
    em.persist(event);
    await em.flush();
    return event.id;
  }
}
