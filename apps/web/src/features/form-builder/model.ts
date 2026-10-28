import type { FormQuestion, FormSection, FormVersionSnapshot, Predicate } from '@portal/contracts';
import { validateDefinition } from '@portal/form-engine';
export const definitionIssues = validateDefinition;
export const questionTypes = {
  TEXT: 'Texto',
  NUMBER: 'Número',
  DATE: 'Data',
  SELECT: 'Seleção',
  YES_NO_NA: 'Sim / Não / Não se aplica',
};
export const priorityLabels = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica' };
export const stateLabels = { DRAFT: 'Rascunho', PUBLISHED: 'Publicado', ARCHIVED: 'Arquivado' };
export function newQuestion(): FormQuestion {
  return { id: crypto.randomUUID(), label: '', type: 'YES_NO_NA', required: false };
}
export function newSection(): FormSection {
  return { id: crypto.randomUUID(), title: '', questions: [] };
}
export function previousQuestions(snapshot: FormVersionSnapshot, id: string) {
  const flat = snapshot.sections.flatMap((section) => section.questions);
  return flat.slice(
    0,
    Math.max(
      0,
      flat.findIndex((question) => question.id === id),
    ),
  );
}
export function dependents(snapshot: FormVersionSnapshot, ids: string[]) {
  return snapshot.sections
    .flatMap((section) => section.questions)
    .filter(
      (question) =>
        !ids.includes(question.id) &&
        question.visibleWhen?.some((rule) => ids.includes(rule.questionId)),
    );
}
function protectDependencies(snapshot: FormVersionSnapshot) {
  if (
    definitionIssues(snapshot).some((issue) =>
      ['FORWARD_REFERENCE', 'MISSING_REFERENCE', 'CYCLIC_DEPENDENCY'].includes(issue.code),
    )
  )
    throw new Error(
      'Esta alteração quebra uma dependência. Ajuste as condições antes de continuar.',
    );
  return snapshot;
}
function remapPredicate(predicate: Predicate, options: Map<string, string>): Predicate {
  return {
    ...predicate,
    value: Array.isArray(predicate.value)
      ? predicate.value.map((value) =>
          typeof value === 'string' ? (options.get(value) ?? value) : value,
        )
      : typeof predicate.value === 'string'
        ? (options.get(predicate.value) ?? predicate.value)
        : predicate.value,
  };
}
function cloneQuestion(
  question: FormQuestion,
  questionIds = new Map<string, string>(),
  optionIds = new Map<string, Map<string, string>>(),
) {
  const copy = structuredClone(question);
  copy.id = questionIds.get(question.id) ?? crypto.randomUUID();
  copy.options = question.options?.map((option) => ({
    id: optionIds.get(question.id)?.get(option.id) ?? crypto.randomUUID(),
    label: option.label,
  }));
  const ownOptions = new Map(
    question.options?.map((option, index) => [option.id, copy.options![index]!.id]),
  );
  if (copy.nonconformity)
    copy.nonconformity = {
      ...copy.nonconformity,
      ...remapPredicate(copy.nonconformity, ownOptions),
    };
  copy.visibleWhen = copy.visibleWhen?.map((condition) => ({
    ...condition,
    ...remapPredicate(
      condition,
      questionIds.has(condition.questionId)
        ? (optionIds.get(condition.questionId) ?? new Map())
        : new Map(),
    ),
    questionId: questionIds.get(condition.questionId) ?? condition.questionId,
  }));
  return copy;
}
export function duplicateQuestion(snapshot: FormVersionSnapshot, section: number, index: number) {
  const next = structuredClone(snapshot);
  next.sections[section]!.questions.splice(
    index + 1,
    0,
    cloneQuestion(next.sections[section]!.questions[index]!),
  );
  return protectDependencies(next);
}
export function duplicateSection(snapshot: FormVersionSnapshot, index: number) {
  const next = structuredClone(snapshot);
  const original = next.sections[index]!;
  const questionIds = new Map(
    original.questions.map((question) => [question.id, crypto.randomUUID()]),
  );
  const options = new Map(
    original.questions.map((question) => [
      question.id,
      new Map(question.options?.map((option) => [option.id, crypto.randomUUID()]) ?? []),
    ]),
  );
  next.sections.splice(index + 1, 0, {
    id: crypto.randomUUID(),
    title: original.title,
    questions: original.questions.map((question) => cloneQuestion(question, questionIds, options)),
  });
  return protectDependencies(next);
}
export function moveQuestion(
  snapshot: FormVersionSnapshot,
  section: number,
  index: number,
  target: number,
) {
  const next = structuredClone(snapshot);
  const questions = next.sections[section]!.questions;
  if (target < 0 || target >= questions.length) return next;
  const [question] = questions.splice(index, 1);
  questions.splice(target, 0, question!);
  return protectDependencies(next);
}
export function moveSection(snapshot: FormVersionSnapshot, index: number, target: number) {
  const next = structuredClone(snapshot);
  if (target < 0 || target >= next.sections.length) return next;
  const [section] = next.sections.splice(index, 1);
  next.sections.splice(target, 0, section!);
  return protectDependencies(next);
}
export function removeQuestion(snapshot: FormVersionSnapshot, section: number, index: number) {
  const next = structuredClone(snapshot);
  const id = next.sections[section]!.questions[index]!.id;
  if (dependents(next, [id]).length)
    throw new Error(
      'Outras perguntas dependem desta pergunta. Ajuste as condições antes de removê-la.',
    );
  next.sections[section]!.questions.splice(index, 1);
  return next;
}
export function removeSection(snapshot: FormVersionSnapshot, index: number) {
  const next = structuredClone(snapshot);
  if (
    dependents(
      next,
      next.sections[index]!.questions.map((question) => question.id),
    ).length
  )
    throw new Error(
      'Outras seções dependem destas perguntas. Ajuste as condições antes de remover.',
    );
  next.sections.splice(index, 1);
  return next;
}
export const issueLabels: Record<string, string> = {
  EMPTY_LABEL: 'Preencha este campo.',
  EMPTY_FORM: 'Adicione pelo menos uma pergunta.',
  EMPTY_SECTION: 'Adicione uma pergunta à seção.',
  MISSING_OPTIONS: 'Adicione pelo menos uma opção.',
  UNEXPECTED_OPTIONS: 'Este tipo não aceita opções.',
  FORWARD_REFERENCE: 'A condição deve usar uma pergunta anterior.',
  MISSING_REFERENCE: 'A pergunta usada na condição foi removida.',
  CYCLIC_DEPENDENCY: 'As condições não podem formar um ciclo.',
  INVALID_PREDICATE: 'Selecione um valor válido para esta regra.',
  DUPLICATE_ID: 'Identificador repetido. Recrie este item.',
  TOO_MANY_QUESTIONS: 'O limite é de 500 perguntas.',
};
