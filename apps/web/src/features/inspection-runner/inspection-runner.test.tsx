// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { cleanup, render, screen } from '@testing-library/react';
import { InspectionRunner } from './inspection-runner';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('keeps previous conclusions available while an editable reopened cycle is in progress', async () => {
  const questionId = randomUUID();
  const row = {
    id: randomUUID(),
    state: 'DRAFT',
    cycle: 2,
    revision: 4,
    canEdit: true,
    canReopen: false,
    formVersionNumber: 1,
    assignmentId: null,
    answers: [{ questionId, value: 'NO' }],
    snapshot: {
      schemaVersion: 1,
      title: 'Ficha',
      sections: [
        {
          id: randomUUID(),
          title: 'Área',
          questions: [{ id: questionId, label: 'Área segura?', type: 'YES_NO_NA', required: true }],
        },
      ],
    },
    submissions: [
      {
        id: randomUUID(),
        cycle: 1,
        sourceRevision: 2,
        completedAt: '2026-10-28T10:00:00Z',
        completedById: randomUUID(),
        answers: [{ questionId, value: 'YES' }],
        nonconformities: [],
      },
    ],
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(row))));
  render(<InspectionRunner inspectionId={row.id} />);
  await screen.findByLabelText('Área segura? (obrigatória)');
  expect(await screen.findByText('Consultar conclusões anteriores (1)')).toBeTruthy();
  expect(screen.getByText('Sim', { selector: 'dd' })).toBeTruthy();
  expect((screen.getByLabelText('Área segura? (obrigatória)') as HTMLSelectElement).value).toBe(
    'NO',
  );
});

it('preserves the precision of numeric answers when displaying a completed inspection', async () => {
  const questionId = randomUUID(),
    answers = [{ questionId, value: 0.123456789 }];
  const row = {
    id: randomUUID(),
    state: 'COMPLETED',
    cycle: 1,
    revision: 3,
    canEdit: true,
    canReopen: false,
    formVersionNumber: 1,
    assignmentId: null,
    answers,
    snapshot: {
      schemaVersion: 1,
      title: 'Ficha',
      sections: [
        {
          id: randomUUID(),
          title: 'Medição',
          questions: [
            { id: questionId, label: 'Medição de precisão', type: 'NUMBER', required: true },
          ],
        },
      ],
    },
    submissions: [
      {
        id: randomUUID(),
        cycle: 1,
        sourceRevision: 2,
        completedAt: '2026-10-28T10:00:00Z',
        completedById: randomUUID(),
        answers,
        nonconformities: [],
      },
    ],
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(row))));
  render(<InspectionRunner inspectionId={row.id} />);
  expect(await screen.findByText('0,123456789', { selector: 'dd' })).toBeTruthy();
});
