import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const password = process.env.BROWSER_PASSWORD!;
async function login(page: Page, email = 'admin@example.test', secret = password) {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((item) => ({
      id: item.id,
      nodes: item.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test('login failure, mandatory change and cookie-backed SSR protection', async ({
  page,
  context,
}, info) => {
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login$/);
  await accessible(page);
  await page.screenshot({ path: `test-results/login-${info.project.name}.png`, fullPage: true });
  await login(page, 'nobody@example.test', 'invalid');
  await expect(
    page.getByRole('alert').filter({ hasText: 'E-mail ou senha incorretos' }),
  ).toContainText('E-mail ou senha incorretos');
  await login(page, `first-${info.project.name}@example.test`);
  await expect(page).toHaveURL(/change-password/);
  await page.goto('/users');
  await expect(page).toHaveURL(/change-password/);
  await page.getByLabel('Senha atual', { exact: true }).fill(password);
  const fresh = password + info.project.name;
  await page.getByLabel('Nova senha', { exact: true }).fill(fresh);
  await page.getByLabel('Confirmar nova senha', { exact: true }).fill(fresh);
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page).toHaveURL(/dashboard/);
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === 'portal_session');
  expect(session?.httpOnly).toBe(true);
  expect(session?.path).toBe('/');
  expect(session?.sameSite).toBe('Strict');
  await page.goto('/users');
  await expect(page).toHaveURL(/dashboard/);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
test('administration CRUD, multi-unit and sector grants, confirmation and accessibility', async ({
  page,
}, info) => {
  await login(page);
  await expect(page).toHaveURL(/dashboard/);
  await page.goto('/users');
  await expect(page.getByText(/Página 1 de \d+/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Próxima', exact: true })).toBeEnabled();
  await accessible(page);
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.getByRole('button', { name: 'Anterior', exact: true }).click();
  await page.getByLabel('Buscar por nome ou e-mail').fill('semresultado');
  await expect(page.getByRole('heading', { name: 'Nenhum resultado encontrado' })).toBeVisible();
  await page.getByRole('button', { name: 'Limpar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Nenhum resultado encontrado' }),
  ).not.toBeVisible();
  const suffix = info.project.name;
  for (const name of [`Unidade A ${suffix}`, `Unidade B ${suffix}`]) {
    await page.goto('/units/new');
    await page.getByLabel('Nome', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page).toHaveURL(/units\?saved=1/);
    await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();
  }
  for (const name of [`Setor ${suffix}`, `Setor adicional ${suffix}`]) {
    await page.goto('/sectors/new');
    await page.getByLabel('Nome', { exact: true }).fill(name);
    await page.getByLabel('Selecionar unidade').selectOption({ label: `Unidade A ${suffix}` });
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page).toHaveURL(/sectors\?saved=1/);
  }
  await page.goto('/users/new');
  await page.getByLabel('Nome', { exact: true }).fill(`Operador ${suffix}`);
  await page.getByLabel('E-mail', { exact: true }).fill(`operador-${suffix}@example.test`);
  await page.getByLabel('Senha temporária', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/users\?saved=1/);
  await page.getByLabel('Buscar por nome ou e-mail').fill(`Operador ${suffix}`);
  const row = page.getByRole('row').filter({ hasText: `Operador ${suffix}` });
  await expect(row).toHaveCount(1);
  await row.getByRole('link', { name: /Vínculos/ }).click();
  await expect(page.getByRole('heading', { name: 'Vínculos de acesso' })).toBeVisible();
  for (const unit of [`Unidade A ${suffix}`, `Unidade B ${suffix}`]) {
    await page.getByLabel('Selecionar unidade').selectOption({ label: unit });
    await page.getByRole('button', { name: 'Vincular unidade', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: `Ver setores de ${unit}`, exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole('button', { name: `Ver setores de Unidade A ${suffix}`, exact: true })
    .click();
  for (const name of [`Setor ${suffix}`, `Setor adicional ${suffix}`]) {
    await page.getByLabel('Selecionar setor').selectOption({ label: name });
    await page.getByRole('button', { name: 'Vincular setor', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page.getByRole('button', { name: `Revogar ${name}`, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: `Revogar Unidade A ${suffix}`, exact: true }).click();
  await accessible(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: `Revogar Unidade A ${suffix}`, exact: true }),
  ).toBeFocused();
  await page.screenshot({ path: `test-results/memberships-${suffix}.png`, fullPage: true });
  await page.goto('/users');
  await page.getByLabel('Buscar por nome ou e-mail').fill(`Operador ${suffix}`);
  const target = page.getByRole('row').filter({ hasText: `Operador ${suffix}` });
  await target.getByRole('link', { name: /Editar/ }).click();
  await page.getByLabel('Nome', { exact: true }).fill(`Operador atualizado ${suffix}`);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/users\?saved=1/);
  await page.getByLabel('Buscar por nome ou e-mail').fill(`Operador atualizado ${suffix}`);
  await page
    .getByRole('button', { name: `Desativar Operador atualizado ${suffix}`, exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Desativar', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: `Operador atualizado ${suffix}` }),
  ).toContainText('Inativo');
  await accessible(page);
  await page.screenshot({ path: `test-results/admin-${suffix}.png`, fullPage: true });
});
test('manager cannot open administrative pages', async ({ page }) => {
  await login(page, 'manager@example.test');
  await expect(page).toHaveURL(/dashboard/);
  await page.goto('/users');
  await expect(page).toHaveURL(/dashboard/);
  if ((await page.viewportSize())!.width < 760)
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Usuários' }),
  ).toHaveCount(0);
});

test('failed reads recover, unsaved edits survive cancel/back, and password screen allows logout', async ({
  page,
}) => {
  await login(page);
  await expect(page).toHaveURL(/dashboard/);
  let failed = false;
  await page.route('**/api/users?**', async (route) => {
    if (!failed) {
      failed = true;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    } else await route.continue();
  });
  await page.goto('/users');
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível' })).toBeVisible();
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await page.goto('/units');
  await page.getByRole('link', { name: 'Nova unidade' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Rascunho não salvo');
  await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Descartar alterações?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Rascunho não salvo');
  const prompt = page.waitForEvent('dialog');
  // A dismissed beforeunload deliberately produces no load/navigation event.
  await page.evaluate(() => window.history.back());
  const dialog = await prompt;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Rascunho não salvo');
  await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL(/units$/);
  await page.goto('/change-password');
  await page.getByRole('button', { name: 'Sair desta conta' }).click();
  await expect(page).toHaveURL(/login$/);
});

test('BFF rejects cross-origin mutations, non-JSON, oversized bodies and unknown routes', async ({
  request,
}) => {
  expect(
    (
      await request.post('/api/auth/login', {
        headers: { Origin: 'https://invalid.example' },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post('/api/auth/login', {
        headers: { Origin: 'http://127.0.0.1:3100', 'Content-Type': 'text/plain' },
        data: '{}',
      })
    ).status(),
  ).toBe(415);
  expect(
    (
      await request.post('/api/auth/login', {
        headers: { Origin: 'http://127.0.0.1:3100', 'Content-Type': 'application/json' },
        data: ' '.repeat(2 * 1024 * 1024 + 1),
      })
    ).status(),
  ).toBe(413);
  expect((await request.get('/api/health/ready')).status()).toBe(404);
});
