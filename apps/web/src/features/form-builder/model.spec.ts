import { expect, it } from 'vitest';
import type { FormVersionSnapshot } from '@portal/contracts';
import {
  duplicateSection,
  duplicateQuestion,
  moveQuestion,
  moveSection,
  removeQuestion,
  removeSection,
  newQuestion,
  definitionIssues,
} from './model';
function fixture(): FormVersionSnapshot {
  return {
    schemaVersion: 1,
    title: 'Inspeção',
    sections: [
      {
        id: 's1',
        title: 'Área',
        questions: [
          { id: 'q1', label: 'Condição', type: 'YES_NO_NA', required: true },
          {
            id: 'q2',
            label: 'Detalhes',
            type: 'TEXT',
            required: false,
            visibleWhen: [{ questionId: 'q1', operator: 'EQ', value: 'NO' }],
          },
        ],
      },
      { id: 's2', title: 'Final', questions: [] },
    ],
  };
}
it('creates stable IDs and duplicates without sharing identities or references', () => {
  const snapshot = fixture();
  const clone = duplicateSection(snapshot, 0);
  expect(clone.sections[0]).toEqual(snapshot.sections[0]);
  const added = clone.sections[1]!;
  expect(added.id).not.toBe('s1');
  expect(added.questions[1]!.visibleWhen![0]!.questionId).toBe(added.questions[0]!.id);
  expect(snapshot.sections).toHaveLength(2);
  expect(newQuestion().id).not.toBe(newQuestion().id);
});
it('duplicates select options and remaps the self nonconformity rule', () => {
  const snapshot = fixture();
  snapshot.sections[0]!.questions = [
    {
      id: 'q1',
      label: 'Tipo',
      type: 'SELECT',
      required: true,
      options: [{ id: 'o1', label: 'A' }],
      nonconformity: { operator: 'EQ', value: 'o1', category: 'Risco', priority: 'HIGH' },
    },
  ];
  const next = duplicateQuestion(snapshot, 0, 0);
  const duplicate = next.sections[0]!.questions[1]!;
  expect(duplicate.options![0]!.id).not.toBe('o1');
  expect(duplicate.nonconformity!.value).toBe(duplicate.options![0]!.id);
});
it('blocks reordering or removal that breaks a prior dependency', () => {
  const snapshot = fixture();
  expect(() => moveQuestion(snapshot, 0, 0, 1)).toThrow(/depend/);
  expect(() => removeQuestion(snapshot, 0, 0)).toThrow(/depend/);
  expect(() => removeSection(snapshot, 0)).not.toThrow();
  snapshot.sections[1]!.questions = [
    {
      id: 'q3',
      label: 'Outra',
      type: 'TEXT',
      required: false,
      visibleWhen: [{ questionId: 'q1', operator: 'EQ', value: 'NO' }],
    },
  ];
  expect(() => moveSection(snapshot, 0, 1)).toThrow(/depend/);
  expect(() => removeSection(snapshot, 0)).toThrow(/depend/);
});
it('reports field paths for incomplete publication and refuses cycles', () => {
  const snapshot = fixture();
  snapshot.title = '';
  snapshot.sections[0]!.questions[1]!.label = '';
  expect(definitionIssues(snapshot)).toContainEqual({ path: 'title', code: 'EMPTY_LABEL' });
  expect(definitionIssues(snapshot)).toContainEqual({
    path: 'sections.0.questions.1.label',
    code: 'EMPTY_LABEL',
  });
  snapshot.sections[0]!.questions[0]!.visibleWhen = [
    { questionId: 'q2', operator: 'EQ', value: 'a' },
  ];
  expect(definitionIssues(snapshot).some((issue) => issue.code === 'FORWARD_REFERENCE')).toBe(true);
});

it('keeps an external selection reference intact when another question reuses its option ID', () => {
  const snapshot: FormVersionSnapshot = {
    schemaVersion: 1,
    title: 'Ficha',
    sections: [
      {
        id: 'outside',
        title: 'Anterior',
        questions: [
          {
            id: 'a',
            label: 'Externa',
            type: 'SELECT',
            required: false,
            options: [{ id: 'same', label: 'Valor externo' }],
          },
        ],
      },
      {
        id: 'inside',
        title: 'Duplicar',
        questions: [
          {
            id: 'b',
            label: 'Interna',
            type: 'SELECT',
            required: false,
            options: [{ id: 'same', label: 'Valor interno' }],
          },
          {
            id: 'c',
            label: 'Condicional',
            type: 'TEXT',
            required: false,
            visibleWhen: [{ questionId: 'a', operator: 'EQ', value: 'same' }],
          },
        ],
      },
    ],
  };
  const next = duplicateSection(snapshot, 1);
  expect(next.sections[2]!.questions[1]!.visibleWhen![0]).toEqual({
    questionId: 'a',
    operator: 'EQ',
    value: 'same',
  });
  expect(definitionIssues(next)).toEqual([]);
});
