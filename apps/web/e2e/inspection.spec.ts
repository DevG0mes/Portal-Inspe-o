import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { FormQuestion } from '@portal/contracts';
const origin = 'http://127.0.0.1:3100';
async function role(page: Page, role: string) {
  const response = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { email: `${role}@example.test`, password: process.env.BROWSER_PASSWORD! },
  });
  expect(response.status()).toBe(200);
}
async function fixture(page: Page, name: string) {
  await role(page, 'admin');
  const first: FormQuestion = {
    id: randomUUID(),
    label: 'Área segura?',
    type: 'YES_NO_NA',
    required: true,
    nonconformity: { operator: 'EQ', value: 'NO', category: 'Proteção coletiva', priority: 'HIGH' },
  };
  const hidden: FormQuestion = {
    id: randomUUID(),
    label: 'Observação de área segura',
    type: 'TEXT',
    required: true,
    visibleWhen: [{ questionId: first.id, operator: 'EQ', value: 'YES' }],
  };
  const others: FormQuestion[] = [
    { id: randomUUID(), label: 'Descrição do risco', type: 'TEXT', required: true },
    { id: randomUUID(), label: 'Quantidade de barreiras', type: 'NUMBER', required: true },
    { id: randomUUID(), label: 'Medição de precisão', type: 'NUMBER', required: false },
    { id: randomUUID(), label: 'Data da verificação', type: 'DATE', required: true },
    {
      id: randomUUID(),
      label: 'Condição do equipamento',
      type: 'SELECT',
      required: true,
      options: [
        { id: randomUUID(), label: 'Conforme' },
        { id: randomUUID(), label: 'Ajustar' },
      ],
    },
  ];
  const form = await (
    await page.request.post('/api/forms', { headers: { Origin: origin }, data: { name } })
  ).json();
  const response = await page.request.put(`/api/forms/${form.id}/draft`, {
    headers: { Origin: origin },
    data: {
      revision: form.revision,
      snapshot: {
        schemaVersion: 1,
        title: name,
        sections: [
          {
            id: randomUUID(),
            title: 'Verificação de campo',
            questions: [first, hidden, ...others],
          },
        ],
      },
    },
  });
  expect(response.status()).toBe(200);
  const draft = await response.json();
  expect(
    (
      await page.request.post(`/api/forms/${form.id}/publish`, {
        headers: { Origin: origin },
        data: { revision: draft.revision },
      })
    ).status(),
  ).toBe(200);
  return { formId: form.id, first, hidden, others };
}
async function createThroughUI(page: Page, name: string) {
  await page.goto('/inspections/new');
  await page
    .getByLabel('Selecionar unidade', { exact: true })
    .selectOption({ label: 'Unidade de testes' });
  await page
    .getByLabel('Selecionar setor', { exact: true })
    .selectOption({ label: 'Setor de testes' });
  const picker = page.getByRole('group', { name: 'Formulário', exact: true });
  await picker.getByLabel('Buscar formulário').fill(name);
  await picker.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.getByLabel('Selecionar formulário', { exact: true }).selectOption({ label: name });
  await page.getByRole('button', { name: 'Revisar inspeção', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Iniciar preenchimento', exact: true })
    .click();
  await expect(page).toHaveURL(/\/inspections\/[a-f0-9-]+$/);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
async function accessible(page: Page) {
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('fills an inspection with typed answers, preserves immutable history and reopens with justification', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const name = `Execução ${info.project.name}`;
  const model = await fixture(page, name);
  await role(page, 'collaborator');
  await page.goto('/inspections/new');
  await page.getByRole('button', { name: 'Revisar inspeção', exact: true }).click();
  await expect(page.getByText('Selecione uma unidade.', { exact: true })).toBeVisible();
  await createThroughUI(page, name);
  await page.getByRole('button', { name: 'Revisar e concluir', exact: true }).click();
  await expect(page.getByLabel('Área segura? (obrigatória)', { exact: true })).toBeFocused();
  await page.getByLabel('Área segura? (obrigatória)', { exact: true }).selectOption('YES');
  await page
    .getByLabel('Observação de área segura (obrigatória)', { exact: true })
    .fill('Resposta que ficará oculta');
  await page.getByLabel('Área segura? (obrigatória)', { exact: true }).selectOption('NO');
  await expect(
    page.getByLabel('Observação de área segura (obrigatória)', { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel('Descrição do risco (obrigatória)', { exact: true })
    .fill('Barreira ausente');
  await page.getByLabel('Quantidade de barreiras (obrigatória)', { exact: true }).fill('0');
  await page.getByLabel('Medição de precisão', { exact: true }).fill('0.123456789');
  await page.getByLabel('Data da verificação (obrigatória)', { exact: true }).fill('2026-10-28');
  await page
    .getByLabel('Condição do equipamento (obrigatória)', { exact: true })
    .selectOption({ label: 'Ajustar' });
  await expect(page.getByText(/Respostas salvas · Revisão/)).toBeVisible();
  await accessible(page);
  await page.screenshot({
    path: `test-results/inspection-runner-${info.project.name}.png`,
    fullPage: true,
  });
  const url = page.url();
  await page.reload();
  await expect(
    page.getByLabel('Quantidade de barreiras (obrigatória)', { exact: true }),
  ).toHaveValue('0');
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
  await expect(
    page.getByText('Proteção coletiva · Prioridade alta', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('0,123456789', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reabrir inspeção', exact: true })).toHaveCount(0);
  const id = url.split('/').at(-1)!;
  const completed = await (await page.request.get(`/api/inspections/${id}`)).json();
  expect(
    completed.answers.some(
      (answer: { questionId: string }) => answer.questionId === model.hidden.id,
    ),
  ).toBe(false);
  expect(
    completed.answers.find(
      (answer: { questionId: string }) => answer.questionId === model.others[1]!.id,
    ).value,
  ).toBe(0);
  await accessible(page);
  await role(page, 'manager');
  await page.goto(url);
  await page.getByRole('button', { name: 'Reabrir inspeção', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reabrir inspeção', exact: true })
    .click();
  await expect(
    page.getByText('Informe uma justificativa com pelo menos 5 caracteres.', { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Justificativa da reabertura', { exact: true })
    .fill('Conferir novamente as barreiras');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reabrir inspeção', exact: true })
    .click();
  await expect(
    page.getByText(
      'Consulta do rascunho. O preenchimento está disponível apenas ao criador ou aos responsáveis.',
      { exact: true },
    ),
  ).toBeVisible();
  await role(page, 'collaborator');
  await page.goto(url);
  await page.getByText('Consultar conclusões anteriores (1)', { exact: true }).click();
  await expect(page.getByText('Barreira ausente', { exact: true })).toBeVisible();
  await page
    .getByLabel('Descrição do risco (obrigatória)', { exact: true })
    .fill('Barreira conferida novamente');
  await page.getByRole('button', { name: 'Revisar e concluir', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Concluir inspeção', exact: true })
    .click();
  await expect(
    page.getByLabel('Ciclo consultado', { exact: true }).getByRole('option'),
  ).toHaveCount(2);
  await page.getByLabel('Ciclo consultado', { exact: true }).selectOption('1');
  await expect(page.getByText('Barreira ausente', { exact: true })).toBeVisible();
  await page.getByLabel('Ciclo consultado', { exact: true }).selectOption('2');
  await expect(page.getByText('Barreira conferida novamente', { exact: true })).toBeVisible();
  await page.goto('/inspections?state=COMPLETED');
  await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();
});

test('retains local answers on network failure and real two-tab conflicts until explicit recovery', async ({
  page,
  context,
}, info) => {
  test.setTimeout(90000);
  const name = `Recuperação ${info.project.name}`;
  await fixture(page, name);
  await role(page, 'collaborator');
  await createThroughUI(page, name);
  const url = page.url();
  await page.route('**/api/inspections/*/draft', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page
    .getByLabel('Descrição do risco (obrigatória)', { exact: true })
    .fill('Edição preservada');
  await expect(
    page.getByRole('button', { name: 'Tentar salvar novamente', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '← Inspeções', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByLabel('Descrição do risco (obrigatória)', { exact: true })).toHaveValue(
    'Edição preservada',
  );
  await page.unroute('**/api/inspections/*/draft');
  await page.getByRole('button', { name: 'Tentar salvar novamente', exact: true }).click();
  await expect(page.getByText(/Respostas salvas · Revisão/)).toBeVisible();
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByLabel('Descrição do risco (obrigatória)', { exact: true })).toHaveValue(
    'Edição preservada',
  );
  await page
    .getByLabel('Descrição do risco (obrigatória)', { exact: true })
    .fill('Servidor ganhou');
  await expect(page.getByText(/Respostas salvas · Revisão/)).toBeVisible();
  await other
    .getByLabel('Descrição do risco (obrigatória)', { exact: true })
    .fill('Minha cópia local');
  await expect(other.getByLabel('Respostas locais para copiar', { exact: true })).toContainText(
    'Minha cópia local',
  );
  await expect(other.getByRole('region', { name: 'Recuperação de conflito' })).toBeFocused();
  await accessible(other);
  await other.getByRole('button', { name: 'Recarregar inspeção', exact: true }).click();
  await other.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(other.getByLabel('Respostas locais para copiar', { exact: true })).toContainText(
    'Minha cópia local',
  );
  await other.getByRole('button', { name: 'Recarregar inspeção', exact: true }).click();
  await other
    .getByRole('dialog')
    .getByRole('button', { name: 'Descartar e recarregar', exact: true })
    .click();
  await expect(other.getByLabel('Descrição do risco (obrigatória)', { exact: true })).toHaveValue(
    'Servidor ganhou',
  );
  await other.close();
});

test('starts a due assignment and displays its actual completion state', async ({ page }, info) => {
  await role(page, 'collaborator');
  await page.goto('/assignments');
  const row = page.getByRole('row').filter({ hasText: `Ronda disponível ${info.project.name}` });
  await row.getByRole('button', { name: 'Iniciar inspeção', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ficha de testes', exact: true })).toBeVisible();
  await page.getByLabel('Área segura?', { exact: true }).selectOption('YES');
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
  await page.goto('/assignments');
  await expect(row.getByText('Inspeção concluída', { exact: true })).toBeVisible();
  await row.getByRole('link', { name: 'Consultar inspeção', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ficha de testes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revisar e concluir', exact: true })).toHaveCount(
    0,
  );
});
