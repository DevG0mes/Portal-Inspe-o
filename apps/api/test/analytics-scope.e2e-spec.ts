import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, it, expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestDatabase } from './helpers/test-database.js';
import { createApplication } from '../src/app.js';
import { User } from '../src/identity/user.entity.js';
import { PasswordService } from '../src/auth/password.service.js';
import { Unit } from '../src/organization/unit.entity.js';
import { Sector } from '../src/organization/sector.entity.js';
import { UnitMembership, SectorMembership } from '../src/organization/membership.entity.js';
import { FormTemplate } from '../src/forms/entities/form-template.entity.js';
import { FormVersion } from '../src/forms/entities/form-version.entity.js';
import { Inspection, InspectionSubmission } from '../src/inspections/inspection.entity.js';
import { ActionPlan } from '../src/action-plans/action-plan.entity.js';
import { definition, question } from './helpers/form-fixtures.js';
import { analyticsQuery } from '../src/analytics/analytics.queries.js';
import { parseAnalytics } from '../src/analytics/analytics.dto.js';
import { RuleEngine } from '@portal/form-engine';
let db: Awaited<ReturnType<typeof createTestDatabase>>, app: INestApplication, origin: string;
const users: User[] = [],
  cookies: string[] = [],
  sectors: Sector[] = [],
  units: Unit[] = [];
const q = question('YES_NO_NA', {
  nonconformity: { operator: 'EQ', value: 'NO', category: 'Proteção', priority: 'HIGH' },
});
const period = 'from=2026-10-29&to=2026-10-29';
const customerIds = [randomUUID(), randomUUID()],
  locationIds = [randomUUID(), randomUUID()];
