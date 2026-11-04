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
  history = false,
): Promise<QssmaDashboard> {
  const historicalType = `case h.form_type when 'Altura-EPC' then 'Trabalho em Altura'
    when 'Confinado-EPC' then 'Espaço Confinado' when 'Escavacao-EPC' then 'Escavação'
    when 'Solda-EPC' then 'Atividade com Solda' when 'Inspecao-EPC' then 'Inspeção EPC'
    when 'Inspecao-SPCS' then 'Inspeção SPCS' else h.form_type end`;
  const historical = history
    ? `, historical_inspections as (
    select h.* from qssma_historical_inspection h
    where h.inspection_date between ?::date and ?::date
      and (?::uuid is null or exists(select 1 from organization_unit u where u.id=?::uuid and lower(u.name)=lower(h.unit)))
      and (?::uuid is null or exists(select 1 from organization_sector s join organization_unit u on u.id=s.unit_id
        where s.id=?::uuid and lower(u.name)=lower(h.unit) and lower(s.name)=lower(${historicalType})))
      and (?::uuid is null or exists(select 1 from form_template f where f.id=?::uuid and
        lower(f.name) in (lower(h.form_type), lower(${historicalType}))))
      and (?::uuid is null or exists(select 1 from inspection_customer c where c.id=?::uuid and lower(c.name)=lower(h.customer)))
      and (?::uuid is null or exists(select 1 from customer_location l where l.id=?::uuid and lower(l.name)=lower(h.location)
        and exists(select 1 from inspection_customer c where c.id=l.customer_id and lower(c.name)=lower(h.customer))))
      and (?::uuid is null or exists(select 1 from portal_user u where u.id=?::uuid and lower(u.name)=lower(h.inspector)))
  ), historical_deviations as (
    select d.*, h.inspection_date,
      case lower(d.priority) when 'baixa' then 'LOW' when 'média' then 'MEDIUM' when 'alta' then 'HIGH' when 'crítica' then 'CRITICAL' end priority_code
    from qssma_historical_deviation d join historical_inspections h on h.protocol=d.protocol
    where (?::text is null or lower(d.category)=lower(?::text))
  ), filtered_history as (
    select * from historical_deviations where (?::text is null or priority_code=?::text)
  )`
    : `, historical_inspections as (
    select null::text protocol, null::date inspection_date, null::text form_type,
      null::text unit, null::text location, null::text inspector where false
  ), filtered_history as (
    select null::text protocol, null::date inspection_date, null::text source_status,
      null::text priority_code, null::text category where false
  )`;
  const args = [
    ...sql.args,
    ...(history
      ? [
          q.from,
          q.to,
          ...[
            q.unitId,
            q.sectorId,
            q.formId,
            q.customerId,
            q.locationId,
            q.inspectorId,
            q.category,
            q.priority,
          ].flatMap((value) => [value ?? null, value ?? null]),
        ]
      : []),
  ];
  const cte = `${sql.cte}${historical}, history_selected as (
    select * from historical_inspections
    ${q.category || q.priority ? 'where protocol in (select protocol from filtered_history)' : ''}
  ), q_inspections as (
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
      historical: number;
      historicalWithDeviation: number;
    }[]
  >(
    `${cte} select
    (select count(*)::int from q_inspections) inspections,
    (select count(distinct inspection_id)::int from q_deviations) nonconforming,
    (select count(*)::int from history_selected) historical,
    (select count(distinct protocol)::int from filtered_history) "historicalWithDeviation",
    ((select count(*) from q_deviations)+(select count(*) from filtered_history))::int deviations,
    ((select count(*) from q_deviations where treated)+(select count(*) from filtered_history where source_status='Tratado'))::int treated,
    (select count(*)::int from author_days) days,
    (select count(*)::int from author_days where failed) as "failedDays"`,
    args,
  );
  const row = counts!;
  const [scopeTotal] = await em.execute<{ total: number }[]>(
    `${unfiltered.cte} select (count(*)${history ? ' + (select count(*) from qssma_historical_deviation)' : ''})::int total from latest s cross join lateral jsonb_array_elements(s.nonconformities) nc`,
    unfiltered.args,
  );
  const months = await em.execute<QssmaDashboard['months']>(
    `${cte}, months as (
    select generate_series(date_trunc('month',?::date),date_trunc('month',?::date),interval '1 month') as month_start
  ) select to_char(m.month_start,'YYYY-MM') as "month",
    ((select count(*) from q_inspections i where date_trunc('month',i.completed_at at time zone 'America/Sao_Paulo')=m.month_start)+(select count(*) from history_selected h where date_trunc('month',h.inspection_date)=m.month_start))::int inspections,
    ((select count(*) from q_deviations d where date_trunc('month',d.completed_at at time zone 'America/Sao_Paulo')=m.month_start)+(select count(*) from filtered_history h where date_trunc('month',h.inspection_date)=m.month_start))::int deviations,
    ((select count(*) from q_deviations d where d.treated and date_trunc('month',d.completed_at at time zone 'America/Sao_Paulo')=m.month_start)+(select count(*) from filtered_history h where h.source_status='Tratado' and date_trunc('month',h.inspection_date)=m.month_start))::int treated
    from months m order by m.month_start`,
    [...args, q.from, q.to],
  );
  const priorities = await em.execute<QssmaDashboard['priorities']>(
    `${cte} select label,count(*)::int count from (
      select nc->>'priority' label from q_deviations union all select priority_code from filtered_history
    ) combined where label is not null group by 1 order by 1`,
    args,
  );
  const statusCounts = await em.execute<{ label: string; count: number }[]>(
    `${cte} select label,count(*)::int count from (
      select case when treated then 'Tratados' when plan_state='IN_PROGRESS' then 'Em andamento' when plan_state='AWAITING_VALIDATION' then 'Aguardando validação' else 'Pendentes' end label from q_deviations
      union all select case when source_status='Tratado' then 'Tratados' else 'Pendentes' end from filtered_history
    ) combined group by 1`,
    args,
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
  const historicalDimensions = {
    types: `select concat(h.unit,' · ',${historicalType}) label from history_selected h`,
    locations: "select coalesce(location,'Sem local identificado') label from history_selected",
    inspectors: "select coalesce(inspector,'Sem responsável') label from history_selected",
    categories: "select coalesce(category,'Sem categoria') label from filtered_history",
  };
  for (const [name, dimension] of Object.entries(dimensions)) {
    const label =
      name === 'locations'
        ? `(array_agg(${dimension.label} order by i.completed_at desc,i.id desc))[1]`
        : `max(${dimension.label})`;
    const key = name as keyof typeof rankings;
    const native = `select ${label} label,count(*)::int count from ${dimension.from} group by ${dimension.key}`;
    rankings[key] = await em.execute(
      history
        ? `${cte}, historic_labels as (${historicalDimensions[key]}), combined as (
            ${native} union all select label,count(*)::int count from historic_labels group by label
          ) select min(label) label,sum(count)::int count from combined group by lower(label)
            order by count desc,label limit 10`
        : `${cte} ${native} order by count(*) desc,label limit 10`,
      args,
    );
  }
  const percent = (a: number, b: number) => (b ? Math.round((10000 * a) / b) / 100 : null);
  return {
    targets: { monthlyInspections: 12, conformityRate: 95 },
    metrics: {
      scopeDeviationTotal: scopeTotal!.total,
      inspections: row.inspections + row.historical,
      conformingInspections: row.inspections - row.nonconforming,
      nonconformingInspections: row.nonconforming + row.historicalWithDeviation,
      deviations: row.deviations,
      treated: row.treated,
      pending: row.deviations - row.treated,
      authorDays: row.days,
      authorDaysWithDeviation: row.failedDays,
      authorDaysWithoutDeviation: row.days - row.failedDays,
      dayConformityRate: percent(row.days - row.failedDays, row.days),
      averageDeviations:
        row.inspections + row.historical
          ? Math.round((100 * row.deviations) / (row.inspections + row.historical)) / 100
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
