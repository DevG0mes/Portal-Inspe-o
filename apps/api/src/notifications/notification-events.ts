import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { NotificationKind } from '@portal/contracts';
/** Call with the business transaction's EM. Conflict never resets an existing read receipt. */
export async function emitOnce(
  em: EntityManager,
  eventKey: string,
  recipientId: string,
  payload: {
    kind: NotificationKind;
    resourceType: 'ACTION_PLAN' | 'ASSIGNMENT';
    resourceId: string;
  },
) {
  await em.execute(
    `insert into notification(id,created_at,updated_at,recipient_id,event_key,kind,resource_type,resource_id)
    values (?,now(),now(),?,?,?,?,?) on conflict (recipient_id,event_key) do nothing`,
    [randomUUID(), recipientId, eventKey, payload.kind, payload.resourceType, payload.resourceId],
  );
}
/** Current eligible recipients only; use generic messages, never copy inspection answers into notices. */
export async function managers(
  em: EntityManager,
  unitId: string,
  sectorId: string,
): Promise<{ id: string }[]> {
  return em.execute(
    `select u.id from portal_user u where u.is_active and not u.must_change_password and
    (u.role='ADMIN' or (u.role='MANAGER' and exists(select 1 from sector_membership sm join unit_membership um on um.id=sm.unit_membership_id where sm.sector_id=? and sm.is_active and um.is_active and um.unit_id=? and um.user_id=u.id))) order by u.id`,
    [sectorId, unitId],
  );
}
