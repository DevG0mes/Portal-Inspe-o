import type {
  AnswerInput,
  EvaluationResult,
  FormVersionSnapshot,
  RuleScalar,
} from '@portal/contracts';
import { isEmpty, matches, validAnswer } from './answer-values.js';
import { validateDefinition } from './definition-validation.js';

/** Pure deterministic interpreter. It never trusts client-computed visibility or violations. */
export class RuleEngine {
  validateDefinition(snapshot: FormVersionSnapshot) {
    return validateDefinition(snapshot);
  }

  evaluate(snapshot: FormVersionSnapshot, answers: AnswerInput[]): EvaluationResult {
    const result: EvaluationResult = {
      definitionErrors: validateDefinition(snapshot),
      visibleQuestionIds: [],
      errors: [],
      acceptedAnswers: [],
      nonconformities: [],
    };
    if (result.definitionErrors.length) return result;
    const known = new Set(
      snapshot.sections.flatMap((section) => section.questions.map((question) => question.id)),
    );
    const supplied = new Map<string, AnswerInput>(),
      duplicates = new Set<string>();
    for (const answer of answers) {
      if (!known.has(answer.questionId)) {
        result.errors.push({ questionId: answer.questionId, code: 'UNKNOWN_QUESTION' });
        continue;
      }
      if (supplied.has(answer.questionId)) duplicates.add(answer.questionId);
      supplied.set(answer.questionId, answer);
    }
    const effective = new Map<string, RuleScalar>();
    for (const section of snapshot.sections) {
      for (const question of section.questions) {
        if (
          !(question.visibleWhen ?? []).every((condition) =>
            matches(effective.get(condition.questionId), condition),
          )
        )
          continue;
        result.visibleQuestionIds.push(question.id);
        if (duplicates.has(question.id)) {
          result.errors.push({ questionId: question.id, code: 'DUPLICATE_ANSWER' });
          continue;
        }
        const value = supplied.get(question.id)?.value;
        if (isEmpty(value)) {
          if (question.required) result.errors.push({ questionId: question.id, code: 'REQUIRED' });
          continue;
        }
        if (!validAnswer(question, value)) {
          result.errors.push({ questionId: question.id, code: 'INVALID_ANSWER' });
          continue;
        }
        effective.set(question.id, value);
        result.acceptedAnswers.push({ questionId: question.id, value });
        if (question.nonconformity && matches(value, question.nonconformity)) {
          result.nonconformities.push({
            key: question.id,
            questionId: question.id,
            sectionId: section.id,
            category: question.nonconformity.category,
            priority: question.nonconformity.priority,
          });
        }
      }
    }
    return result;
  }
}
