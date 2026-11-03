const randomUUID = () => crypto.randomUUID();
import { expect, it } from 'vitest';
import { csvHeaders, importQuestions } from './import-csv.js';
import { RuleEngine } from './rule-engine.js';

const options = {
  title: 'Inspeção EPC',
  textQuestions: [3],
  required: true,
  category: 'EPC',
  priority: 'HIGH' as const,
};
const headers = [
  'Status',
  '1. Proteção instalada?',
  '1. Ação Realizada',
  '2. Área segura?',
  '2. Ação Realizada',
  '3. Tema de segurança?',
];
it('imports height-work questionnaires with question 3 as a choice and ten conditional actions', () => {
  const columns = [
    'Protocolo',
    'Criado por',
    'Criado',
    ...Array.from({ length: 10 }, (_, index) => [
      `${index + 1}. Verificação em altura?`,
      `${index + 1}. Ação Realizada`,
    ]).flat(),
  ];
  const snapshot = importQuestions(columns, { ...options, textQuestions: [] }, randomUUID);
  const questions = snapshot.sections[0]!.questions;
  expect(questions).toHaveLength(20);
  expect(questions.filter((q) => q.type === 'YES_NO_NA')).toHaveLength(10);
  expect(questions[4]!.type).toBe('YES_NO_NA');
  expect(questions[5]!.visibleWhen).toEqual([
    { questionId: questions[4]!.id, operator: 'EQ', value: 'NO' },
  ]);
});
it('reads only a quoted first CSV record, respecting BOM, delimiters and escaped quotes', () => {
  expect(
    csvHeaders(
      '\ufeff"Status";"1. Proteção ""RF""?";"1. Ação Realizada"\r\nprivate;person;response',
    ),
  ).toEqual(['Status', '1. Proteção "RF"?', '1. Ação Realizada']);
  expect(csvHeaders('"1. Área,\nsegura?",1. Ação Realizada\nsecret')).toEqual([
    '1. Área, segura?',
    '1. Ação Realizada',
  ]);
  expect(() => csvHeaders('"unterminated')).toThrow();
});
it('builds typed questions and mandatory actions only for NO using the shared engine', () => {
  const snapshot = importQuestions(headers, options, randomUUID);
  const [q1, action1, q2, , q3] = snapshot.sections[0]!.questions;
  expect(q3!.type).toBe('TEXT');
  const engine = new RuleEngine();
  expect(engine.validateDefinition(snapshot)).toEqual([]);
  const answers = [
    { questionId: q1!.id, value: 'NO' },
    { questionId: q2!.id, value: 'NA' },
    { questionId: q3!.id, value: 'Tema' },
  ];
  expect(engine.evaluate(snapshot, answers).errors).toEqual([
    { questionId: action1!.id, code: 'REQUIRED' },
  ]);
  expect(
    engine.evaluate(snapshot, [...answers, { questionId: action1!.id, value: 'Corrigida' }]).errors,
  ).toEqual([]);
  expect(
    engine.evaluate(
      snapshot,
      answers.map((a) => (a.questionId === q1!.id ? { ...a, value: 'YES' } : a)),
    ).errors,
  ).toEqual([]);
});
it('rejects loss of columns, duplicate references, orphan actions and incomplete mappings', () => {
  for (const bad of [
    ['Unknown', ...headers],
    [...headers, '1. Outra pergunta'],
    ['1. Ação Realizada'],
    ['1. Proteção?'],
    ['1. Texto', '1. Ação Realizada'],
  ]) {
    expect(() => importQuestions(bad, options, randomUUID)).toThrow();
  }
  expect(() => importQuestions(headers, { ...options, textQuestions: [99] }, randomUUID)).toThrow();
});
