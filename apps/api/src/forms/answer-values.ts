import type { AnswerValue, FormQuestion, Predicate, RuleScalar } from '@portal/contracts';

export function isEmpty(value: AnswerValue | undefined) {
  return (
    value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
  );
}

/** No coercion: zero is valid, numeric strings are not numbers, dates must exist. */
export function validAnswer(question: FormQuestion, value: unknown): value is RuleScalar {
  switch (question.type) {
    case 'TEXT':
      return typeof value === 'string' && value.length <= 10000 && value.trim().length > 0;
    case 'NUMBER':
      return typeof value === 'number' && Number.isFinite(value);
    case 'DATE': {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }
    case 'SELECT':
      return typeof value === 'string' && !!question.options?.some((option) => option.id === value);
    case 'YES_NO_NA':
      return value === 'YES' || value === 'NO' || value === 'NA';
    default:
      return false;
  }
}

export function validPredicate(question: FormQuestion, predicate: Predicate) {
  if (predicate.operator === 'IN')
    return (
      Array.isArray(predicate.value) &&
      predicate.value.length > 0 &&
      predicate.value.every((value) => validAnswer(question, value))
    );
  return (
    (predicate.operator === 'EQ' || predicate.operator === 'NEQ') &&
    !Array.isArray(predicate.value) &&
    validAnswer(question, predicate.value)
  );
}

export function matches(value: RuleScalar | undefined, predicate: Predicate): boolean {
  if (value === undefined) return false;
  if (predicate.operator === 'IN')
    return Array.isArray(predicate.value) && predicate.value.includes(value);
  if (predicate.operator === 'EQ') return value === predicate.value;
  return value !== predicate.value;
}
