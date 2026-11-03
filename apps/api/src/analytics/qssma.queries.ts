import type { EntityManager } from '@mikro-orm/postgresql';
import type { QssmaDashboard } from '@portal/contracts';
import type { analyticsQuery } from './analytics.queries.js';
import type { AnalyticsQuery } from './analytics.dto.js';

/** Treatment is an occurrence-level fact, never inferred from free text or plan creation date. */
export const treatment = (alias: string) =>
  `exists(select 1 from action_plan approved where approved.submission_id=${alias}.submission_id and approved.question_id::text=${alias}.nc->>'questionId' and approved.state='COMPLETED' and approved.completed_at is not null)`;

export async function qssmaDashboard(
  em: EntityManager,
  sql: ReturnType<typeof analyticsQuery>,
  q: AnalyticsQuery,
  unfiltered = sql,
): Promise<QssmaDashboard> {
  const cte = `${sql.cte}, q_inspections as (
    select s.*, b.created_by_id, b.context from selected s join base b on b.id=s.inspection_id
  ), q_deviations as (
    select o.*, ${treatment('o')} treated,p.state as plan_state from occurrences o left join action_plan p on p.submission_id=o.submission_id and p.question_id::text=o.nc->>'questionId'
  ), author_days as (
    select s.created_by_id,(s.completed_at at time zone 'America/Sao_Paulo')::date as inspection_day,
      bool_or(exists(select 1 from q_deviations d where d.submission_id=s.id)) failed
    from q_inspections s group by 1,2
  )`;
  const [counts] = await em.execute<
    {
      inspections: number;
      nonconforming: number;
      deviations: number;
      treated: number;
      days: number;
      failedDays: number;
    }[]
  >(
    `${cte} select
    (select count(*)::int from q_inspections) inspections,
    (select count(distinct inspection_id)::int from q_deviations) nonconforming,
    (select count(*)::int from q_deviations) deviations,
    (select count(*)::int from q_deviations where treated) treated,
    (select count(*)::int from author_days) days,
    (select count(*)::int from author_days where failed) as "failedDays"`,
    sql.args,
  );
  const row = counts!;
  const [scopeTotal] = await em.execute<{ total: number }[]>(
    `${unfiltered.cte} select count(*)::int total from latest s cross join lateral jsonb_array_elements(s.nonconformities) nc`,
    unfiltered.args,
  );
  const months = await em.execute<QssmaDashboard['months']>(
    `${cte}, months as (
    select generate_series(date_trunc('month',?::date),date_trunc('month',?::date),interval '1 month') as month_start
  ) select to_char(m.month_start,'YYYY-MM') as "month",
    (select count(*)::int from q_inspections i where date_trunc('month',i.completed_at at time zone 'America/Sao_Paulo')=m.month_start) inspections,
    (select count(*)::int from q_deviations d where date_trunc('month',d.completed_at at time zone 'America/Sao_Paulo')=m.month_start) deviations,
    (select count(*)::int from q_deviations d where d.treated and date_trunc('month',d.completed_at at time zone 'America/Sao_Paulo')=m.month_start) treated
    from months m order by m.month_start`,
    [...sql.args, q.from, q.to],
  );
  const priorities = await em.execute<QssmaDashboard['priorities']>(
    `${cte} select nc->>'priority' label,count(*)::int count from q_deviations group by 1 order by 1`,
    sql.args,
  );
  const statusCounts = await em.execute<{ label: string; count: number }[]>(
    `${cte} select case when treated then 'Tratados' when plan_state='IN_PROGRESS' then 'Em andamento' when plan_state='AWAITING_VALIDATION' then 'Aguardando validação' else 'Pendentes' end label,count(*)::int count from q_deviations group by 1`,
    sql.args,
  );
  const dimensions = {
    types: {
      from: 'q_inspections i join organization_sector s on s.id=i.sector_id join organization_unit u on u.id=i.unit_id',
      key: 's.id',
      label: "concat(u.name,' · ',s.name)",
    },
    locations: {
      from: 'q_inspections i',
      key: "coalesce(i.context->>'locationId','legacy')",
      label: "coalesce(i.context->>'locationName','Sem local identificado')",
    },
    inspectors: {
      from: 'q_inspections i join portal_user u on u.id=i.created_by_id',
      key: 'u.id',
      label: 'u.name',
    },
    categories: { from: 'q_deviations d', key: "d.nc->>'category'", label: "d.nc->>'category'" },
  };
  const rankings = {} as QssmaDashboard['rankings'];
  for (const [name, dimension] of Object.entries(dimensions)) {
    const label =
      name === 'locations'
        ? `(array_agg(${dimension.label} order by i.completed_at desc,i.id desc))[1]`
        : `max(${dimension.label})`;
    rankings[name as keyof typeof rankings] = await em.execute(
      `${cte} select ${label} label,count(*)::int count from ${dimension.from} group by ${dimension.key} order by count(*) desc,label limit 10`,
      sql.args,
    );
  }
  const percent = (a: number, b: number) => (b ? Math.round((10000 * a) / b) / 100 : null);
  return {
    targets: { monthlyInspections: 12, conformityRate: 95 },
    metrics: {
      scopeDeviationTotal: scopeTotal!.total,
      inspections: row.inspections,
      conformingInspections: row.inspections - row.nonconforming,
      nonconformingInspections: row.nonconforming,
      deviations: row.deviations,
      treated: row.treated,
      pending: row.deviations - row.treated,
      authorDays: row.days,
      authorDaysWithDeviation: row.failedDays,
      authorDaysWithoutDeviation: row.days - row.failedDays,
      dayConformityRate: percent(row.days - row.failedDays, row.days),
      averageDeviations: row.inspections
        ? Math.round((100 * row.deviations) / row.inspections) / 100
        : null,
      treatmentRate: percent(row.treated, row.deviations),
    },
    months,
    priorities,
    rankings,
    statuses: ['Tratados', 'Pendentes', 'Em andamento', 'Aguardando validação'].map((label) => ({
      label,
      count: statusCounts.find((s) => s.label === label)?.count ?? 0,
    })),
  };
}
