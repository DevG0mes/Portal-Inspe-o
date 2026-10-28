import type { DefinitionIssue, FormQuestion, FormVersionSnapshot } from '@portal/contracts';
import { validPredicate } from './answer-values.js';

export function validateDefinition(snapshot: FormVersionSnapshot): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const add = (path: string, code: string) => {
    issues.push({ path, code });
  };
  const indexed = new Map<string, { question: FormQuestion; position: number; path: string }>();
  const sectionIds = new Set<string>();
  let position = 0;
  if (!snapshot.title.trim()) add('title', 'EMPTY_LABEL');
  snapshot.sections.forEach((section, sectionIndex) => {
    const path = `sections.${sectionIndex}`;
    if (sectionIds.has(section.id)) add(`${path}.id`, 'DUPLICATE_ID');
    sectionIds.add(section.id);
    if (!section.title.trim()) add(`${path}.title`, 'EMPTY_LABEL');
    if (section.questions.length === 0) add(`${path}.questions`, 'EMPTY_SECTION');
    section.questions.forEach((question, questionIndex) => {
      const questionPath = `${path}.questions.${questionIndex}`;
      if (indexed.has(question.id)) add(`${questionPath}.id`, 'DUPLICATE_ID');
      else indexed.set(question.id, { question, position, path: questionPath });
      position++;
      if (!question.label.trim()) add(`${questionPath}.label`, 'EMPTY_LABEL');
      if (question.type === 'SELECT') {
        if (!question.options?.length) add(`${questionPath}.options`, 'MISSING_OPTIONS');
        const options = new Set<string>();
        question.options?.forEach((option, optionIndex) => {
          if (options.has(option.id))
            add(`${questionPath}.options.${optionIndex}.id`, 'DUPLICATE_ID');
          options.add(option.id);
          if (!option.label.trim())
            add(`${questionPath}.options.${optionIndex}.label`, 'EMPTY_LABEL');
        });
      } else if (question.options?.length) add(`${questionPath}.options`, 'UNEXPECTED_OPTIONS');
      if (question.nonconformity) {
        if (!question.nonconformity.category.trim())
          add(`${questionPath}.nonconformity.category`, 'EMPTY_LABEL');
        if (!validPredicate(question, question.nonconformity))
          add(`${questionPath}.nonconformity`, 'INVALID_PREDICATE');
      }
    });
  });
  if (position === 0) add('sections', 'EMPTY_FORM');
  if (position > 500) add('sections', 'TOO_MANY_QUESTIONS');
  for (const item of indexed.values()) {
    item.question.visibleWhen?.forEach((condition, index) => {
      const path = `${item.path}.visibleWhen.${index}`;
      const target = indexed.get(condition.questionId);
      if (!target) {
        add(path, 'MISSING_REFERENCE');
        return;
      }
      if (target.position >= item.position) add(path, 'FORWARD_REFERENCE');
      if (!validPredicate(target.question, condition)) add(path, 'INVALID_PREDICATE');
    });
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string) {
    if (visited.has(id)) return;
    const item = indexed.get(id);
    if (!item) return;
    if (visiting.has(id)) {
      add(`${item.path}.visibleWhen`, 'CYCLIC_DEPENDENCY');
      return;
    }
    visiting.add(id);
    for (const condition of item.question.visibleWhen ?? []) visit(condition.questionId);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of indexed.keys()) visit(id);
  return issues;
}
