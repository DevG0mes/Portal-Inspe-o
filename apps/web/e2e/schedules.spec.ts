import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function login(page: Page, email = 'manager@example.test') {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(process.env.BROWSER_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
}
test('manager schedules shared inspections and worker restores a paused occurrence', async ({
  page,
  context,
}, info) => {
  test.setTimeout(90000);
  await login(page);
  await page.goto('/schedules');
  await page.getByRole('link', { name: 'Nova programação', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill(`Ronda ${info.project.name}`);
  await page.getByLabel('Selecionar formulário').selectOption({ label: 'Ficha de testes' });
  await page.getByLabel('Selecionar unidade').selectOption({ label: 'Unidade de testes' });
  await page.getByLabel('Selecionar setor').selectOption({ label: 'Setor de testes' });
  await expect(
    page.getByLabel('Selecionar setor').getByRole('option', { name: 'Setor restrito' }),
  ).toHaveCount(0);
  await page.getByLabel('Selecionar responsável').selectOption({ label: 'Colaborador teste' });
  await page.getByRole('button', { name: 'Adicionar responsável', exact: true }).click();
  await page.getByLabel('Frequência', { exact: true }).selectOption('DAILY');
  await page
    .getByLabel('Data inicial', { exact: true })
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  await page.getByLabel('Hora local', { exact: true }).fill('08:00');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: `test-results/schedule-create-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Revisar programação', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Criar programação', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: `Ronda ${info.project.name}`, exact: true }),
  ).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill(`Ronda revisada ${info.project.name}`);
  await expect(
    page.getByRole('button', { name: 'Pausar programação', exact: true }),
  ).toBeDisabled();
  const prompt = page.waitForEvent('dialog');
  await page.evaluate(() => history.back());
  const dialog = await prompt;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(
    `Ronda revisada ${info.project.name}`,
  );
  await page.getByRole('button', { name: 'Salvar nome', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: `Ronda revisada ${info.project.name}`, exact: true }),
  ).toBeVisible();
  const assignments = await context.newPage();
  await assignments.goto('/assignments');
  const row = assignments
    .getByRole('row')
    .filter({ hasText: `Ronda revisada ${info.project.name}` });
  await expect
    .poll(
      async () => {
        await assignments.reload();
        await expect(
          assignments.getByRole('table').or(
            assignments.getByRole('heading', {
              name: 'Nenhum resultado encontrado',
              exact: true,
            }),
          ),
        ).toBeVisible();
        return row.count();
      },
      { timeout: 45000, intervals: [1000] },
    )
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pausar programação', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Retomar programação', exact: true }),
  ).toBeVisible();
  await assignments.reload();
  await expect(row.first()).toContainText('Cancelada');
  await page.getByRole('button', { name: 'Retomar programação', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retomar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pausar programação', exact: true })).toBeVisible();
  await expect
    .poll(
      async () => {
        await assignments.reload();
        return row.first().textContent();
      },
      { timeout: 45000, intervals: [1000] },
    )
    .toContain('Próxima');
  await assignments.close();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await login(page, 'collaborator@example.test');
  await page.goto('/schedules');
  await expect(page).toHaveURL(/assignments/);
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: `Ronda revisada ${info.project.name}` })
      .first(),
  ).toBeVisible();
  await page.getByLabel('Situação', { exact: true }).selectOption('OVERDUE');
  await expect(page.getByRole('heading', { name: 'Nenhum resultado encontrado' })).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/assignments-${info.project.name}.png`,
    fullPage: true,
  });
});
test('creation validates missing fields before requesting confirmation', async ({ page }) => {
  await login(page);
  await page.goto('/schedules/new');
  await page.getByRole('button', { name: 'Revisar programação', exact: true }).click();
  await expect(page.getByText('Informe o nome.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Nome', { exact: true })).toBeFocused();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
