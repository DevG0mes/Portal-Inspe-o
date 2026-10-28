import { randomUUID } from 'node:crypto';
import type { FormQuestion, FormVersionSnapshot, QuestionType } from '@portal/contracts';

export function question(type: QuestionType, overrides: Partial<FormQuestion> = {}): FormQuestion {
  return { id: randomUUID(), label: 'Item de inspeção', type, required: true, ...overrides };
}

export function definition(questions: FormQuestion[]): FormVersionSnapshot {
  return {
    schemaVersion: 1,
    title: 'Inspeção de segurança',
    sections: [{ id: randomUUID(), title: 'Verificações', questions }],
  };
}
