import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
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
async function inspection(page: Page, name: string) {
  await role(page, 'admin');
  const form = await (
      await page.request.post('/api/forms', { headers: { Origin: origin }, data: { name } })
    ).json(),
    qid = randomUUID();
  const draft = await (
    await page.request.put(`/api/forms/${form.id}/draft`, {
      headers: { Origin: origin },
      data: {
        revision: 1,
        snapshot: {
          schemaVersion: 1,
          title: name,
          sections: [
            {
              id: randomUUID(),
              title: 'Área',
              questions: [
                {
                  id: qid,
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
    })
  ).json();
  await page.request.post(`/api/forms/${form.id}/publish`, {
    headers: { Origin: origin },
    data: { revision: draft.revision },
  });
  await role(page, 'collaborator');
  const units = await (await page.request.get('/api/organization/units')).json(),
    unit = units.data.find((r: { name: string }) => r.name === 'Unidade de testes');
  const sectors = await (
      await page.request.get(`/api/organization/sectors?unitId=${unit.id}`)
    ).json(),
    sector = sectors.data.find((r: { name: string }) => r.name === 'Setor de testes');
  const row = await (
    await page.request.post('/api/inspections', {
      headers: { Origin: origin },
      data: { unitId: unit.id, sectorId: sector.id, formId: form.id },
    })
  ).json();
  await page.request.put(`/api/inspections/${row.id}/draft`, {
    headers: { Origin: origin },
    data: {
      revision: 1,
      answers: [{ questionId: qid, value: 'NO' }],
      notes: [{ questionId: qid, text: 'Observação para o relatório: proteção ausente.' }],
    },
  });
  expect(
    (
      await page.request.post(`/api/inspections/${row.id}/complete`, {
        headers: { Origin: origin },
        data: { revision: 2, cycle: 1 },
      })
    ).status(),
  ).toBe(201);
  return row.id;
}
async function requestConfirm(page: Page) {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Solicitar relatório', exact: true })
    .click();
  await expect(page).toHaveURL(/\/reports\?report=/);
  return new URL(page.url()).searchParams.get('report')!;
}
async function download(page: Page, id: string, format: string, project: string) {
  const row = page.locator(`#report-${id}`);
  await expect(row.getByText('Pronto', { exact: true })).toBeVisible({ timeout: 90000 });
  await row
    .getByRole('button', { name: `Preparar download de relatório ${format}`, exact: true })
    .click();
  const url = await row
    .getByRole('link', { name: `Baixar relatório ${format}`, exact: true })
    .getAttribute('href');
  expect(url).toBeTruthy();
  const response = await page.request.get(url!);
  expect(response.status()).toBe(200);
  const bytes = await response.body();
  expect(bytes.subarray(0, format === 'PDF' ? 5 : 2).toString()).toBe(
    format === 'PDF' ? '%PDF-' : 'PK',
  );
  await mkdir('test-results/browser-reports', { recursive: true });
  await writeFile(`test-results/browser-reports/${project}.${format.toLowerCase()}`, bytes);
}
test('queues inspection PDF and filtered Excel, polls real worker output and privately downloads both', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const id = await inspection(page, `Relatório ${info.project.name}`);
  await page.goto(`/inspections/${id}`);
  const button = page.getByRole('button', { name: 'Solicitar PDF desta conclusão', exact: true });
  await expect(button).toBeVisible();
  await button.click();
  const pdf = await requestConfirm(page);
  await download(page, pdf, 'PDF', info.project.name);
  await page.goto('/dashboard?priority=HIGH');
  await page.getByRole('button', { name: 'Solicitar Excel deste recorte', exact: true }).click();
  const xlsx = await requestConfirm(page);
  await download(page, xlsx, 'XLSX', info.project.name);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/reports-${info.project.name}.png`, fullPage: true });
});
test('recovers a failed central read and keeps another user’s exports private', async ({
  page,
}) => {
  await role(page, 'collaborator');
  const list = await (await page.request.get('/api/reports')).json();
  expect(list.total).toBeGreaterThan(0);
  await role(page, 'manager');
  expect((await page.request.get(`/api/reports/${list.data[0].id}`)).status()).toBe(404);
  await page.route('**/api/reports?*', (r) => r.fulfill({ status: 503, body: '{}' }));
  await page.goto('/reports');
  await expect(page.getByRole('alert').filter({ hasText: /Não foi possível/ })).toBeVisible();
  await page.unroute('**/api/reports?*');
  await page.getByRole('button', { name: 'Atualizar relatórios', exact: true }).click();
  await expect(page.getByText('Nenhum relatório solicitado.', { exact: true })).toBeVisible();
});
