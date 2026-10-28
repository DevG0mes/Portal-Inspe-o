export const QUESTION_TYPES = ['TEXT', 'NUMBER', 'DATE', 'SELECT', 'YES_NO_NA'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const FORM_STATES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type FormState = (typeof FORM_STATES)[number];
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type RuleScalar = string | number;
export type AnswerValue = RuleScalar | null;
export interface Predicate {
  operator: 'EQ' | 'NEQ' | 'IN';
  value: RuleScalar | RuleScalar[];
}
export interface VisibilityCondition extends Predicate {
  questionId: string;
}
export interface NonconformityRule extends Predicate {
  category: string;
  priority: (typeof PRIORITIES)[number];
}
export interface FormOption {
  id: string;
  label: string;
}
export interface FormQuestion {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options?: FormOption[];
  /** All conditions must match; references may only target earlier questions. */
  visibleWhen?: VisibilityCondition[];
  nonconformity?: NonconformityRule;
}
export interface FormSection {
  id: string;
  title: string;
  questions: FormQuestion[];
}
export interface FormVersionSnapshot {
  schemaVersion: 1;
  title: string;
  sections: FormSection[];
}
export interface AnswerInput {
  questionId: string;
  value: AnswerValue;
}
export interface DefinitionIssue {
  path: string;
  code: string;
}
export interface AnswerIssue {
  questionId: string;
  code: 'REQUIRED' | 'INVALID_ANSWER' | 'DUPLICATE_ANSWER' | 'UNKNOWN_QUESTION';
}
export interface NonconformityOccurrence {
  key: string;
  questionId: string;
  sectionId: string;
  category: string;
  priority: (typeof PRIORITIES)[number];
}
export interface EvaluationResult {
  definitionErrors: DefinitionIssue[];
  visibleQuestionIds: string[];
  errors: AnswerIssue[];
  acceptedAnswers: AnswerInput[];
  nonconformities: NonconformityOccurrence[];
}
export interface FormTemplateSummary {
  id: string;
  name: string;
  state: FormState;
  latestVersion: number;
  revision: number;
  hasDraft: boolean;
}
export interface FormVersionView {
  id: string;
  templateId: string;
  number: number;
  snapshot: FormVersionSnapshot;
  contentHash: string;
  publishedAt: string;
  publishedById: string;
  publishedByName: string;
}
export type FormVersionSummary = Omit<FormVersionView, 'snapshot'>;
