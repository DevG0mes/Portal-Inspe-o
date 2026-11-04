import { ForbiddenException } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import type {
  AuthenticatedPrincipal,
  AnalyticsSummary,
  AnalyticsOccurrence,
  AnalyticsPlan,
  AnalyticsGroups,
  AnalyticsTrend,
} from '@portal/contracts';
import { z } from 'zod';
import { parseInput, paginationShape, escapeLike } from '../common/input.js';
import { AccessPolicy } from '../access/access-policy.service.js';
import { Sector } from '../organization/sector.entity.js';
import { parseAnalytics } from './analytics.dto.js';
import { analyticsQuery } from './analytics.queries.js';
import { qssmaDashboard, treatment } from './qssma.queries.js';
import { qssmaHistory } from './qssma-history.queries.js';
export class AnalyticsService {
  async history(actor: AuthenticatedPrincipal) {
    const em = this.em.fork();
    await this.access.requireRoles(actor, ['ADMIN'], em);
    return qssmaHistory(em);
  }

  async qssma(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const { q, em, sql, user } = await this.context(actor, raw, requestId);
    const unfiltered = await this.context(actor, {}, requestId);
    return em.transactional(async (tx) => {
      await tx.execute('set transaction isolation level repeatable read');
      return qssmaDashboard(tx, sql, q, unfiltered.sql, user.role === 'ADMIN');
    });
  }

