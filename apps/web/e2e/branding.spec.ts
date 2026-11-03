import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('uses the original PSI identity on login and authenticated screens with accessible contrast', async ({
  page,
}, info) => {
  await page.goto('/login');
  const logo = page.getByRole('img', { name: 'PSI Energy', exact: true });
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBe(260);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: `test-results/psi-login-${info.project.name}.png`,
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByLabel('E-mail', { exact: true }).fill('admin@example.test');
  await page.getByLabel('Senha', { exact: true }).fill(process.env.BROWSER_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: /^Desktop/ }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole('img', { name: 'PSI Energy', exact: true })).toBeVisible();
  await expect(page.locator('nav[aria-label="Principal"] a[href="/dashboard"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/psi-dashboard-${info.project.name}.png`,
    fullPage: true,
  });
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('link', { name: 'Usuários', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Usuários', exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: `test-results/psi-users-${info.project.name}.png`,
    fullPage: true,
  });
});
