import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createApplication } from '../src/app.js';
import { User } from '../src/identity/user.entity.js';
import { PasswordService } from '../src/auth/password.service.js';
import { FormVersion } from '../src/forms/entities/form-version.entity.js';
import { AuditEvent } from '../src/audit/audit-event.entity.js';
import { createTestDatabase } from './helpers/test-database.js';
import { definition, question } from './helpers/form-fixtures.js';

const password = 'Uma senha forte para o portal 2026!';
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let app: INestApplication, origin: string, adminCookie: string, collaboratorCookie: string;

beforeAll(async () => {
  database = await createTestDatabase();
  const em = database.orm.em.fork(),
    digest = await new PasswordService().hash(password);
  const users = ['ADMIN', 'COLLABORATOR'].map((role) => {
    const user = new User();
    user.name = 'Usuário de formulários';
    user.email = `${randomUUID()}@psi.test`;
    user.role = role as User['role'];
    user.passwordHash = digest;
    user.mustChangePassword = false;
    em.persist(user);
    return user;
  });
  await em.flush();
  app = await createApplication({}, undefined, database.orm);
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
  const cookies = await Promise.all(
    users.map(async (user) => {
      const response = await fetch(`${origin}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: user.email, password }),
      });
      expect(response.status).toBe(200);
      return response.headers.get('set-cookie')!.split(';')[0]!;
    }),
  );
  adminCookie = cookies[0]!;
  collaboratorCookie = cookies[1]!;
}, 20000);
afterAll(async () => {
  await app?.close();
  await database?.close();
});

function call(path: string, method = 'GET', body?: unknown, cookie = adminCookie) {
  return fetch(`${origin}/api/forms${path}`, {
    method,
    headers: { cookie, ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}) },
    ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
}
async function create() {
  const response = await call('', 'POST', { name: `Modelo ${randomUUID()}` });
  expect(response.status).toBe(201);
  return response.json();
}
async function save(id: string, revision: number, snapshot = definition([question('YES_NO_NA')])) {
  const response = await call(`/${id}/draft`, 'PUT', { revision, snapshot });
  expect(response.status).toBe(200);
  return response.json();
}

describe('form lifecycle and immutable history', () => {
  it('imports a typed draft idempotently, rejects changed retries and enforces NO actions', async () => {
    const unitResponse = await fetch(`${origin}/api/organization/units`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `EPC ${randomUUID()}` }),
    });
    const unit = await unitResponse.json();
    const input = {
      unitIds: [unit.id],
      importId: randomUUID(),
      name: `EPC ${randomUUID()}`,
      headers: ['Status', '1. Proteção?', '1. Ação Realizada', '3. Tema?'],
      textQuestions: [3],
      required: true,
      category: 'EPC',
      priority: 'HIGH',
    };
    expect((await call('/import-csv', 'POST', input, collaboratorCookie)).status).toBe(403);
    const responses = await Promise.all([
      call('/import-csv', 'POST', input),
      call('/import-csv', 'POST', input),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const a = await responses[0]!.json(),
      b = await responses[1]!.json();
    expect(a.id).toBe(b.id);
    expect(a).toMatchObject({ state: 'DRAFT', latestVersion: 0 });
    expect((await call('/import-csv', 'POST', { ...input, name: 'Alterado' })).status).toBe(409);
    const draft = await (await call(`/${a.id}/draft`)).json();
    expect(draft.snapshot.sections[0].questions.map((q: { type: string }) => q.type)).toEqual([
      'YES_NO_NA',
      'TEXT',
      'TEXT',
    ]);
    const [q, action, text] = draft.snapshot.sections[0].questions;
    const result = await (
      await call(`/${a.id}/preview`, 'POST', {
        revision: 1,
        answers: [
          { questionId: q.id, value: 'NO' },
          { questionId: text.id, value: 'Tema' },
        ],
      })
    ).json();
    expect(result.result.errors).toContainEqual({ questionId: action.id, code: 'REQUIRED' });
    const before = await (await call(`/available-types?unitId=${unit.id}`)).json();
    expect(before.configured).toBe(true);
    expect(before.types.every((t: { count: number }) => t.count === 0)).toBe(true);
    expect((await call(`/${a.id}/publish`, 'POST', { revision: draft.revision })).status).toBe(200);
    const after = await (await call(`/available-types?unitId=${unit.id}`)).json();
    expect(after.types).toHaveLength(5);
    expect(after.types.filter((t: { count: number }) => t.count > 0)).toEqual([
      { kind: 'EPC_GENERAL', count: 1, formId: a.id },
    ]);
    expect(
      (await call(`/available-types?unitId=${unit.id}`, 'GET', undefined, collaboratorCookie))
        .status,
    ).toBe(403);
    const anotherUnit = await (
      await fetch(`${origin}/api/organization/units`, {
        method: 'POST',
        headers: { cookie: adminCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: `Outra ${randomUUID()}` }),
      })
    ).json();
    const sector = await (
      await fetch(`${origin}/api/organization/sectors`, {
        method: 'POST',
        headers: { cookie: adminCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Campo', unitId: anotherUnit.id }),
      })
    ).json();
    const unavailable = await fetch(`${origin}/api/inspections`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ formId: a.id, unitId: anotherUnit.id, sectorId: sector.id }),
    });
    expect(unavailable.status).toBe(400);

    expect(
      (
        await call('/import-csv', 'POST', {
          ...input,
          importId: randomUUID(),
          headers: ['unrecognized'],
        })
      ).status,
    ).toBe(400);
  });
  it('supports valid Unicode names whose lowercase comparison key expands', async () => {
    const name = 'İ'.repeat(160);
    const response = await call('', 'POST', { name });
    expect(response.status).toBe(201);
    expect((await response.json()).name).toBe(name);
  });

  it('lists version metadata for administrators without repeating full snapshots', async () => {
    const model = await create(),
      draft = await save(model.id, model.revision);
    await call(`/${model.id}/publish`, 'POST', { revision: draft.revision });
    const response = await call(`/${model.id}/versions?pageSize=1`);
    expect(response.status).toBe(200);
    const history = await response.json();
    expect(history.total).toBe(1);
    expect(history.data[0]).toMatchObject({ number: 1, contentHash: expect.any(String) });
    expect(history.data[0]).not.toHaveProperty('snapshot');
    expect((await call(`/${model.id}/versions`, 'GET', undefined, collaboratorCookie)).status).toBe(
      403,
    );
  });

  it('publishes v1, edits a new draft and publishes v2 without changing v1 bytes', async () => {
    const model = await create();
    const draft = await save(model.id, model.revision);
    const response = await call(`/${model.id}/publish`, 'POST', { revision: draft.revision });
    expect(response.status).toBe(200);
    const v1 = await response.json();
    expect(v1.number).toBe(1);
    expect(v1.contentHash).toMatch(/^[a-f0-9]{64}$/);
    const original = await (await call(`/${model.id}/versions/1`)).text();
    const current = await (await call(`/${model.id}`)).json();
    const cloned = await (
      await call(`/${model.id}/draft`, 'POST', { revision: current.revision })
    ).json();
    cloned.snapshot.title = 'Inspeção revisada';
    const edited = await save(model.id, cloned.revision, cloned.snapshot);
    const v2 = await (
      await call(`/${model.id}/publish`, 'POST', { revision: edited.revision })
    ).json();
    expect(v2.number).toBe(2);
    expect(v2.snapshot.title).toBe('Inspeção revisada');
    expect(await (await call(`/${model.id}/versions/1`)).text()).toBe(original);
  });

  it('lets only one of two concurrent publications succeed', async () => {
    const model = await create(),
      draft = await save(model.id, model.revision);
    const responses = await Promise.all([
      call(`/${model.id}/publish`, 'POST', { revision: draft.revision }),
      call(`/${model.id}/publish`, 'POST', { revision: draft.revision }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await database.orm.em.fork().count(FormVersion, { template: model.id })).toBe(1);
  });

  it('serializes autosave against publication of the same revision', async () => {
    const model = await create(),
      draft = await save(model.id, model.revision);
    const changed = { ...draft.snapshot, title: 'Edição concorrente' };
    const responses = await Promise.all([
      call(`/${model.id}/draft`, 'PUT', { revision: draft.revision, snapshot: changed }),
      call(`/${model.id}/publish`, 'POST', { revision: draft.revision }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const template = await (await call(`/${model.id}`)).json();
    if (responses[1]!.status === 200) {
      const version = await (await call(`/${model.id}/versions/1`)).json();
      expect(version.snapshot.title).toBe(draft.snapshot.title);
      expect(template.hasDraft).toBe(false);
    } else {
      expect(template.latestVersion).toBe(0);
      expect((await (await call(`/${model.id}/draft`)).json()).snapshot.title).toBe(changed.title);
    }
  });

  it('blocks invalid reference graphs and rejects client-computed preview results', async () => {
    const first = question('YES_NO_NA'),
      second = question('YES_NO_NA');
    first.visibleWhen = [{ questionId: second.id, operator: 'EQ', value: 'YES' }];
    second.visibleWhen = [{ questionId: first.id, operator: 'EQ', value: 'YES' }];
    const model = await create(),
      draft = await save(model.id, model.revision, definition([first, second]));
    const response = await call(`/${model.id}/publish`, 'POST', { revision: draft.revision });
    expect(response.status).toBe(400);
    expect(
      (await response.json()).definitionErrors.some(
        (issue: { code: string }) => issue.code === 'CYCLIC_DEPENDENCY',
      ),
    ).toBe(true);
    expect(
      (
        await call(`/${model.id}/preview`, 'POST', {
          revision: draft.revision,
          answers: [],
          nonconformities: [],
        })
      ).status,
    ).toBe(400);
    expect(await database.orm.em.fork().count(FormVersion, { template: model.id })).toBe(0);
  });

  it('rejects stale autosave revisions without overwriting newer work', async () => {
    const model = await create(),
      snapshot = definition([question('TEXT')]);
    const draft = await save(model.id, model.revision, snapshot);
    expect(
      (
        await call(`/${model.id}/draft`, 'PUT', {
          revision: model.revision,
          snapshot: { ...snapshot, title: 'Stale' },
        })
      ).status,
    ).toBe(409);
    const actual = await (await call(`/${model.id}/draft`)).json();
    expect(actual.revision).toBe(draft.revision);
    expect(actual.snapshot.title).toBe(snapshot.title);
  });

  it('saves incomplete drafts but blocks invalid publication and reports preview issues', async () => {
    const model = await create();
    const preview = await call(`/${model.id}/preview`, 'POST', {
      revision: model.revision,
      answers: [],
    });
    expect((await preview.json()).result.definitionErrors.length).toBeGreaterThan(0);
    expect((await call(`/${model.id}/publish`, 'POST', { revision: model.revision })).status).toBe(
      400,
    );
    expect(await database.orm.em.fork().count(FormVersion, { template: model.id })).toBe(0);
  });

  it('recalculates hidden answers and nonconformities on the server during preview', async () => {
    const first = question('YES_NO_NA'),
      hidden = question('YES_NO_NA', {
        visibleWhen: [{ questionId: first.id, operator: 'EQ', value: 'YES' }],
        nonconformity: { operator: 'EQ', value: 'NO', category: 'EPI', priority: 'HIGH' },
      });
    const model = await create(),
      draft = await save(model.id, model.revision, definition([first, hidden]));
    const response = await call(`/${model.id}/preview`, 'POST', {
      revision: draft.revision,
      answers: [
        { questionId: first.id, value: 'NO' },
        { questionId: hidden.id, value: 'NO' },
      ],
    });
    const body = await response.json();
    expect(body.result.nonconformities).toEqual([]);
    expect(body.result.visibleQuestionIds).toEqual([first.id]);
  });

  it('protects drafts and mutations while making published versions readable', async () => {
    const model = await create();
    expect((await call('', 'POST', { name: 'Forbidden' }, collaboratorCookie)).status).toBe(403);
    expect((await call(`/${model.id}/draft`, 'GET', undefined, collaboratorCookie)).status).toBe(
      403,
    );
    expect(
      (await call(`/${model.id}/publish`, 'POST', { revision: model.revision }, collaboratorCookie))
        .status,
    ).toBe(403);
    const catalog = await (await call('', 'GET', undefined, collaboratorCookie)).json();
    expect(catalog.data.some((item: { id: string }) => item.id === model.id)).toBe(false);
    const draft = await save(model.id, model.revision);
    await call(`/${model.id}/publish`, 'POST', { revision: draft.revision });
    expect(
      (await call(`/${model.id}/versions/1`, 'GET', undefined, collaboratorCookie)).status,
    ).toBe(200);
  });

  it('archives models without deleting versions or allowing future publication', async () => {
    const model = await create(),
      draft = await save(model.id, model.revision);
    await call(`/${model.id}/publish`, 'POST', { revision: draft.revision });
    const current = await (await call(`/${model.id}`)).json();
    expect(
      (await call(`/${model.id}/archive`, 'POST', { revision: current.revision })).status,
    ).toBe(200);
    expect(
      (await call(`/${model.id}/versions/1`, 'GET', undefined, collaboratorCookie)).status,
    ).toBe(200);
    const archived = await (await call(`/${model.id}`)).json();
    expect(archived.state).toBe('ARCHIVED');
    expect((await call(`/${model.id}/draft`, 'POST', { revision: archived.revision })).status).toBe(
      409,
    );
    expect(
      await database.orm.em
        .fork()
        .count(AuditEvent, { action: 'forms.archived', resourceId: model.id }),
    ).toBe(1);
  });

  it('rejects direct mutation and deletion of published versions in PostgreSQL', async () => {
    const model = await create(),
      draft = await save(model.id, model.revision);
    const version = await (
      await call(`/${model.id}/publish`, 'POST', { revision: draft.revision })
    ).json();
    const em = database.orm.em.fork();
    await expect(
      em.execute('update form_version set number = 9 where id = ?', [version.id]),
    ).rejects.toThrow(/immutable/i);
    await expect(em.execute('delete from form_version where id = ?', [version.id])).rejects.toThrow(
      /immutable/i,
    );
    // New assignment FKs would reject plain TRUNCATE before reaching the immutability trigger.
    await expect(em.execute('truncate form_version cascade')).rejects.toThrow(/immutable/i);
  });

  it('accepts a realistically large form within the configured JSON body limit', async () => {
    const model = await create();
    const snapshot = definition(
      Array.from({ length: 500 }, () =>
        question('TEXT', { label: 'Verificação '.repeat(18), required: false }),
      ),
    );
    expect(JSON.stringify(snapshot).length).toBeGreaterThan(100 * 1024);
    const saved = await save(model.id, model.revision, snapshot);
    expect(saved.snapshot.sections[0].questions).toHaveLength(500);
  });
});
