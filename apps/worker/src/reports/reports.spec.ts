import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import type { AnalyticsReportSnapshot, InspectionReportSnapshot } from '@portal/contracts';
import { renderXlsx } from './xlsx.renderer.js';
import { renderPdf } from './pdf.renderer.js';
const base = {
  requestedAt: '2026-10-29T15:00:00Z',
  requestedBy: 'João de teste',
  scope: { role: 'ADMIN', sectorIds: [], inspectionIds: [], assignmentIds: [], planIds: [] },
};
const analytics: AnalyticsReportSnapshot = {
  ...base,
  kind: 'ANALYTICS',
  filters: { from: '2026-10-01', to: '2026-10-29', category: 'Proteção' },
  summary: {
    from: '2026-10-01',
    to: '2026-10-29',
    inspections: {
      completed: 2,
      drafts: 1,
      pending: 3,
      overdue: 1,
      evaluatedAnswers: 4,
      nonconformingAnswers: 1,
      nonconformities: 1,
      conformityRate: 75,
    },
    plans: {
      total: 1,
      open: 0,
      inProgress: 0,
      awaitingValidation: 0,
      completed: 1,
      overdue: 0,
      critical: 0,
      averageResolutionHours: 2.5,
    },
    administration: null,
  },
  trends: [{ date: '2026-10-29', completed: 2, nonconformities: 1 }],
  groups: {
    units: [],
    sectors: [],
    forms: [],
    categories: [{ label: 'Proteção', count: 1 }],
    priorities: [],
  },
  occurrences: [
    {
      submissionId: 's',
      inspectionId: 'i',
      questionId: 'q',
      questionLabel: '=HYPERLINK("https://example.test")',
      unitName: 'Usina São João',
      sectorName: 'Operação',
      formTitle: 'Ficha de segurança',
      category: 'Proteção',
      priority: 'HIGH',
      completedAt: '2026-10-29T15:00:00Z',
    },
  ],
  plans: [],
};
const pdf: InspectionReportSnapshot = {
  ...base,
  kind: 'INSPECTION',
  inspectionId: 'i',
  unitName: 'Usina São João',
  sectorName: 'Operação',
  versionNumber: 2,
  form: {
    schemaVersion: 1,
    title: 'Inspeção de segurança — São João',
    sections: [
      {
        id: 's',
        title: 'Proteção coletiva',
        questions: [{ id: 'q', type: 'TEXT', label: 'Condição da proteção?', required: true }],
      },
    ],
  },
  visibleQuestionIds: ['q'],
  submission: {
    id: 's',
    cycle: 1,
    sourceRevision: 3,
    completedById: 'u',
    completedAt: '2026-10-29T15:00:00Z',
    answers: [
      {
        questionId: 'q',
        value:
          'Correção necessária. ΔP ≥ 2 bar. ' +
          'Descrição longa para verificar paginação e acentuação. '.repeat(140),
      },
    ],
    notes: [{ questionId: 'q', text: 'Observação: ação imediata.' }],
    nonconformities: [
      { key: 'q', questionId: 'q', sectionId: 's', category: 'Proteção', priority: 'HIGH' },
    ],
    evidence: [
      {
        id: 'missing',
        questionId: 'q',
        filename: 'evidência-ausente.png',
        mime: 'image/png',
        size: 100,
        sha256: 'a'.repeat(64),
        status: 'READY',
        expiresAt: null,
      },
    ],
  },
  completedByName: 'Maria de teste',
  plans: [
    {
      id: 'p',
      description: 'Instalar proteção',
      state: 'IN_PROGRESS',
      priority: 'HIGH',
      dueDate: '2026-11-01',
      responsibleName: 'João de teste',
      history: [
        {
          id: 'e',
          type: 'RETURN',
          actorName: 'Gestor',
          createdAt: '2026-10-29T14:00:00Z',
          fromState: 'AWAITING_VALIDATION',
          toState: 'IN_PROGRESS',
          text: 'Reforçar fixação.',
          evidence: [],
          assignment: null,
        },
      ],
    },
  ],
  assets: [
    { id: 'missing', key: 'private-never-print', mime: 'image/png', sha256: 'a'.repeat(64) },
  ],
};
it('writes a typed, filtered workbook with literal untrusted text and frozen headers', async () => {
  const bytes = await renderXlsx(analytics),
    book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  expect(book.worksheets.map((s) => s.name)).toEqual([
    'Resumo',
    'Evolução',
    'Ocorrências',
    'Planos',
    'Filtros',
  ]);
  const rows = book.getWorksheet('Ocorrências')!;
  expect(rows.getCell('A2').value).toBe('=HYPERLINK("https://example.test")');
  expect(rows.getCell('A2').type).toBe(ExcelJS.ValueType.String);
  expect(rows.views[0]?.state).toBe('frozen');
  expect(Number.isFinite(rows.getRow(2).height)).toBe(true);
  expect(rows.getRow(2).height).toBeGreaterThanOrEqual(24);
  const summary = book.getWorksheet('Resumo')!;
  expect(summary.getCell('B6').value).toBe(2);
  expect(summary.getCell('B12').value).toBe(0.75);
  expect(book.getWorksheet('Filtros')!.getSheetValues().flat(2)).toContain('Proteção');
  await mkdir('test-results/reports', { recursive: true });
  await writeFile('test-results/reports/sample.xlsx', bytes);
});
it('paginates long Portuguese content, records missing evidence and keeps storage keys private', async () => {
  const bytes = await renderPdf(pdf, async () => {
    throw new Error('missing');
  });
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.subarray(-20).toString()).toMatch(/%%EOF/);
  expect(bytes.includes(Buffer.from('private-never-print'))).toBe(false);
  expect((bytes.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  await mkdir('test-results/reports', { recursive: true });
  await writeFile('test-results/reports/sample.pdf', bytes);
});
it('embeds a valid PNG evidence with a verified digest', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=',
    'base64',
  );
  const snapshot = structuredClone(pdf);
  snapshot.submission.answers = [{ questionId: 'q', value: 'Proteção revisada.' }];
  snapshot.assets[0]!.sha256 = createHash('sha256').update(png).digest('hex');
  snapshot.submission.evidence[0]!.sha256 = snapshot.assets[0]!.sha256;
  const bytes = await renderPdf(snapshot, async () => png);
  expect(bytes.toString('latin1')).toMatch(/\/Subtype \/Image/);
  await writeFile('test-results/reports/sample-image.pdf', bytes);
});
