import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('chooses the field layout, completes a personal inspection in steps and switches back', async ({
  page,
  context,
  request,
}, info) => {
  test.setTimeout(90000);
  const headers = { Origin: 'http://127.0.0.1:3100' };
  const password = process.env.BROWSER_PASSWORD!;
  expect(
    (
      await request.post('/api/auth/login', {
        headers,
        data: { email: 'admin@example.test', password },
      })
    ).status(),
  ).toBe(200);
  const title = `Inspeção em campo ${info.project.name}`;
  const form = await (await request.post('/api/forms', { headers, data: { name: title } })).json();
  const questionId = randomUUID();
  const draft = await (
    await request.put(`/api/forms/${form.id}/draft`, {
      headers,
      data: {
        revision: 1,
        snapshot: {
          schemaVersion: 1,
          title,
          sections: [
            {
              id: randomUUID(),
              title: 'Condição da área',
              questions: [
                { id: questionId, label: 'Área protegida?', type: 'YES_NO_NA', required: true },
              ],
            },
            {
              id: randomUUID(),
              title: 'Registro de campo',
              questions: [
                { id: randomUUID(), label: 'Observação de campo', type: 'TEXT', required: true },
                {
                  id: randomUUID(),
                  label: 'Ação realizada',
                  type: 'TEXT',
                  required: true,
                  visibleWhen: [{ questionId, operator: 'EQ', value: 'NO' }],
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
      await request.post(`/api/forms/${form.id}/publish`, {
        headers,
        data: { revision: draft.revision },
      })
    ).status(),
  ).toBe(200);
  const units = await (await request.get('/api/organization/units')).json();
  const unit = units.data.find((row: { name: string }) => row.name === 'Unidade de testes');
  const sectors = await (await request.get(`/api/organization/sectors?unitId=${unit.id}`)).json();
  const sector = sectors.data.find(
    (row: { name: string }) => row.name === 'Tipo de inspeção de testes',
  );
  const input = { unitId: unit.id, sectorId: sector.id, formId: form.id };
  const other = await (await request.post('/api/inspections', { headers, data: input })).json();
  expect(other.id).toBeTruthy();

  await context.clearCookies({ name: 'portal_presentation' });
  await page.goto('/experience');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('E-mail', { exact: true }).fill('collaborator@example.test');
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/experience$/);
  await expect(page.getByRole('button', { name: /^Desktop/ })).toBeVisible();
  await page.getByRole('button', { name: /^Celular/ }).click();
  await expect(page).toHaveURL(/\/my-work$/);
  await expect(page.locator('.portal')).toHaveClass(/field-mode/);
  const nav = page.getByRole('navigation', { name: 'Principal' });
  const pilot = process.env.PORTAL_PILOT === 'true';
  await expect(nav.getByRole('link')).toHaveCount(pilot ? 3 : 4);
  await expect(page.getByRole('button', { name: /Notificações/ })).toHaveCount(pilot ? 0 : 1);
  await expect(page.getByRole('link', { name: /Nova inspeção/ })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/colaborador-inicio-${info.project.name}.png` });

  if (!pilot) {
    await nav.getByRole('link', { name: 'Atribuídas a mim' }).click();
    await expect(
      page.getByText(`Ronda disponível ${info.project.name}`, { exact: true }),
    ).toBeVisible();
  }
  for (const path of ['/dashboard', '/action-plans', '/users']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/my-work$/);
  }
  expect((await page.request.get(`/api/inspections/${other.id}`)).status()).toBe(403);
  expect((await page.request.get('/api/analytics/summary')).status()).toBe(403);
  expect((await page.request.get('/api/action-plans')).status()).toBe(pilot ? 404 : 403);
  const created = await page.request.post('/api/inspections', { headers, data: input });
  expect(created.status()).toBe(201);
  const own = await created.json();
  await page.goto(`/inspections/${own.id}`);
  await expect(page.getByText('Etapa 1 de 2', { exact: true })).toBeVisible();
  if (pilot) await expect(page.getByRole('region', { name: /^Evidências de/ })).toHaveCount(0);
  const observation = page.getByRole('textbox', { name: /^Observação de campo/ });
  await expect(observation).not.toBeVisible();
  await page.getByRole('button', { name: 'Próxima etapa' }).click();
  await expect(page.getByText('Etapa 2 de 2', { exact: true })).toBeVisible();
  await observation.fill('Ronda realizada no local.');
  await page.getByRole('button', { name: 'Revisar e concluir' }).click();
  await expect(page.getByText('Etapa 1 de 2', { exact: true })).toBeVisible();
  const area = page.getByRole('combobox', { name: /^Área protegida/ });
  await expect(area).toHaveAttribute('aria-invalid', 'true');
  await expect(area).toBeFocused();
  await area.selectOption({ label: 'Não' });
  await page.getByRole('button', { name: 'Próxima etapa' }).click();
  await expect(observation).toHaveValue('Ronda realizada no local.');
  await page.getByRole('textbox', { name: /^Ação realizada/ }).fill('Área sinalizada.');
  await page.getByRole('button', { name: 'Revisar e concluir' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Concluir inspeção', exact: true })
    .click();
  await expect(page.getByText(/Inspeção concluída\. Respostas/)).toBeVisible();
  await page.reload();
  await expect(page.getByText('Área sinalizada.', { exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Minhas inspeções' }).click();
  await expect(page.getByRole('link', { name: `Consultar ${title}` })).toHaveAttribute(
    'href',
    `/inspections/${own.id}`,
  );
  await expect(page.locator(`a[href="/inspections/${other.id}"]`)).toHaveCount(0);

  await nav.getByRole('link', { name: 'Minha conta' }).click();
  await page.getByRole('link', { name: 'Trocar visualização' }).click();
  await page.getByRole('button', { name: /^Desktop/ }).click();
  await expect(page).toHaveURL(/\/my-work$/);
  await expect(page.locator('.portal')).toHaveClass(/mode-desktop/);
  expect((await page.request.get('/api/analytics/summary')).status()).toBe(403);
});
