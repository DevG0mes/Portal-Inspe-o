import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const origin = 'http://127.0.0.1:3100';
async function role(page: Page, name: string) {
  expect(
    (
      await page.request.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { email: `${name}@example.test`, password: process.env.BROWSER_PASSWORD! },
      })
    ).status(),
  ).toBe(200);
}
async function source(page: Page, label: string) {
  await role(page, 'admin');
  const form = await (
    await page.request.post('/api/forms', { headers: { Origin: origin }, data: { name: label } })
  ).json();
  const questionId = randomUUID();
  const draft = await (
    await page.request.put(`/api/forms/${form.id}/draft`, {
      headers: { Origin: origin },
      data: {
        revision: form.revision,
        snapshot: {
          schemaVersion: 1,
          title: label,
          sections: [
            {
              id: randomUUID(),
              title: 'Área',
              questions: [
                {
                  id: questionId,
                  label,
                  type: 'YES_NO_NA',
                  required: true,
                  nonconformity: {
                    operator: 'EQ',
                    value: 'NO',
                    category: 'Proteção coletiva',
                    priority: 'HIGH',
                  },
                },
              ],
            },
          ],
        },
      },
    })
  ).json();
  expect(
    (
      await page.request.post(`/api/forms/${form.id}/publish`, {
        headers: { Origin: origin },
        data: { revision: draft.revision },
      })
    ).status(),
  ).toBe(200);
  await role(page, 'collaborator');
  const units = await (await page.request.get('/api/organization/units')).json();
  const unit = units.data.find((row: { name: string }) => row.name === 'Unidade de testes');
  const sectors = await (
    await page.request.get(`/api/organization/sectors?unitId=${unit.id}`)
  ).json();
  const sector = sectors.data.find(
    (row: { name: string }) => row.name === 'Tipo de inspeção de testes',
  );
  const inspection = await (
    await page.request.post('/api/inspections', {
      headers: { Origin: origin },
      data: { unitId: unit.id, sectorId: sector.id, formId: form.id },
    })
  ).json();
  await page.request.put(`/api/inspections/${inspection.id}/draft`, {
    headers: { Origin: origin },
    data: { revision: 1, answers: [{ questionId, value: 'NO' }] },
  });
  const completed = await (
    await page.request.post(`/api/inspections/${inspection.id}/complete`, {
      headers: { Origin: origin },
      data: { revision: 2, cycle: 1 },
    })
  ).json();
  return {
    questionId,
    submissionId: completed.submissions[0].id,
    unitId: unit.id,
    sectorId: sector.id,
  };
}
async function accessible(page: Page) {
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function confirm(page: Page) {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar operação', exact: true })
    .click();
}
test('assigns a corrective plan, submits evidence, returns it and approves with an immutable timeline', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const label = `Proteção da ronda ${info.project.name}`;
  await source(page, label);
  await role(page, 'manager');
  await page.goto('/action-plans/occurrences');
  await page
    .getByRole('listitem')
    .filter({ hasText: label })
    .getByRole('button', { name: /Planejar correção/ })
    .click();
  const description = `Instalar proteção definitiva ${info.project.name}`;
  await page.getByLabel('Descrição da correção', { exact: true }).fill(description);
  await page
    .getByLabel('Selecionar responsável', { exact: true })
    .selectOption({ label: 'Gestor responsável teste' });
  await page
    .getByLabel('Prazo da correção', { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  await accessible(page);
  await page.getByRole('button', { name: 'Revisar plano', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Criar plano', exact: true }).click();
  await expect(page.getByRole('heading', { name: description, exact: true })).toBeVisible();
  const url = page.url();
  await expect(page.getByRole('button', { name: 'Iniciar execução', exact: true })).toHaveCount(0);
  await role(page, 'manager-executor');
  const bell = page.getByRole('button', { name: /Notificações/ });
  await bell.click();
  const drawer = page.getByRole('dialog', { name: 'Notificações', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Fechar', exact: true })).toBeFocused();
  const notice = drawer
    .getByRole('listitem')
    .filter({ has: page.locator(`a[href="${new URL(url).pathname}"]`) });
  await expect(notice.getByText('Plano de ação atribuído', { exact: true })).toBeVisible();
  await notice.getByRole('button', { name: 'Marcar como lida', exact: true }).click();
  await expect(notice.getByText('Lida', { exact: true })).toBeVisible();
  await accessible(page);
  await page.screenshot({
    path: `test-results/notifications-${info.project.name}.png`,
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(bell).toBeFocused();
  await page.goto(url);
  await page.getByRole('button', { name: 'Iniciar execução', exact: true }).click();
  await confirm(page);
  await expect(page.getByText('Em andamento', { exact: true }).first()).toBeVisible();
  await page
    .getByLabel('Comentário ou justificativa', { exact: true })
    .fill('Proteção instalada e conferida');
  await page.getByRole('button', { name: 'Solicitar validação', exact: true }).click();
  await expect(
    page.getByText('Anexe ao menos uma evidência de correção antes de solicitar validação.', {
      exact: true,
    }),
  ).toBeVisible();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=',
    'base64',
  );
  const file = page.getByLabel('Evidência · Correção', { exact: true });
  await expect(file).toBeEnabled();
  await file.setInputFiles({ name: 'protecao.png', mimeType: 'image/png', buffer: png });
  await page
    .getByRole('region', { name: 'Evidências de Correção', exact: true })
    .getByRole('button', { name: 'Enviar arquivo', exact: true })
    .click();
  await expect(page.getByText(/Evidência registrada/)).toBeVisible();
  await page.getByRole('button', { name: 'Solicitar validação', exact: true }).click();
  await confirm(page);
  await expect(page.getByText('Aguardando validação', { exact: true }).first()).toBeVisible();
  await accessible(page);
  await page.screenshot({
    path: `test-results/action-plan-${info.project.name}.png`,
    fullPage: true,
  });
  await role(page, 'manager');
  await page.goto(url);
  await page.getByRole('button', { name: 'Devolver com justificativa', exact: true }).click();
  await expect(
    page.getByText('Descreva o registro com pelo menos 5 caracteres.', { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Comentário ou justificativa', { exact: true })
    .fill('Conferir novamente a fixação');
  await page.getByRole('button', { name: 'Devolver com justificativa', exact: true }).click();
  await confirm(page);
  await role(page, 'manager-executor');
  await page.goto(url);
  await page
    .getByLabel('Comentário ou justificativa', { exact: true })
    .fill('Fixação revisada e conferida');
  await page.getByRole('button', { name: 'Solicitar validação', exact: true }).click();
  await confirm(page);
  await role(page, 'manager');
  await page.goto(url);
  await page.getByRole('button', { name: 'Aprovar correção', exact: true }).click();
  await confirm(page);
  await expect(page.getByText('Concluído', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Plano devolvido', { exact: true })).toBeVisible();
  await accessible(page);
  await page.goto('/action-plans?state=COMPLETED');
  await expect(page.getByRole('row').filter({ hasText: description })).toBeVisible();
});
test('keeps a local comment when another tab changes the plan and recovers only after explicit discard', async ({
  page,
  context,
}, info) => {
  test.setTimeout(90000);
  const fixture = await source(page, `Conflito de correção ${info.project.name}`);
  await role(page, 'manager');
  const candidates = await (
    await page.request.get(
      `/api/schedules/candidates?unitId=${fixture.unitId}&sectorId=${fixture.sectorId}`,
    )
  ).json();
  const responsible = candidates.data.find(
    (row: { name: string }) => row.name === 'Gestor responsável teste',
  );
  const plan = await (
    await page.request.post('/api/action-plans', {
      headers: { Origin: origin },
      data: {
        sourceSubmissionId: fixture.submissionId,
        questionId: fixture.questionId,
        responsibleId: responsible.id,
        description: 'Conferir proteção coletiva',
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      },
    })
  ).json();
  await role(page, 'manager-executor');
  const url = `/action-plans/${plan.id}`;
  await page.goto(url);
  const other = await context.newPage();
  await other.goto(url);
  await other
    .getByLabel('Comentário ou justificativa', { exact: true })
    .fill('Minha anotação preservada');
  await page.getByRole('button', { name: 'Iniciar execução', exact: true }).click();
  await confirm(page);
  await expect(page.getByText('Em andamento', { exact: true }).first()).toBeVisible();
  await other.getByRole('button', { name: 'Adicionar comentário', exact: true }).click();
  await confirm(other);
  await expect(other.getByLabel('Conteúdo local para copiar', { exact: true })).toContainText(
    'Minha anotação preservada',
  );
  await expect(other.getByRole('region', { name: 'Recuperação do plano' })).toBeFocused();
  await other.getByRole('button', { name: 'Recarregar dados do plano', exact: true }).click();
  await other.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(other.getByLabel('Conteúdo local para copiar', { exact: true })).toContainText(
    'Minha anotação preservada',
  );
  await other.getByRole('button', { name: 'Recarregar dados do plano', exact: true }).click();
  await other
    .getByRole('dialog')
    .getByRole('button', { name: 'Descartar e recarregar', exact: true })
    .click();
  await expect(other.getByLabel('Comentário ou justificativa', { exact: true })).toHaveValue('');
  await other.close();
});

test('recovers notification reads and mutations without losing unread notices', async ({
  page,
}, info) => {
  const fixture = await source(page, `Avisos ${info.project.name}`);
  await role(page, 'manager');
  const candidates = await (
    await page.request.get(
      `/api/schedules/candidates?unitId=${fixture.unitId}&sectorId=${fixture.sectorId}`,
    )
  ).json();
  await page.request.post('/api/action-plans', {
    headers: { Origin: origin },
    data: {
      sourceSubmissionId: fixture.submissionId,
      questionId: fixture.questionId,
      responsibleId: candidates.data.find(
        (u: { name: string }) => u.name === 'Gestor responsável teste',
      ).id,
      description: 'Verificar proteção do equipamento',
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    },
  });
  await role(page, 'manager-executor');
  await page.route('**/api/notifications?*', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/notifications?unread=true');
  await expect(page.getByRole('alert').filter({ hasText: /Não foi possível/ })).toBeVisible();
  await page.unroute('**/api/notifications?*');
  await page.getByRole('button', { name: 'Atualizar avisos', exact: true }).click();
  await expect(page.getByRole('listitem').first()).toBeVisible();
  await page.route('**/api/notifications/read-all', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  );
  await page.getByRole('button', { name: 'Marcar todas como lidas', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /Não foi possível/ })).toBeVisible();
  await expect(page.getByRole('listitem').first()).toBeVisible();
  await page.unroute('**/api/notifications/read-all');
  await page.getByRole('button', { name: 'Marcar todas como lidas', exact: true }).click();
  await expect(page.getByText('Nenhuma notificação neste filtro.', { exact: true })).toBeVisible();
  await accessible(page);
});
