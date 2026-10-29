import type { AnalyticsQuery } from './analytics.dto.js';
/** All dynamic values are bindings. Only server-owned SQL fragments enter the query text. */
export function analyticsQuery(
  q: AnalyticsQuery,
  sectors: string[],
  collaboratorId: string | null,
  now: Date,
) {
  const args: unknown[] = [];
  const bind = (v: unknown) => {
    args.push(v);
    return '?';
  };
  const scope = (alias: string) =>
    `${alias}.sector_id=any(${bind(`{${sectors.join(',')}}`)}::uuid[])${q.unitId ? ` and ${alias}.unit_id=${bind(q.unitId)}` : ''}${q.sectorId ? ` and ${alias}.sector_id=${bind(q.sectorId)}` : ''}`;
  const form = (column: string) => (q.formId ? ` and ${column}=${bind(q.formId)}` : '');
  const period = (column: string) =>
    `${column}>=(${bind(q.from)}::date::timestamp at time zone 'America/Sao_Paulo') and ${column}<((${bind(q.to)}::date+1)::timestamp at time zone 'America/Sao_Paulo')`;
  const dimension = (cat: string, priority: string) =>
    `${q.category ? ` and ${cat}=${bind(q.category)}` : ''}${q.priority ? ` and ${priority}=${bind(q.priority)}` : ''}`;
  const base = `select i.*,v.snapshot,v.template_id from inspection i join form_version v on v.id=i.form_version_id where ${scope('i')}${form('v.template_id')}${collaboratorId ? ` and (i.created_by_id=${bind(collaboratorId)} or exists(select 1 from assignment_responsible ar where ar.assignment_id=i.assignment_id and ar.user_id=${bind(collaboratorId)}))` : ''}`;
  const completions = `select s.*,i.unit_id,i.sector_id,i.snapshot from latest s join base i on i.id=s.inspection_id where ${period('s.completed_at')}`;
  const evaluated = `select s.inspection_id,s.id as submission_id,question->>'id' as question_id from completions s cross join lateral jsonb_array_elements(s.snapshot->'sections') section cross join lateral jsonb_array_elements(section->'questions') question join lateral jsonb_array_elements(s.answers) answer on answer->>'questionId'=question->>'id' where question->'nonconformity' is not null and question->'nonconformity'<>'null'::jsonb and answer->'value'<>'null'::jsonb and answer->>'value'<>'' and not(question->>'type'='YES_NO_NA' and answer->>'value'='NA')${dimension("question->'nonconformity'->>'category'", "question->'nonconformity'->>'priority'")}`;
  const occurrences = `select s.id as submission_id,s.inspection_id,s.completed_at,s.unit_id,s.sector_id,s.snapshot,nc from completions s cross join lateral jsonb_array_elements(s.nonconformities) nc where true${dimension("nc->>'category'", "nc->>'priority'")}`;
  const planBase = `select p.*,pv.template_id as plan_form_id from action_plan p join inspection_submission ps on ps.id=p.submission_id join inspection pi on pi.id=ps.inspection_id join form_version pv on pv.id=pi.form_version_id where ${scope('p')}${form('pv.template_id')}${dimension('p.category', 'p.priority')}${collaboratorId ? ` and p.responsible_id=${bind(collaboratorId)}` : ''}`;
  const plans = `select * from plan_base where ${period('created_at')}`;
  const assignments = `select a.* from inspection_assignment a join inspection_schedule s on s.id=a.schedule_id where ${scope('s')}${form('s.form_id')} and ${period('a.occurrence_at')} and a.status='PLANNED' and not exists(select 1 from inspection i where i.assignment_id=a.id and i.state='COMPLETED')${collaboratorId ? ` and exists(select 1 from assignment_responsible ar where ar.assignment_id=a.id and ar.user_id=${bind(collaboratorId)})` : ''}${q.category || q.priority ? ' and false' : ''}`;
  const drafts = `select i.id from base i where i.state='DRAFT' and ${period('i.created_at')}${q.category || q.priority ? ' and false' : ''}`;
  const cte = `with base as (${base}),latest as (select distinct on (s.inspection_id) s.* from inspection_submission s join base b on b.id=s.inspection_id order by s.inspection_id,s.cycle desc),completions as (${completions}),evaluated as (${evaluated}),occurrences as (${occurrences}),plan_base as (${planBase}),plans as (${plans}),assignments as (${assignments}),drafts as (${drafts}),selected as (select * from completions${q.category || q.priority ? ' where id in (select submission_id from evaluated)' : ''})`;
  return { cte, args, now: now.toISOString() };
}
