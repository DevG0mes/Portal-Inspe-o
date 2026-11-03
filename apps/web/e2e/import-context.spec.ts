import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { FormQuestion } from '@portal/contracts';
import { epcHeaders } from './fixtures/epc-headers';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const origin = 'http://127.0.0.1:3100';
async function post(page: Page, path: string, data: object) {
  const response = await page.request.post(`/api/${path}`, { headers: { Origin: origin }, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function accessible(page: Page) {
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test('registers two lodging addresses in the same city and keeps them out of substations', async ({
  page,
}, info) => {
  await post(page, 'auth/login', {
    email: 'admin@example.test',
    password: process.env.BROWSER_PASSWORD!,
  });
  for (const street of [
    `Rua Alfa, 10 (${info.project.name})`,
    `Rua Alfa, 20 (${info.project.name})`,
  ]) {
    await page.goto('/addresses/new');
    await page.getByLabel('Endereço completo', { exact: true }).fill(street);
    await page.getByLabel('Cidade', { exact: true }).fill('Limeira');
    await expect(page.getByLabel('Selecionar cliente', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page).toHaveURL(/\/addresses\?saved=1$/);
    await expect(page.getByRole('row').filter({ hasText: street })).toContainText('Limeira');
  }
  await accessible(page);
  await page.goto('/locations');
  await expect(page.getByRole('heading', { name: 'Subestações', exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Rua Alfa' })).toHaveCount(0);
});

test('imports the real EPC headers, registers identification and completes a conditional inspection', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  await post(page, 'auth/login', {
    email: 'admin@example.test',
    password: process.env.BROWSER_PASSWORD!,
  });
  const name = `EPC integrado ${info.project.name}`;
  const unit = await post(page, 'organization/units', { name });
  const other = await post(page, 'organization/units', {
    name: `SPCS integração ${info.project.name}`,
  });
  const inspectionType = await post(page, 'organization/sectors', {
    name: 'Campo integrado',
    unitId: unit.id,
  });
  await page.goto('/admin/forms/import');
  await page.getByLabel('Arquivo CSV', { exact: true }).setInputFiles({
    name: 'Inspeção_EPC.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '\ufeffPergunta;Tipo\n' +
        epcHeaders
          .filter((h) => /^\d+[.)]/u.test(h))
          .map(
            (h) =>
              '"' +
              h.replaceAll('"', '""') +
              '";' +
              (/Ação Realizada/iu.test(h) || /^3\./u.test(h) ? 'Texto' : 'Escolha'),
          )
          .join('\n'),
    ),
  });
  await page.getByLabel('Nome do modelo', { exact: true }).fill(name);
  await page
    .getByLabel('Prioridade inicial das não conformidades', { exact: true })
    .selectOption('HIGH');
  await page.getByLabel('Selecionar unidade', { exact: true }).selectOption(unit.id);
  await page
    .getByLabel('Selecionar tipo de inspeção', { exact: true })
    .selectOption(inspectionType.id);
  await expect(
    page.getByLabel('Perguntas de texto identificadas no arquivo', { exact: true }),
  ).toHaveValue('3');
  await page.getByRole('button', { name: 'Preparar prévia', exact: true }).click();
  await expect(page.getByText('59 campos.', { exact: false })).toBeVisible();
  await accessible(page);
  await page.screenshot({ path: `test-results/import-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Criar rascunho importado', exact: true }).click();
  const imported = page.waitForResponse(
    (r) => r.url().endsWith('/api/forms/import-csv') && r.request().method() === 'POST',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Importar como rascunho', exact: true })
    .click();
  const response = await imported;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON().textQuestions).toEqual([3]);
  const form = await response.json();
  await expect(page).toHaveURL(new RegExp(`/admin/forms/${form.id}$`));
  await page.getByRole('button', { name: 'Publicar versão', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Criar novo rascunho', exact: true }),
  ).toBeVisible();
  await page.goto('/customers/new');
  const customerName = `Cliente integração ${info.project.name}`;
  await page.getByLabel('Nome', { exact: true }).fill(customerName);
  for (const id of [unit.id, other.id])
    await page.getByLabel('Selecionar unidade para vincular', { exact: true }).selectOption(id);
  const clientSaved = page.waitForResponse(
    (r) => r.url().endsWith('/api/organization/customers') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  const customer = await (await clientSaved).json();
  await expect(page).toHaveURL(/\/customers\?saved=1$/);
  expect(customer.unitIds.sort()).toEqual([unit.id, other.id].sort());
  await page.goto('/locations/new');
  const locationName = `Canteiro integração ${info.project.name}`;
  await page.getByLabel('Nome', { exact: true }).fill(locationName);
  await page.getByLabel('Selecionar cliente', { exact: true }).selectOption(customer.id);
  const siteSaved = page.waitForResponse(
    (r) => r.url().endsWith('/api/organization/locations') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  const location = await (await siteSaved).json();
  await expect(page).toHaveURL(/\/locations\?saved=1$/);
  await page.goto('/inspections/start');
  await page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
    .click();
  await page.getByLabel('Selecionar cliente', { exact: true }).selectOption(customer.id);
  await page.getByLabel('Selecionar subestação', { exact: true }).selectOption(location.id);
  await page
    .getByLabel('Participantes (opcional)', { exact: true })
    .fill('Maria de Campo\nJosé de Campo');
  await expect(page.getByLabel('Selecionar tipo de inspeção', { exact: true })).toHaveValue(
    inspectionType.id,
  );
  await page.getByLabel('Selecionar formulário', { exact: true }).selectOption(form.id);
  await accessible(page);
  await page.screenshot({
    path: `test-results/identification-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Revisar inspeção', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Iniciar preenchimento', exact: true })
    .click();
  await expect(page).toHaveURL(/\/inspections\/[a-f0-9-]+$/);
  const id = page.url().split('/').at(-1);
  const inspection = await (await page.request.get(`/api/inspections/${id}`)).json();
  expect(inspection.context).toMatchObject({
    customerName,
    locationName,
    participants: ['Maria de Campo', 'José de Campo'],
  });
  const questions: FormQuestion[] = inspection.snapshot.sections.flatMap(
    (s: { questions: FormQuestion[] }) => s.questions,
  );
  const choices = questions.filter((q) => q.type === 'YES_NO_NA');
  expect(choices).toHaveLength(29);
  for (const q of choices)
    await page
      .getByLabel(`${q.label} (obrigatória)`, { exact: true })
      .selectOption(q.id === choices[0]!.id ? 'NO' : 'YES');
  const text = questions.find((q) => q.type === 'TEXT' && !q.visibleWhen?.length)!;
  await page
    .getByLabel(`${text.label} (obrigatória)`, { exact: true })
    .fill('Segurança na atividade de campo');
  const action = questions.find((q) => q.visibleWhen?.[0]?.questionId === choices[0]!.id)!;
  await page.getByRole('button', { name: 'Revisar e concluir', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .getByLabel(`${action.label} (obrigatória)`, { exact: true })
    .fill('Área isolada e proteção corrigida.');
  await page.getByRole('button', { name: 'Revisar e concluir', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Concluir inspeção', exact: true })
    .click();
  await expect(
    page.getByText('Inspeção concluída. Respostas e ocorrências preservadas no histórico.', {
      exact: true,
    }),
  ).toBeVisible();
  await accessible(page);
  await page.screenshot({
    path: `test-results/context-record-${info.project.name}.png`,
    fullPage: true,
  });
  const record = await (await page.request.get(`/api/inspections/${id}`)).json();
  expect(record.submissions).toHaveLength(1);
  expect(record.context).toEqual(inspection.context);
  expect(record.submissions[0].nonconformities).toHaveLength(1);
  const summary = await (await page.request.get(`/api/analytics/summary?formId=${form.id}`)).json();
  expect(summary.inspections).toMatchObject({ evaluatedAnswers: 29, nonconformingAnswers: 1 });
  const report = await post(page, 'reports', {
    requestId: randomUUID(),
    format: 'PDF',
    inspectionId: id,
  });
  await expect
    .poll(async () => (await (await page.request.get(`/api/reports/${report.id}`)).json()).state, {
      timeout: 90000,
    })
    .toBe('READY');
  const download = await post(page, `reports/${report.id}/download`, {});
  const pdf = await page.request.get(download.url);
  expect(pdf.status()).toBe(200);
  const bytes = await pdf.body();
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  await writeFile(`test-results/context-${info.project.name}.pdf`, bytes);
});

test('binds a custom inspection type and confirms deletion without removing published history', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await post(page, 'auth/login', {
    email: 'admin@example.test',
    password: process.env.BROWSER_PASSWORD!,
  });
  const units = await (
    await page.request.get('/api/organization/units?q=Unidade%20de%20testes')
  ).json();
  const unit = units.data.find((u: { name: string }) => u.name === 'Unidade de testes');
  const type = await post(page, 'organization/sectors', {
    name: `Trabalho em Altura ${info.project.name}`,
    unitId: unit.id,
  });
  const name = `Limpeza de modelo ${info.project.name}`;
  const form = await post(page, 'forms', { name });
  await page.goto('/admin/forms');
  await page.getByLabel('Buscar modelos', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Buscar', exact: true }).first().click();
  const row = page.getByRole('row').filter({ hasText: name });
  await row.getByRole('button', { name: `Vincular tipo de ${name}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Vincular tipo de inspeção' });
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await row.getByRole('button', { name: `Vincular tipo de ${name}`, exact: true }).click();
  await dialog.getByLabel('Selecionar unidade', { exact: true }).selectOption(unit.id);
  await dialog.getByLabel('Selecionar tipo de inspeção', { exact: true }).selectOption(type.id);
  await dialog.getByRole('button', { name: 'Salvar vínculo', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await (await page.request.get(`/api/forms/${form.id}`)).json()).inspectionTypeId).toBe(
    type.id,
  );
  await row.getByRole('button', { name: `Excluir ${name}`, exact: true }).click();
  const remove = page.getByRole('dialog', { name: 'Excluir formulário?' });
  await remove.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: `Excluir ${name}`, exact: true }).click();
  await remove.getByRole('button', { name: 'Excluir formulário', exact: true }).click();
  await expect(row).toHaveCount(0);
  expect((await page.request.get(`/api/forms/${form.id}`)).status()).toBe(403);
  await accessible(page);
});