let template: FormTemplate;
beforeAll(async () => {
  db = await createTestDatabase();
  const em = db.orm.em.fork(),
    hash = await new PasswordService().hash('Teste de indicadores 2026!');
  for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR', 'COLLABORATOR']) {
    const user = new User();
    Object.assign(user, {
      name: role,
      role,
      email: `${randomUUID()}@example.test`,
      passwordHash: hash,
      mustChangePassword: false,
    });
    em.persist(user);
    users.push(user);
  }
  for (let i = 0; i < 2; i++) {
    const unit = new Unit();
    Object.assign(unit, { name: `Unidade ${i}`, nameKey: `unidade ${i}` });
    units.push(unit);
    const sector = new Sector();
    Object.assign(sector, { name: `Setor ${i}`, nameKey: `setor ${i}`, unit });
    sectors.push(sector);
    em.persist([unit, sector]);
  }
  for (const user of users.slice(1, 3)) {
    const um = new UnitMembership();
    Object.assign(um, { user, unit: units[0] });
    const sm = new SectorMembership();
    Object.assign(sm, { unitMembership: um, sector: sectors[0] });
    em.persist([um, sm]);
  }
  template = new FormTemplate();
  Object.assign(template, {
    name: 'Ficha arquivada',
    nameKey: 'ficha arquivada',
    state: 'ARCHIVED',
    latestVersion: 1,
    draftSnapshot: null,
  });
  const version = new FormVersion();
  Object.assign(version, {
    template,
    number: 1,
    contentHash: 'b'.repeat(64),
    snapshot: definition([q]),
    publishedBy: users[0],
  });
  em.persist([template, version]);
  let failed: InspectionSubmission | undefined;
  for (const [index, value] of ['YES', 'NO', 'NA', 'NO'].entries()) {
    const inspection = new Inspection();
    Object.assign(inspection, {
      unit: units[index === 3 ? 1 : 0],
      sector: sectors[index === 3 ? 1 : 0],
      createdBy: users[index === 3 ? 3 : 2],
      formVersion: version,
      state: 'COMPLETED',
      cycle: index === 0 ? 2 : 1,
      createdAt: new Date('2026-10-29T10:00:00Z'),
      ...([0, 1, 3].includes(index)
        ? {
            context: {
              customerId: customerIds[index === 3 ? 1 : 0],
              customerName: `Cliente ${index === 3 ? 1 : 0}`,
              locationId: locationIds[index === 3 ? 1 : 0],
              locationName: index === 0 ? 'Obra anterior' : `Obra ${index === 3 ? 1 : 0}`,
              participants: [],
            },
          }
        : {}),
    });
    em.persist(inspection);
    if (index === 0) {
      const old = new InspectionSubmission();
      Object.assign(old, {
        inspection,
        cycle: 1,
        sourceRevision: 1,
        completedBy: users[2],
        completedAt: new Date('2026-10-29T02:59:59Z'),
        answers: [{ questionId: q.id, value: 'NO' }],
        nonconformities: [
          {
            key: q.id,
            questionId: q.id,
            sectionId: version.snapshot.sections[0]!.id,
            category: 'Proteção',
            priority: 'HIGH',
          },
        ],
      });
      em.persist(old);
    }
    const submission = new InspectionSubmission();
    Object.assign(submission, {
      inspection,
      cycle: inspection.cycle,
      sourceRevision: 1,
      completedBy: inspection.createdBy,
      completedAt: new Date(index === 1 ? '2026-10-30T02:59:59.999Z' : '2026-10-29T03:00:00Z'),
      answers: [{ questionId: q.id, value }],
      nonconformities:
        value === 'NO'
          ? [
              {
                key: q.id,
                questionId: q.id,
                sectionId: version.snapshot.sections[0]!.id,
                category: 'Proteção',
                priority: 'HIGH',
              },
            ]
          : [],
    });
    em.persist(submission);
    if (index === 1) failed = submission;
  }
  for (const state of ['OPEN', 'COMPLETED'] as const) {
    const plan = new ActionPlan();
    Object.assign(plan, {
      submission: failed,
      questionId: state === 'OPEN' ? randomUUID() : q.id,
      unit: units[0],
      sector: sectors[0],
      createdBy: users[1],
      responsible: users[2],
      description: `Correção ${state}`,
      category: 'Proteção',
      priority: 'HIGH',
      state,
      dueDate: '2026-10-28',
      dueAt: new Date('2026-10-29T02:59:59Z'),
      createdAt: new Date('2026-10-29T10:00:00Z'),
      completedAt: state === 'COMPLETED' ? new Date('2026-10-29T12:00:00Z') : null,
    });
    em.persist(plan);
  }
  await em.flush();
  app = await createApplication({}, undefined, db.orm);
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
  for (const user of users) {
    const r = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'Teste de indicadores 2026!' }),
    });
    cookies.push(r.headers.get('set-cookie')!.split(';')[0]!);
  }
}, 30000);
afterAll(async () => {
  await app?.close();
  await db?.close();
});
function call(path: string, user = 1) {
  return fetch(`${origin}/api/analytics/${path}`, { headers: { cookie: cookies[user]! } });
}
it('restricts collaborators to inspection work regardless of their presentation mode', async () => {
  for (const path of [
    'summary',
    'qssma',
    'trends',
    'forms',
    'nonconformities',
    'action-plans',
    'filter-options',
  ]) {
    expect((await call(`${path}?${period}`, 2)).status).toBe(403);
  }
  for (const path of ['action-plans', 'action-plans/occurrences']) {
    expect(
      (await fetch(`${origin}/api/${path}`, { headers: { cookie: cookies[2]! } })).status,
    ).toBe(403);
  }
  expect(
    (await fetch(`${origin}/api/inspections`, { headers: { cookie: cookies[2]! } })).status,
  ).toBe(200);
});
it('matches QSSMA day-based measures and counts treated deviations only by completed plans', async () => {
  const response = await call(`qssma?${period}`);
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.metrics).toMatchObject({
    scopeDeviationTotal: 1,
    inspections: 3,
    conformingInspections: 2,
    nonconformingInspections: 1,
    deviations: 1,
    treated: 1,
    pending: 0,
    authorDays: 1,
    authorDaysWithDeviation: 1,
    authorDaysWithoutDeviation: 0,
    dayConformityRate: 0,
  });
  expect(data.targets).toEqual({ monthlyInspections: 12, conformityRate: 95 });
  expect(data.months).toEqual([{ month: '2026-10', inspections: 3, deviations: 1, treated: 1 }]);
  expect(data.priorities).toContainEqual({ label: 'HIGH', count: 1 });
  expect(data.rankings.locations).toContainEqual({ label: 'Obra 0', count: 2 });
  expect(data.rankings.locations.some((r: { label: string }) => r.label === 'Obra anterior')).toBe(
    false,
  );
  const global = await (await call(`qssma?${period}`, 0)).json();
  expect(global.metrics).toMatchObject({
    scopeDeviationTotal: 2,
    inspections: 4,
    deviations: 2,
    treated: 1,
    pending: 1,
    authorDays: 2,
  });
  expect((await call(`qssma?${period}&unitId=${units[1]!.id}`)).status).toBe(403);
  const empty = await (await call('qssma?from=2020-01-01&to=2020-01-01')).json();
  expect(empty.metrics.dayConformityRate).toBeNull();
  expect(empty.metrics.scopeDeviationTotal).toBe(1);
  expect(empty.months).toEqual([{ month: '2020-01', inspections: 0, deviations: 0, treated: 0 }]);
  const em = db.orm.em.fork();
  const plan = await em.findOneOrFail(ActionPlan, { questionId: q.id, state: 'COMPLETED' });
  try {
    await em.nativeUpdate(ActionPlan, plan.id, { state: 'AWAITING_VALIDATION', completedAt: null });
    const waiting = await (await call(`qssma?${period}`)).json();
    expect(waiting.metrics).toMatchObject({ treated: 0, pending: 1 });
    expect(waiting.statuses).toContainEqual({ label: 'Aguardando validação', count: 1 });
  } finally {
    await em.nativeUpdate(ActionPlan, plan.id, {
      state: 'COMPLETED',
      completedAt: new Date('2026-10-29T12:00:00Z'),
    });
  }
});
it('filters historical customers, locations and inspectors before grouping and selector pagination', async () => {
  const own = await (
    await call(
      `qssma?${period}&customerId=${customerIds[0]}&locationId=${locationIds[0]}&inspectorId=${users[2]!.id}`,
    )
  ).json();
  expect(own.metrics).toMatchObject({ inspections: 2, deviations: 1, treated: 1 });
  const denied = await (await call(`qssma?${period}&customerId=${customerIds[1]}`)).json();
  expect(denied.metrics.inspections).toBe(0);
  const options = await (await call('filter-options?dimension=customers&pageSize=1')).json();
  expect(options.total).toBe(1);
  expect(options.data).toEqual([{ id: customerIds[0], name: 'Cliente 0' }]);
  const places = await (
    await call(`filter-options?dimension=locations&customerId=${customerIds[1]}`)
  ).json();
  expect(places.total).toBe(0);
  const inspectors = await (await call('filter-options?dimension=inspectors')).json();
  expect(inspectors.data.map((u: { id: string }) => u.id)).toEqual([users[2]!.id]);
  const summary = await (await call(`summary?${period}&customerId=${customerIds[0]}`)).json();
  expect(summary.inspections.completed).toBe(2);
  expect(
    (await (await call(`nonconformities?${period}&locationId=${locationIds[0]}`)).json()).data[0],
  ).toMatchObject({
    customerName: 'Cliente 0',
    locationName: 'Obra 0',
    treatmentStatus: 'Tratado',
  });
});
it('counts the latest completion, excludes NA and preserves archived forms and São Paulo boundaries', async () => {
  const r = await call(`summary?${period}`);
  expect(r.status).toBe(200);
  const data = await r.json();
  expect(data.inspections).toMatchObject({
    completed: 3,
    drafts: 0,
    evaluatedAnswers: 2,
    nonconformities: 1,
    conformityRate: 50,
  });
  expect(data.plans).toMatchObject({
    total: 2,
    completed: 1,
    overdue: 1,
    averageResolutionHours: 2,
  });
  const empty = await (await call('summary?from=2020-01-01&to=2020-01-01')).json();
  expect(empty.inspections.conformityRate).toBeNull();
  expect(empty.plans.averageResolutionHours).toBeNull();
  const filtered = await (
    await call(`summary?${period}&formId=${template.id}&category=Prote%C3%A7%C3%A3o&priority=HIGH`)
  ).json();
  expect(filtered.inspections.conformityRate).toBe(50);
});
it('scopes aggregates and drill-down before counting and denies foreign selectors', async () => {
  const global = await (await call(`summary?${period}`, 0)).json();
  expect(global.inspections.completed).toBe(4);
  expect(global.administration.activeUsers).toBe(4);
  expect((await call(`summary?${period}`, 2)).status).toBe(403);
  expect((await call(`summary?${period}`, 3)).status).toBe(403);
  expect((await call(`summary?${period}&sectorId=${sectors[1]!.id}`)).status).toBe(403);
  expect((await call(`summary?${period}&unitId=${units[1]!.id}`)).status).toBe(403);
  const ncs = await (await call(`nonconformities?${period}&pageSize=1`)).json();
  expect(ncs.total).toBe(1);
  expect(ncs.data).toHaveLength(1);
  expect(ncs.data[0].questionLabel).toBe(q.label);
  expect(ncs.groups.categories).toEqual([{ label: 'Proteção', count: 1 }]);
  expect(ncs.groups.units).toEqual([{ label: 'Unidade 0', count: 1 }]);
  const plans = await (await call(`action-plans?${period}&pageSize=1`)).json();
  expect(plans.total).toBe(2);
  expect(plans.data).toHaveLength(1);
  const trend = await (await call(`trends?${period}`)).json();
  expect(trend.data).toEqual([{ date: '2026-10-29', completed: 3, nonconformities: 1 }]);
});
it('rejects impossible dates, excessive windows, malformed filters and unknown queries', async () => {
  for (const query of [
    'from=2026-02-30',
    'from=2026-10-30&to=2026-10-29',
    'from=2020-01-01&to=2026-10-29',
    'priority=URGENT',
    'unitId=invalid',
    'extra=1',
  ])
    expect((await call(`summary?${query}`)).status).toBe(400);
});
it('aggregates representative volume with an explainable bounded query and no cross-scope totals', async () => {
  const em = db.orm.em.fork();
  const [version] = await em.execute('select id from form_version where template_id=?', [
    template.id,
  ]);
  for (const [scope, count] of [
    [0, 500],
    [1, 4000],
  ]) {
    await em.execute(
      `with added as (insert into inspection(id,created_at,updated_at,unit_id,sector_id,created_by_id,form_version_id,state,revision,cycle,answers,notes) select gen_random_uuid(),'2026-10-29T10:00:00Z','2026-10-29T10:00:00Z',?,?,?,?,'COMPLETED',1,1,'[]','[]' from generate_series(1,?) returning id)
      insert into inspection_submission(id,created_at,updated_at,inspection_id,cycle,source_revision,completed_at,completed_by_id,answers,nonconformities,notes,evidence) select gen_random_uuid(),now(),now(),id,1,1,'2026-10-29T10:00:00Z',?,?::jsonb,?::jsonb,'[]','[]' from added`,
      [
        units[scope!]!.id,
        sectors[scope!]!.id,
        users[scope === 0 ? 2 : 3]!.id,
        version.id,
        count,
        users[scope === 0 ? 2 : 3]!.id,
        JSON.stringify([{ questionId: q.id, value: 'NO' }]),
        JSON.stringify([{ key: q.id, questionId: q.id, category: 'Proteção', priority: 'HIGH' }]),
      ],
    );
  }
  await em.execute('analyze inspection');
  await em.execute('analyze inspection_submission');
  const sql = analyticsQuery(
    parseAnalytics({ from: '2026-10-29', to: '2026-10-29' }),
    [sectors[0]!.id],
    null,
    new Date(),
  );
  const plan = await em.execute(
    `explain (analyze,buffers,format json) ${sql.cte} select count(*) from occurrences`,
    sql.args,
  );
  const report = plan[0]['QUERY PLAN'][0];
  expect(report['Execution Time']).toBeLessThan(5000);
  expect(JSON.stringify(report.Plan)).toMatch(/Index|Bitmap/);
  console.log(`Analytics volume 4500: ${report['Execution Time']}ms; indexes verified`);
  const summary = await (await call(`summary?${period}`)).json();
  expect(summary.inspections.completed).toBe(503);
  expect(summary.inspections.nonconformities).toBe(501);
  const qssma = await (await call(`qssma?${period}`)).json();
  expect(qssma.metrics).toMatchObject({
    inspections: 503,
    deviations: 501,
    treated: 1,
    pending: 500,
    scopeDeviationTotal: 501,
  });
}, 20000);
it('treats literal NA text as evaluable and keeps form choices inside the inspection scope', async () => {
  const em = db.orm.em.fork(),
    text = question('TEXT', {
      nonconformity: { operator: 'EQ', value: 'NA', category: 'Texto', priority: 'LOW' },
    });
  const form = new FormTemplate();
  Object.assign(form, {
    name: 'Texto avaliado',
    nameKey: 'texto avaliado',
    state: 'ARCHIVED',
    latestVersion: 1,
    draftSnapshot: null,
  });
  const v = new FormVersion();
  Object.assign(v, {
    template: form,
    number: 1,
    contentHash: 'c'.repeat(64),
    snapshot: definition([text]),
    publishedBy: users[0],
  });
  const i = new Inspection();
  Object.assign(i, {
    unit: units[0],
    sector: sectors[0],
    createdBy: users[2],
    formVersion: v,
    state: 'COMPLETED',
  });
  const s = new InspectionSubmission();
  Object.assign(s, {
    inspection: i,
    cycle: 1,
    sourceRevision: 1,
    completedBy: users[2],
    completedAt: new Date('2026-10-28T12:00:00Z'),
    answers: [{ questionId: text.id, value: 'NA' }],
    nonconformities: [{ key: text.id, questionId: text.id, category: 'Texto', priority: 'LOW' }],
  });
  em.persist([form, v, i, s]);
  await em.flush();
  const result = await (
    await call(`summary?from=2026-10-28&to=2026-10-28&formId=${form.id}`)
  ).json();
  expect(result.inspections.evaluatedAnswers).toBe(1);
  expect(result.inspections.conformityRate).toBe(0);
  const forms = await (await call('forms?pageSize=10&q=Texto')).json();
  expect(forms.data).toEqual([{ id: form.id, name: form.name }]);
  expect((await call('forms?pageSize=10&q=Texto', 3)).status).toBe(403);
});
it('keeps analytics unavailable even for a collaborator with a legacy correction', async () => {
  const em = db.orm.em.fork(),
    um = new UnitMembership();
  Object.assign(um, { user: users[3], unit: units[0] });
  const sm = new SectorMembership();
  Object.assign(sm, { unitMembership: um, sector: sectors[0] });
  em.persist([um, sm]);
  await em.flush();
  await em.execute("update action_plan set responsible_id=? where state='OPEN'", [users[3]!.id]);
  expect((await call('forms?pageSize=10&q=Ficha', 3)).status).toBe(403);
  expect((await call(`summary?${period}&formId=${template.id}`, 3)).status).toBe(403);
});
it('keeps NA occurrences in the detail but excludes them from the conformity numerator', async () => {
  const em = db.orm.em.fork(),
    questions = [1, 2].map(() =>
      question('YES_NO_NA', {
        nonconformity: { operator: 'NEQ', value: 'YES', category: 'Regra NA', priority: 'HIGH' },
      }),
    );
  const snapshot = definition(questions),
    answers = questions.map((q, index) => ({ questionId: q.id, value: index === 0 ? 'NO' : 'NA' }));
  const evaluated = new RuleEngine().evaluate(snapshot, answers);
  expect(evaluated.nonconformities).toHaveLength(2);
  const form = new FormTemplate();
  Object.assign(form, {
    name: 'Regra para NA',
    nameKey: 'regra para na',
    state: 'PUBLISHED',
    latestVersion: 1,
    draftSnapshot: null,
  });
  const v = new FormVersion();
  Object.assign(v, {
    template: form,
    number: 1,
    contentHash: 'd'.repeat(64),
    snapshot,
    publishedBy: users[0],
  });
  const i = new Inspection();
  Object.assign(i, {
    unit: units[0],
    sector: sectors[0],
    createdBy: users[2],
    formVersion: v,
    state: 'COMPLETED',
  });
  const s = new InspectionSubmission();
  Object.assign(s, {
    inspection: i,
    cycle: 1,
    sourceRevision: 1,
    completedBy: users[2],
    completedAt: new Date('2026-10-27T12:00:00Z'),
    answers: evaluated.acceptedAnswers,
    nonconformities: evaluated.nonconformities,
  });
  em.persist([form, v, i, s]);
  await em.flush();
  const result = await (
    await call(`summary?from=2026-10-27&to=2026-10-27&formId=${form.id}`)
  ).json();
  expect(result.inspections.evaluatedAnswers).toBe(1);
  expect(result.inspections.nonconformities).toBe(2);
  expect(result.inspections.conformityRate).toBe(0);
  expect(result.inspections.nonconformingAnswers).toBe(1);
});