  async filterOptions(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const input = parseInput(
      z
        .object({
          ...paginationShape,
          dimension: z.enum(['customers', 'locations', 'inspectors']),
          q: z.string().trim().max(120).optional(),
          unitId: z.uuid().optional(),
          customerId: z.uuid().optional(),
        })
        .strict(),
      raw,
    );
    const { em, sql } = await this.context(
      actor,
      { unitId: input.unitId, customerId: input.customerId },
      requestId,
    );
    const dimension = {
      customers: { id: "i.context->>'customerId'", name: "i.context->>'customerName'" },
      locations: { id: "i.context->>'locationId'", name: "i.context->>'locationName'" },
      inspectors: { id: 'u.id::text', name: 'u.name' },
    }[input.dimension];
    const cte = `${sql.cte}, options as (select ${dimension.id} id,max(${dimension.name}) name from base i join portal_user u on u.id=i.created_by_id where ${dimension.id} is not null group by ${dimension.id})`;
    const args = [...sql.args, `%${escapeLike(input.q ?? '')}%`];
    const [count] = await em.execute(
      `${cte} select count(*)::int total from options where name ilike ? escape '\\'`,
      args,
    );
    const data = await em.execute(
      `${cte} select id,name from options where name ilike ? escape '\\' order by name,id limit ? offset ?`,
      [...args, input.pageSize, (input.page - 1) * input.pageSize],
    );
    return { data, total: count!.total, page: input.page, pageSize: input.pageSize };
  }
  constructor(
    private readonly em: EntityManager,
    private readonly access: AccessPolicy,
    private readonly snapshotEm?: EntityManager,
  ) {}
  private async context(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const q = parseAnalytics(raw),
      em = this.snapshotEm ?? this.em.fork(),
      user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER'], em);
    const scope = await this.access.sectorFilter(actor, requestId, em);
    const sectors = await em.find(
      Sector,
      { $and: [scope, { isActive: true, unit: { isActive: true } }] },
      { populate: ['unit'] },
    );
    if (
      (q.unitId && !sectors.some((s) => s.unit.id === q.unitId)) ||
      (q.sectorId &&
        !sectors.some((s) => s.id === q.sectorId && (!q.unitId || s.unit.id === q.unitId)))
    )
      throw new ForbiddenException('Filtro fora do seu escopo.');
    const sql = analyticsQuery(
      q,
      sectors.map((s) => s.id),
      user.role === 'COLLABORATOR' ? user.id : null,
      new Date(),
    );
    return { q, em, user, sql };
  }
  async summary(
    actor: AuthenticatedPrincipal,
    raw: unknown,
    requestId: string,
  ): Promise<AnalyticsSummary> {
    const { q, em, user, sql } = await this.context(actor, raw, requestId);
    const [row] = await em.execute<
      {
        completed: number;
        drafts: number;
        pending: number;
        overdue: number;
        evaluated: number;
        failed: number;
        nc: number;
        plans: number;
        open: number;
        progress: number;
        validation: number;
        done: number;
        late: number;
        critical: number;
        hours: number | null;
      }[]
    >(
      `${sql.cte} select
      (select count(*)::int from selected) completed,(select count(*)::int from drafts) drafts,
      (select count(*)::int from assignments where occurrence_at<=?::timestamptz) pending,
      (select count(*)::int from assignments where due_at<?::timestamptz) overdue,
      (select count(*)::int from evaluated) evaluated,(select count(*)::int from occurrences) nc,
      (select count(*)::int from evaluated e where exists(select 1 from occurrences o where o.submission_id=e.submission_id and o.nc->>'questionId'=e.question_id)) failed,
      (select count(*)::int from plans) plans,(select count(*)::int from plans where state='OPEN') open,
      (select count(*)::int from plans where state='IN_PROGRESS') progress,(select count(*)::int from plans where state='AWAITING_VALIDATION') validation,
      (select count(*)::int from plans where state='COMPLETED') done,(select count(*)::int from plans where state<>'COMPLETED' and due_at<?::timestamptz) late,
      (select count(*)::int from plans where state<>'COMPLETED' and priority='CRITICAL') critical,
      (select avg(extract(epoch from (completed_at-created_at))/3600)::float from plans where state='COMPLETED' and completed_at>=created_at) hours`,
      [...sql.args, sql.now, sql.now, sql.now],
    );
    let administration: AnalyticsSummary['administration'] = null;
    if (user.role === 'ADMIN') {
      const [a] = await em.execute<NonNullable<AnalyticsSummary['administration']>[]>(
        `select (select count(*)::int from portal_user where is_active) as "activeUsers",(select count(*)::int from organization_unit where is_active) units,(select count(*)::int from organization_sector s join organization_unit u on u.id=s.unit_id where s.is_active and u.is_active) sectors,(select count(*)::int from form_template where state='PUBLISHED') as "publishedForms",(select count(*)::int from form_template where state='DRAFT') as "draftForms",(select count(*)::int from form_template where state='ARCHIVED' and deleted_at is null) as "archivedForms"`,
      );
      administration = a ?? null;
    }
    return {
      from: q.from,
      to: q.to,
      inspections: {
        completed: row!.completed,
        drafts: row!.drafts,
        pending: row!.pending,
        overdue: row!.overdue,
        evaluatedAnswers: row!.evaluated,
        nonconformingAnswers: row!.failed,
        nonconformities: row!.nc,
        conformityRate: row!.evaluated
          ? Math.round(10000 * (1 - row!.failed / row!.evaluated)) / 100
          : null,
      },
      plans: {
        total: row!.plans,
        open: row!.open,
        inProgress: row!.progress,
        awaitingValidation: row!.validation,
        completed: row!.done,
        overdue: row!.late,
        critical: row!.critical,
        averageResolutionHours: row!.hours === null ? null : Math.round(row!.hours * 100) / 100,
      },
      administration,
    };
  }
  async trends(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const { em, sql } = await this.context(actor, raw, requestId);
    const data = await em.execute<AnalyticsTrend[]>(
      `${sql.cte} select to_char(s.completed_at at time zone 'America/Sao_Paulo','YYYY-MM-DD') date,count(*)::int completed,coalesce(sum((select count(*) from occurrences o where o.submission_id=s.id)),0)::int nonconformities from selected s group by 1 order by 1`,
      sql.args,
    );
    return { data };
  }
  async occurrences(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const { q, em, sql } = await this.context(actor, raw, requestId);
    const [count] = await em.execute(
      `${sql.cte} select count(*)::int total from occurrences`,
      sql.args,
    );
    const data: AnalyticsOccurrence[] = await em.execute(
      `${sql.cte} select o.submission_id as "submissionId",o.inspection_id as "inspectionId",o.nc->>'questionId' as "questionId",coalesce((select question->>'label' from jsonb_array_elements(o.snapshot->'sections') section cross join lateral jsonb_array_elements(section->'questions') question where question->>'id'=o.nc->>'questionId'),'Pergunta de origem') as "questionLabel",u.name as "unitName",s.name as "sectorName",o.snapshot->>'title' as "formTitle",o.nc->>'category' category,o.nc->>'priority' priority,o.completed_at as "completedAt",i.context->>'customerName' as "customerName",i.context->>'locationName' as "locationName",case when ${treatment('o')} then 'Tratado' else 'Pendente' end as "treatmentStatus",
(select a->>'value' from jsonb_array_elements(o.snapshot->'sections') section cross join lateral jsonb_array_elements(section->'questions') question cross join lateral jsonb_array_elements(coalesce(question->'visibleWhen','[]'::jsonb)) rule join inspection_submission src on src.id=o.submission_id cross join lateral jsonb_array_elements(src.answers) a where question->>'type'='TEXT' and question->>'label' ~* 'a(ç|c)(ã|a)o realizada' and rule->>'questionId'=o.nc->>'questionId' and a->>'questionId'=question->>'id' limit 1) as "actionText"
from occurrences o join inspection i on i.id=o.inspection_id join organization_unit u on u.id=o.unit_id join organization_sector s on s.id=o.sector_id order by o.completed_at desc,o.submission_id,o.nc->>'questionId' limit ? offset ?`,
      [...sql.args, q.pageSize, (q.page - 1) * q.pageSize],
    );
    const dimensions = {
      units: { key: 'u.id', label: 'u.name' },
      sectors: { key: 's.id', label: "concat(u.name,' · ',s.name)" },
      forms: { key: 'f.id', label: 'f.name' },
      categories: { key: "o.nc->>'category'", label: "o.nc->>'category'" },
      priorities: { key: "o.nc->>'priority'", label: "o.nc->>'priority'" },
    };
    const groups = {} as AnalyticsGroups;
    for (const [name, dimension] of Object.entries(dimensions)) {
      groups[name as keyof AnalyticsGroups] = await em.execute(
        `${sql.cte} select ${dimension.label} label,count(*)::int count from occurrences o join organization_unit u on u.id=o.unit_id join organization_sector s on s.id=o.sector_id join inspection i on i.id=o.inspection_id join form_version v on v.id=i.form_version_id join form_template f on f.id=v.template_id group by ${dimension.key},${dimension.label} order by count(*) desc,${dimension.label} limit 10`,
        sql.args,
      );
    }
    return { data, groups, total: count!.total, page: q.page, pageSize: q.pageSize };
  }
  async plans(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const { q, em, sql } = await this.context(actor, raw, requestId);
    const [count] = await em.execute(`${sql.cte} select count(*)::int total from plans`, sql.args);
    const data: AnalyticsPlan[] = await em.execute(
      `${sql.cte} select p.id,p.description,p.state,p.priority,p.due_at as "dueAt",(p.state<>'COMPLETED' and p.due_at<?::timestamptz) overdue,u.name as "unitName",s.name as "sectorName" from plans p join organization_unit u on u.id=p.unit_id join organization_sector s on s.id=p.sector_id order by p.due_at,p.id limit ? offset ?`,
      [...sql.args, sql.now, q.pageSize, (q.page - 1) * q.pageSize],
    );
    return { data, total: count!.total, page: q.page, pageSize: q.pageSize };
  }
  async forms(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const q = parseInput(
      z.object({ ...paginationShape, q: z.string().trim().max(120).optional() }).strict(),
      raw,
    );
    const { em, sql } = await this.context(actor, {}, requestId);
    const args = [...sql.args, `%${escapeLike(q.q ?? '')}%`];
    const from = `from form_template f where (f.id in (select template_id from base) or f.id in (select plan_form_id from plan_base)) and f.name ilike ? escape '\\'`;
    const [count] = await em.execute(`${sql.cte} select count(*)::int total ${from}`, args);
    const data = await em.execute(
      `${sql.cte} select f.id,f.name ${from} order by f.name,f.id limit ? offset ?`,
      [...args, q.pageSize, (q.page - 1) * q.pageSize],
    );
    return { data, total: count!.total, page: q.page, pageSize: q.pageSize };
  }
}
