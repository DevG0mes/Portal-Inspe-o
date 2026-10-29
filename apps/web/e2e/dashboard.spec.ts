import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const origin = 'http://127.0.0.1:3100';
async function role(page: Page, role: string) {
  expect(
    (
      await page.request.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { email: `${role}@example.test`, password: process.env.BROWSER_PASSWORD! },
      })
    ).status(),
  ).toBe(200);
}
test('filters real indicators, opens authorized records and recovers failed reads', async ({
  page,
}, info) => {
  const label = `Indicador de proteção ${info.project.name}`,
    category = `Painel ${info.project.name}`;
  await role(page, 'admin');
  const form = await (
    await page.request.post('/api/forms', { headers: { Origin: origin }, data: { name: label } })
  ).json();
  const questionId = randomUUID();
  const draft = await (
    await page.request.put(`/api/forms/${form.id}/draft`, {
      headers: { Origin: origin },
      data: {
        revision: 1,
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
                  nonconformity: { operator: 'EQ', value: 'NO', category, priority: 'HIGH' },
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
  const units = await (await page.request.get('/api/organization/units')).json(),
    unit = units.data.find((u: { name: string }) => u.name === 'Unidade de testes');
  const sectors = await (
      await page.request.get(`/api/organization/sectors?unitId=${unit.id}`)
    ).json(),
    sector = sectors.data.find((s: { name: string }) => s.name === 'Setor de testes');
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
  await page.request.post(`/api/inspections/${inspection.id}/complete`, {
    headers: { Origin: origin },
    data: { revision: 2, cycle: 1 },
  });
  await role(page, 'manager');
  await page.goto('/dashboard');
  await page.getByLabel('Categoria', { exact: true }).fill(category);
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`category=Painel`));
  const conformity = page.getByRole('article', { name: 'Índice de conformidade', exact: true });
  await expect(conformity).toContainText('0%');
  await expect(
    page.getByRole('table', { name: 'Não conformidades do período', exact: true }),
  ).toContainText(label);
  await expect(
    page.getByRole('heading', { name: 'Administração global', exact: true }),
  ).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/dashboard-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole('table', { name: 'Não conformidades do período' })
    .getByRole('link', { name: label, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(inspection.id));
  await page.goto(`/dashboard?category=${encodeURIComponent(category)}`);
  await page.route('**/api/analytics/summary?*', (r) => r.fulfill({ status: 503, body: '{}' }));
  await page.getByRole('button', { name: 'Atualizar indicadores', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /Não foi possível/ })).toBeVisible();
  await page.unroute('**/api/analytics/summary?*');
  await page.getByRole('button', { name: 'Atualizar indicadores', exact: true }).click();
  await expect(conformity).toContainText('0%');
  await page.getByLabel('Categoria', { exact: true }).fill(`Inexistente ${randomUUID()}`);
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(conformity).toContainText('Sem base');
  await expect(
    page.getByText('Nenhuma não conformidade neste recorte.', { exact: true }),
  ).toBeVisible();
  await role(page, 'admin');
  await page.goto('/dashboard');
  await expect(
    page.getByRole('heading', { name: 'Administração global', exact: true }),
  ).toBeVisible();
});
