import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/postgresql';
/** Anti-join is the durable cursor: handled recipients leave the next bounded batch. */
export class DeadlineNotifications {
  constructor(private readonly em: EntityManager) {}
  async run(now = new Date()) {
    let emitted = 0;
    for (const type of ['ACTION_PLAN', 'ASSIGNMENT'] as const) {
      const action = type === 'ACTION_PLAN';
      const source = action
        ? `select a.id,a.due_at,a.responsible_id as recipient_id,a.unit_id,a.sector_id from action_plan a where a.state <> 'COMPLETED'`
        : `select a.id,a.due_at,r.user_id as recipient_id,s.unit_id,s.sector_id from inspection_assignment a join inspection_schedule s on s.id=a.schedule_id join assignment_responsible r on r.assignment_id=a.id where a.status='PLANNED' and not exists(select 1 from inspection i where i.assignment_id=a.id and i.state='COMPLETED')`;
      await this.em.fork().transactional(async (em) => {
        const rows: { id: string; recipient_id: string; kind: string; event_key: string }[] =
          await em.execute(
            `with source as (${source}), candidates as (
          select a.id,a.recipient_id,concat('${action ? 'ACTION' : 'ASSIGNMENT'}_',case when a.due_at < ? then 'OVERDUE' else 'DUE' end) as kind,
            concat('deadline-${type}-',a.id,'-',extract(epoch from a.due_at),'-',case when a.due_at < ? then 'late' else 'soon' end) as event_key
          from source a join portal_user u on u.id=a.recipient_id join organization_unit un on un.id=a.unit_id join organization_sector se on se.id=a.sector_id
          where a.due_at <= ? and u.is_active and not u.must_change_password and un.is_active and se.is_active ${action ? "and u.role in ('ADMIN','MANAGER')" : ''} and
          (u.role='ADMIN' or exists(select 1 from sector_membership sm join unit_membership um on um.id=sm.unit_membership_id where sm.sector_id=a.sector_id and sm.is_active and um.is_active and um.unit_id=a.unit_id and um.user_id=u.id))
        ) select c.* from candidates c where not exists(select 1 from notification n where n.recipient_id=c.recipient_id and n.event_key=c.event_key) order by c.event_key,c.recipient_id limit 100`,
            [now, now, new Date(now.getTime() + 86400000)],
          );
        for (const row of rows) {
          await em.execute(
            `insert into notification(id,created_at,updated_at,recipient_id,event_key,kind,resource_type,resource_id) values (?,now(),now(),?,?,?,?,?) on conflict (recipient_id,event_key) do nothing`,
            [randomUUID(), row.recipient_id, row.event_key, row.kind, type, row.id],
          );
          emitted++;
        }
      });
    }
    return { emitted };
  }
}
