import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { readSmoke } from '../../../tests/load/smoke.js';

const origin = 'http://127.0.0.1:3100';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=',
  'base64',
);

test('critical path: organization, publication, scheduled inspection, photo, correction, approval and reports', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  async function post(path: string, data: unknown) {
    const response = await page.request.post(`/api/${path}`, { headers: { Origin: origin }, data });
    expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
    return response.status() === 204 ? undefined : response.json();
  }
  async function login(email: string, password = process.env.BROWSER_PASSWORD!) {
    return post('auth/login', { email, password });
  }
  await login('admin@example.test');
  const unit = await post('organization/units', { name: `Caminho completo ${info.project.name}` });
  const sector = await post('organization/sectors', { unitId: unit.id, name: 'Proteção coletiva' });
  const temporary = process.env.BROWSER_PASSWORD!;
  const changed = `${temporary}-changed`;
  const users = [];
  for (const role of ['MANAGER', 'COLLABORATOR']) {
    const user = await post('users', {
      name: `Pessoa ${role}`,
      email: `${randomUUID()}@example.test`,
      password: temporary,
      role,
    });
    await post('organization/unit-memberships', { userId: user.id, unitId: unit.id });
    await post('organization/sector-memberships', {
      userId: user.id,
      unitId: unit.id,
      sectorId: sector.id,
    });
    users.push(user);
  }
  const form = await post('forms', { name: `Caminho crítico ${info.project.name}` });
  const questionId = randomUUID();
  const draftResponse = await page.request.put(`/api/forms/${form.id}/draft`, {
    headers: { Origin: origin },
    data: {
      revision: 1,
      snapshot: {
        schemaVersion: 1,
        title: form.name,
        sections: [
          {
            id: randomUUID(),
            title: 'Área',
            questions: [
              {
                id: questionId,
                label: 'Proteção instalada?',
                type: 'YES_NO_NA',
                required: true,
                nonconformity: {
                  operator: 'EQ',
                  value: 'NO',
                  category: 'Proteção',
                  priority: 'HIGH',
                },
              },
            ],
          },
        ],
      },
    },
  });
  expect(draftResponse.ok()).toBe(true);
  await post(`forms/${form.id}/publish`, { revision: (await draftResponse.json()).revision });
  for (const user of users) {
    await login(user.email);
    await post('auth/change-password', { currentPassword: temporary, newPassword: changed });
  }
  await login(users[0].email, changed);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(Date.now() + 60000))
      .map((part) => [part.type, part.value]),
  );
  const schedule = await post('schedules', {
    name: form.name,
    unitId: unit.id,
    sectorId: sector.id,
    formId: form.id,
    responsibleIds: [users[1].id],
    frequency: 'ONCE',
    startDate: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    deadlineHours: 24,
  });
  await login(users[1].email, changed);
  let assignment: { id: string; canStart: boolean } | undefined;
  await expect
    .poll(
      async () => {
        const rows = await (
          await page.request.get('/api/schedules/assignments?pageSize=100')
        ).json();
        assignment = rows.data.find(
          (row: { scheduleId: string }) => row.scheduleId === schedule.id,
        );
        return assignment?.canStart;
      },
      { timeout: 90000, intervals: [1000] },
    )
    .toBe(true);
  const inspection = await post('inspections', { assignmentId: assignment!.id });
  const duplicate = await post('inspections', { assignmentId: assignment!.id });
  expect(duplicate.id).toBe(inspection.id);
  await page.goto(`/inspections/${inspection.id}`);
  await page.getByLabel('Proteção instalada? (obrigatória)', { exact: true }).selectOption('NO');
  await expect(page.getByText(/Respostas salvas · Revisão/)).toBeVisible();
  await page
    .getByLabel('Evidência · Proteção instalada?', { exact: true })
    .setInputFiles({ name: 'risco.png', mimeType: 'image/png', buffer: png });
  await page
    .getByRole('region', { name: 'Evidências de Proteção instalada?', exact: true })
    .getByRole('button', { name: 'Enviar arquivo', exact: true })
    .click();
  await expect(page.getByText(/Evidência registrada/)).toBeVisible();
  await page.getByRole('button', { name: 'Revisar e concluir', exact: true }).click();
  const completion = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/inspections/${inspection.id}/complete`) &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Concluir inspeção', exact: true })
    .click();
  const completionResponse = await completion;
  expect(completionResponse.status()).toBe(201);
  const completed = await completionResponse.json();
  expect(completed.submissions).toHaveLength(1);
  await login(users[0].email, changed);
  let plan = await post('action-plans', {
    sourceSubmissionId: completed.submissions[0].id,
    questionId,
    responsibleId: users[1].id,
    description: 'Instalar proteção e conferir fixação',
    priority: 'HIGH',
    dueDate: new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10),
  });
  await login(users[1].email, changed);
  plan = await post(`action-plans/${plan.id}/commands`, {
    commandId: randomUUID(),
    revision: plan.revision,
    type: 'START',
  });
  await page.goto(`/action-plans/${plan.id}`);
  await page
    .getByLabel('Evidência · Correção', { exact: true })
    .setInputFiles({ name: 'corrigido.png', mimeType: 'image/png', buffer: png });
  await page
    .getByRole('region', { name: 'Evidências de Correção', exact: true })
    .getByRole('button', { name: 'Enviar arquivo', exact: true })
    .click();
  await expect(page.getByText(/Evidência registrada/)).toBeVisible();
  plan = await (await page.request.get(`/api/action-plans/${plan.id}`)).json();
  plan = await post(`action-plans/${plan.id}/commands`, {
    commandId: randomUUID(),
    revision: plan.revision,
    type: 'REQUEST_VALIDATION',
    text: 'Proteção instalada e conferida',
  });
  await login(users[0].email, changed);
  plan = await post(`action-plans/${plan.id}/commands`, {
    commandId: randomUUID(),
    revision: plan.revision,
    type: 'APPROVE',
  });
  expect(plan.state).toBe('COMPLETED');
  const query = `formId=${form.id}&unitId=${unit.id}&sectorId=${sector.id}`;
  const summary = await (await page.request.get(`/api/analytics/summary?${query}`)).json();
  expect(summary.inspections.completed).toBe(1);
  expect(summary.plans.completed).toBe(1);
  await readSmoke(async () => {
    const response = await page.request.get(`/api/analytics/summary?${query}`);
    expect(response.status()).toBe(200);
    expect((await response.json()).inspections.completed).toBe(1);
  });
  const pdf = await post('reports', {
    requestId: randomUUID(),
    format: 'PDF',
    inspectionId: inspection.id,
  });
  const excel = await post('reports', {
    requestId: randomUUID(),
    format: 'XLSX',
    filters: { formId: form.id, unitId: unit.id, sectorId: sector.id },
  });
  for (const report of [pdf, excel]) {
    await expect
      .poll(
        async () => (await (await page.request.get(`/api/reports/${report.id}`)).json()).state,
        { timeout: 90000 },
      )
      .toBe('READY');
    const signed = await post(`reports/${report.id}/download`, {});
    const response = await page.request.get(signed.url);
    expect(response.status()).toBe(200);
    expect((await response.body()).length).toBeGreaterThan(1000);
  }
  await login('collaborator@example.test');
  expect((await page.request.get(`/api/inspections/${inspection.id}`)).status()).toBe(403);
  expect((await page.request.get(`/api/reports/${pdf.id}`)).status()).toBe(404);
  await readSmoke(async () => {
    const response = await page.request.get(`/api/analytics/summary?formId=${form.id}`);
    expect(response.status()).toBe(200);
    expect((await response.json()).inspections.completed).toBe(0);
  });
});
