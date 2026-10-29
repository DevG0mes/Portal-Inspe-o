// @vitest-environment jsdom
import { beforeAll, afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { ActionDetail } from './action-detail';
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup() {
  let row = {
    id: 'p',
    state: 'OPEN',
    revision: 1,
    description: 'Descrição confirmada',
    category: 'Proteção',
    priority: 'HIGH',
    dueDate: '2026-11-10',
    dueAt: '2026-11-11T02:59:59.999Z',
    overdue: false,
    completedAt: null,
    responsibleId: 'u',
    responsibleName: 'Responsável',
    unitId: 'a',
    sectorId: 'b',
    unitName: 'Unidade',
    sectorName: 'Setor',
    sourceSubmissionId: 's',
    questionId: 'q',
    question: { id: 'q', label: 'Proteção instalada?', type: 'YES_NO_NA', required: true },
    sourceAnswer: 'NO',
    sourceNote: null,
    sourceEvidence: [],
    evidence: [],
    inspectionTitle: 'Ficha',
    canManage: true,
    canExecute: false,
    history: { data: [], total: 0, page: 1, pageSize: 10 },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path.endsWith('/commands')) {
        const command = JSON.parse(String(options?.body));
        row = {
          ...row,
          revision: row.revision + 1,
          ...(command.type === 'ASSIGN'
            ? {
                description: command.description,
                dueDate: command.dueDate,
                priority: command.priority,
                responsibleId: command.responsibleId,
              }
            : {}),
        };
        return new Response(JSON.stringify(row));
      }
      if (path.includes('/history'))
        return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 10 }));
      if (path.includes('candidates'))
        return new Response(
          JSON.stringify({
            data: [{ id: 'u', name: 'Responsável' }],
            total: 1,
            page: 1,
            pageSize: 10,
          }),
        );
      if (path.includes('files/policy'))
        return new Response(
          JSON.stringify({
            maxBytes: 10485760,
            maxFiles: 20,
            allowedMimeTypes: ['image/png'],
            accept: '.png',
          }),
        );
      return new Response(JSON.stringify(row));
    }),
  );
  render(<ActionDetail id="p" />);
}
it('preserves an unsaved assignment when a comment is committed', async () => {
  setup();
  await screen.findByLabelText('Descrição da correção');
  fireEvent.change(screen.getByLabelText('Descrição da correção'), {
    target: { value: 'Rascunho da atribuição' },
  });
  fireEvent.change(screen.getByLabelText('Comentário ou justificativa'), {
    target: { value: 'Comentário confirmado' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar comentário', exact: true }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Confirmar operação',
      exact: true,
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect((screen.getByLabelText('Descrição da correção') as HTMLTextAreaElement).value).toBe(
    'Rascunho da atribuição',
  );
});
it('preserves an unsent comment when assignment changes are committed', async () => {
  setup();
  await screen.findByLabelText('Descrição da correção');
  fireEvent.change(screen.getByLabelText('Descrição da correção'), {
    target: { value: 'Descrição atualizada' },
  });
  fireEvent.change(screen.getByLabelText('Comentário ou justificativa'), {
    target: { value: 'Meu comentário ainda local' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar atribuição', exact: true }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Confirmar operação',
      exact: true,
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect((screen.getByLabelText('Comentário ou justificativa') as HTMLTextAreaElement).value).toBe(
    'Meu comentário ainda local',
  );
});
