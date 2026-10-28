import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RuleEngine } from './rule-engine.service.js';
import { definition, question } from '../../test/helpers/form-fixtures.js';

const engine = new RuleEngine();

describe('versioned form rule engine', () => {
  it('accepts each supported answer type, including zero and not applicable', () => {
    const option = { id: randomUUID(), label: 'Adequado' };
    const questions = [
      question('TEXT'),
      question('NUMBER'),
      question('DATE'),
      question('SELECT', { options: [option] }),
      question('YES_NO_NA'),
      question('YES_NO_NA'),
      question('YES_NO_NA'),
    ];
    const answers = ['Observação de campo', 0, '2024-02-29', option.id, 'YES', 'NO', 'NA'];
    const result = engine.evaluate(
      definition(questions),
      questions.map((item, index) => ({ questionId: item.id, value: answers[index]! })),
    );
    expect(result.errors).toEqual([]);
    expect(result.definitionErrors).toEqual([]);
    expect(result.acceptedAnswers).toHaveLength(7);
  });

  it('rejects invalid numbers, impossible dates and unknown selection options', () => {
    const numeric = question('NUMBER'),
      date = question('DATE'),
      select = question('SELECT', { options: [{ id: randomUUID(), label: 'Sim' }] });
    const result = engine.evaluate(definition([numeric, date, select]), [
      { questionId: numeric.id, value: '10' },
      { questionId: date.id, value: '2026-02-30' },
      { questionId: select.id, value: randomUUID() },
    ]);
    expect(result.errors.map((error) => error.code)).toEqual([
      'INVALID_ANSWER',
      'INVALID_ANSWER',
      'INVALID_ANSWER',
    ]);
    expect(result.acceptedAnswers).toEqual([]);
    expect(
      engine.evaluate(definition([numeric]), [{ questionId: numeric.id, value: Infinity }])
        .errors[0]?.code,
    ).toBe('INVALID_ANSWER');
  });

  it('validates required visible questions while allowing optional omissions', () => {
    const required = question('TEXT'),
      optional = question('NUMBER', { required: false });
    const result = engine.evaluate(definition([required, optional]), [
      { questionId: required.id, value: '  ' },
    ]);
    expect(result.errors).toEqual([{ questionId: required.id, code: 'REQUIRED' }]);
  });

  it('does not let forged hidden answers trigger later visibility or nonconformities', () => {
    const first = question('YES_NO_NA');
    const hidden = question('YES_NO_NA', {
      visibleWhen: [{ questionId: first.id, operator: 'EQ', value: 'YES' }],
      nonconformity: { operator: 'EQ', value: 'YES', category: 'EPI', priority: 'HIGH' },
    });
    const dependent = question('TEXT', {
      visibleWhen: [{ questionId: hidden.id, operator: 'EQ', value: 'YES' }],
    });
    const result = engine.evaluate(definition([first, hidden, dependent]), [
      { questionId: first.id, value: 'NO' },
      { questionId: hidden.id, value: 'YES' },
    ]);
    expect(result.visibleQuestionIds).toEqual([first.id]);
    expect(result.acceptedAnswers).toEqual([{ questionId: first.id, value: 'NO' }]);
    expect(result.errors).toEqual([]);
    expect(result.nonconformities).toEqual([]);
  });

  it('requires an actual valid answer before evaluating negative conditions', () => {
    const first = question('NUMBER', { required: false });
    const second = question('TEXT', {
      visibleWhen: [{ questionId: first.id, operator: 'NEQ', value: 1 }],
    });
    expect(engine.evaluate(definition([first, second]), []).visibleQuestionIds).toEqual([first.id]);
    expect(
      engine.evaluate(definition([first, second]), [{ questionId: first.id, value: 0 }])
        .visibleQuestionIds,
    ).toEqual([first.id, second.id]);
  });

  it('produces deterministic nonconformities only for configured responses', () => {
    const item = question('YES_NO_NA', {
      nonconformity: { operator: 'IN', value: ['NO', 'NA'], category: 'EPI', priority: 'CRITICAL' },
    });
    const snapshot = definition([item]);
    const before = structuredClone(snapshot);
    const answers = [{ questionId: item.id, value: 'NO' }];
    const result = engine.evaluate(snapshot, answers);
    expect(result.nonconformities).toEqual([
      {
        key: item.id,
        questionId: item.id,
        sectionId: snapshot.sections[0]!.id,
        category: 'EPI',
        priority: 'CRITICAL',
      },
    ]);
    expect(engine.evaluate(snapshot, answers)).toEqual(result);
    expect(snapshot).toEqual(before);
    expect(
      engine.evaluate(snapshot, [{ questionId: item.id, value: 'YES' }]).nonconformities,
    ).toEqual([]);
  });

  it('rejects forward references, cycles and removed references before evaluation', () => {
    const first = question('YES_NO_NA'),
      second = question('YES_NO_NA');
    first.visibleWhen = [{ questionId: second.id, operator: 'EQ', value: 'YES' }];
    expect(
      engine
        .validateDefinition(definition([first, second]))
        .some((issue) => issue.code === 'FORWARD_REFERENCE'),
    ).toBe(true);
    second.visibleWhen = [{ questionId: first.id, operator: 'EQ', value: 'YES' }];
    expect(
      engine
        .validateDefinition(definition([first, second]))
        .some((issue) => issue.code === 'CYCLIC_DEPENDENCY'),
    ).toBe(true);
    const missing = engine.evaluate(definition([second]), []);
    expect(missing.definitionErrors.some((issue) => issue.code === 'MISSING_REFERENCE')).toBe(true);
    expect(missing.visibleQuestionIds).toEqual([]);
  });

  it('rejects incomplete content, duplicate question IDs and invalid rule values', () => {
    expect(
      engine.validateDefinition(definition([])).some((issue) => issue.code === 'EMPTY_FORM'),
    ).toBe(true);
    const first = question('SELECT', { options: [{ id: randomUUID(), label: 'Bom' }] });
    const second = question('TEXT', {
      visibleWhen: [{ questionId: first.id, operator: 'EQ', value: 'invalid-option' }],
    });
    expect(
      engine
        .validateDefinition(definition([first, second]))
        .some((issue) => issue.code === 'INVALID_PREDICATE'),
    ).toBe(true);
    expect(
      engine
        .validateDefinition(definition([first, { ...second, id: first.id }]))
        .some((issue) => issue.code === 'DUPLICATE_ID'),
    ).toBe(true);
  });

  it('reports unknown and duplicate answers instead of choosing one silently', () => {
    const item = question('NUMBER');
    const unknown = randomUUID();
    const result = engine.evaluate(definition([item]), [
      { questionId: item.id, value: 1 },
      { questionId: item.id, value: 2 },
      { questionId: unknown, value: 3 },
    ]);
    expect(result.errors).toContainEqual({ questionId: item.id, code: 'DUPLICATE_ANSWER' });
    expect(result.errors).toContainEqual({ questionId: unknown, code: 'UNKNOWN_QUESTION' });
    expect(result.acceptedAnswers).toEqual([]);
  });
});
