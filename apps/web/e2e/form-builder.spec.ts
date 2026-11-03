import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
async function login(page: Page, email = 'admin@example.test') {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(process.env.BROWSER_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: /^Desktop/ }).click();
  await expect(page).toHaveURL(email.startsWith('collaborator') ? /my-work/ : /dashboard/);
}
async function a11y(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((issue) => ({
      id: issue.id,
      nodes: issue.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function create(page: Page, name: string) {
  await page.goto('/admin/forms');
  await page.getByLabel('Nome do modelo', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Criar formulário', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByLabel('Título do formulário', { exact: true })).toBeVisible();
}
async function publish(page: Page) {
  await page.getByRole('button', { name: 'Publicar versão', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Publicar nova versão?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Criar novo rascunho', exact: true }),
  ).toBeVisible();
}
test('builds conditional content, simulates rules and preserves immutable v1/v2 history', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await login(page);
  const name = `Ficha ${info.project.name}`;
  await create(page, name);
  await page.getByRole('button', { name: 'Publicar versão', exact: true }).click();
  await expect(page.getByText('Adicione pelo menos uma pergunta.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar seção', exact: true }).click();
  const section = page.getByRole('region', { name: 'Seção 1', exact: true });
  await section.getByLabel('Título da seção', { exact: true }).fill('Condições da área');
  await section.getByRole('button', { name: /Adicionar pergunta/ }).click();
  const first = page.getByRole('article', { name: 'Seção 1, pergunta 1', exact: true });
  await first.getByLabel('Texto da pergunta', { exact: true }).fill('Área está segura?');
  await first.getByLabel('Resposta obrigatória', { exact: true }).check();
  await first
    .getByLabel('Gerar ocorrência quando a resposta atender à regra', { exact: true })
    .check();
  await first.getByLabel('Categoria da ocorrência', { exact: true }).fill('Condição insegura');
  await first.getByLabel('Prioridade', { exact: true }).selectOption('HIGH');
  await section.getByRole('button', { name: /Adicionar pergunta/ }).click();
  const second = page.getByRole('article', { name: 'Seção 1, pergunta 2', exact: true });
  await second.getByLabel('Texto da pergunta', { exact: true }).fill('Descreva o risco');
  await second.getByLabel('Tipo de resposta', { exact: true }).selectOption('TEXT');
  await second.getByRole('button', { name: 'Adicionar condição', exact: true }).click();
  await expect(second.getByLabel('Pergunta de referência 1', { exact: true })).toHaveText(
    '1. Área está segura?',
  );
  await second.getByRole('button', { name: 'Subir pergunta 2', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'dependência' })).toBeVisible();
  await page.getByRole('button', { name: 'Pré-visualizar', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Pré-visualização', exact: true });
  await expect(preview.getByLabel('Descreva o risco', { exact: true })).toHaveCount(0);
  await preview.getByLabel('Área está segura? (obrigatória)', { exact: true }).selectOption('NO');
  await expect(preview.getByLabel('Descreva o risco', { exact: true })).toBeVisible();
  await preview.getByLabel('Descreva o risco', { exact: true }).fill('Passagem obstruída');
  await expect(
    preview.getByText('Condição insegura · Prioridade alta', { exact: true }),
  ).toBeVisible();
  await preview.getByRole('button', { name: 'Conferir na API', exact: true }).click();
  await expect(preview.getByRole('status')).toContainText('Prévia conferida');
  await a11y(page);
  await page.screenshot({
    path: `test-results/form-preview-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Editar conteúdo', exact: true }).click();
  await expect(page.getByText('Rascunho salvo', { exact: true })).toBeVisible();
  await publish(page);
  await expect(page.getByText('Administrador teste', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Consultar versão 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Consulta da versão 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar versão', exact: true }).click();
  await page.getByRole('button', { name: 'Criar novo rascunho', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Criar rascunho', exact: true })
    .click();
  await page.getByLabel('Título do formulário', { exact: true }).fill('Ficha revisada');
  await publish(page);
  await page.getByRole('button', { name: 'Consultar versão 1', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Pré-visualização', exact: true })
      .getByRole('heading', { name, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fechar versão', exact: true }).click();
  await page.getByRole('button', { name: 'Consultar versão 2', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ficha revisada', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Arquivar modelo', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Arquivar', exact: true }).click();
  await expect(
    page.getByText('Modelo arquivado. As versões anteriores continuam disponíveis para consulta.', {
      exact: true,
    }),
  ).toBeVisible();
});
test('autosave failure and two-editor conflict preserve local work until explicit reload', async ({
  page,
  context,
}, info) => {
  await login(page);
  await create(page, `Conflito ${info.project.name}`);
  await page.getByRole('button', { name: 'Adicionar seção', exact: true }).click();
  await page.getByLabel('Título da seção', { exact: true }).fill('Seção preservada');
  await expect(page.getByText('Rascunho salvo', { exact: true })).toBeVisible();
  const url = page.url();
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByLabel('Título do formulário')).toBeVisible();
  await page.getByLabel('Título do formulário').fill('Gravação da primeira aba');
  await expect(page.getByText('Rascunho salvo', { exact: true })).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await other.route('**/api/forms/*/draft', async (route) => {
    if (route.request().method() === 'PUT') await gate;
    await route.continue();
  });
  const pendingSave = other.waitForRequest(
    (request) => request.method() === 'PUT' && request.url().endsWith('/draft'),
  );
  await other.getByLabel('Título do formulário').fill('Meu conteúdo preservado');
  await other.getByRole('button', { name: 'Remover seção 1', exact: true }).click();
  await expect(other.getByRole('dialog', { name: 'Remover seção?' })).toBeVisible();
  await pendingSave;
  release();
  await expect(
    other.getByRole('heading', { name: 'O formulário mudou em outra sessão' }),
  ).toBeVisible();
  await expect(other.getByRole('dialog', { name: 'Remover seção?' })).not.toBeVisible();
  await other.getByText('Ver conteúdo local para copiar', { exact: true }).click();
  await expect(other.getByLabel('Conteúdo local (JSON)')).toContainText('Meu conteúdo preservado');
  await other.getByRole('button', { name: 'Recarregar dados atuais', exact: true }).click();
  await other.getByRole('dialog').getByRole('button', { name: 'Recarregar', exact: true }).click();
  await expect(other.getByLabel('Título do formulário')).toHaveValue('Gravação da primeira aba');
  await other.close();
  let failed = false;
  await page.route('**/api/forms/*/draft', async (route) => {
    if (route.request().method() === 'PUT' && !failed) {
      failed = true;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    } else await route.continue();
  });
  await page.getByLabel('Título do formulário').fill('Recuperado após falha');
  await expect(page.getByText('Falha ao salvar', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Título do formulário')).toHaveValue('Recuperado após falha');
  await page.getByRole('button', { name: 'Tentar salvar novamente', exact: true }).click();
  await expect(page.getByText('Rascunho salvo', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Título do formulário')).toHaveValue('Recuperado após falha');
  await a11y(page);
});
test('form administration is unavailable to manager and collaborator', async ({ page }) => {
  for (const email of ['manager@example.test', 'collaborator@example.test']) {
    await login(page, email);
    await page.goto('/admin/forms');
    await expect(page).toHaveURL(email.startsWith('collaborator') ? /my-work/ : /dashboard/);
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page).toHaveURL(/login/);
  }
});

test('selection rules recover after clearing and numeric/date answers remain typed', async ({
  page,
}, info) => {
  await login(page);
  const headers = { Origin: 'http://127.0.0.1:3100' };
  const created = await page.request.post('/api/forms', {
    headers,
    data: { name: `Tipos ${info.project.name}` },
  });
  expect(created.status()).toBe(201);
  const form = await created.json();
  const a = randomUUID(),
    b = randomUUID();
  const snapshot = {
    schemaVersion: 1,
    title: 'Ficha de tipos',
    sections: [
      {
        id: randomUUID(),
        title: 'Dados de campo',
        questions: [
          {
            id: randomUUID(),
            label: 'Tipo de risco',
            type: 'SELECT',
            required: false,
            options: [
              { id: a, label: 'Elétrico' },
              { id: b, label: 'Mecânico' },
            ],
            nonconformity: {
              operator: 'IN',
              value: [a],
              category: 'Risco identificado',
              priority: 'MEDIUM',
            },
          },
          { id: randomUUID(), label: 'Número de extintores', type: 'NUMBER', required: false },
          { id: randomUUID(), label: 'Data da vistoria', type: 'DATE', required: false },
        ],
      },
    ],
  };
  expect(
    (
      await page.request.put(`/api/forms/${form.id}/draft`, {
        headers,
        data: { revision: form.revision, snapshot },
      })
    ).status(),
  ).toBe(200);
  await page.goto(`/admin/forms/${form.id}`);
  const first = page.getByRole('article', { name: 'Seção 1, pergunta 1', exact: true });
  await first.getByRole('checkbox', { name: 'Elétrico', exact: true }).uncheck();
  await first.getByRole('checkbox', { name: 'Mecânico', exact: true }).check();
  await first.getByLabel('Tipo de resposta', { exact: true }).selectOption('TEXT');
  await expect(
    page.getByRole('dialog', { name: 'Alterar tipo e descartar configurações?' }),
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(first.getByLabel('Tipo de resposta')).toHaveValue('SELECT');
  await first.getByRole('button', { name: 'Remover opção 1', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Remover opção?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(first.getByLabel('Opção 1', { exact: true })).toHaveValue('Elétrico');
  await page.getByRole('button', { name: 'Pré-visualizar', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Pré-visualização', exact: true });
  await preview.getByLabel('Tipo de risco', { exact: true }).selectOption(b);
  await preview.getByLabel('Número de extintores', { exact: true }).fill('0');
  await preview.getByLabel('Data da vistoria', { exact: true }).fill('2026-10-28');
  await preview.getByRole('button', { name: 'Conferir na API', exact: true }).click();
  await expect(preview.getByRole('status')).toContainText(
    '1 ocorrência(s); 0 resposta(s) a revisar',
  );
  await a11y(page);
});
