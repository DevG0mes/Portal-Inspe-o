import type { AnswerValue, FormQuestion } from './forms.js';
import type { EvidenceFile } from './files.js';
import type { Paginated } from './access.js';
export const ACTION_STATES = ['OPEN', 'IN_PROGRESS', 'AWAITING_VALIDATION', 'COMPLETED'] as const;
export type ActionState = (typeof ACTION_STATES)[number];
export const ACTION_COMMANDS = [
  'ASSIGN',
  'START',
  'COMMENT',
  'REQUEST_VALIDATION',
  'APPROVE',
  'RETURN',
] as const;
export type ActionCommandType = (typeof ACTION_COMMANDS)[number];
export interface OccurrenceView {
  submissionId: string;
  questionId: string;
  questionLabel: string;
  inspectionTitle: string;
  unitId: string;
  sectorId: string;
  unitName: string;
  sectorName: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  completedAt: string;
}
export interface ActionPlanSummary {
  id: string;
  description: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  state: ActionState;
  revision: number;
  responsibleId: string;
  responsibleName: string;
  unitId: string;
  sectorId: string;
  unitName: string;
  sectorName: string;
  dueDate: string;
  dueAt: string;
  overdue: boolean;
  completedAt: string | null;
}
export interface ActionPlanEventView {
  id: string;
  type: 'CREATED' | ActionCommandType;
  actorName: string;
  createdAt: string;
  fromState: ActionState | null;
  toState: ActionState;
  text: string | null;
  evidence: EvidenceFile[];
  assignment: {
    responsibleId: string;
    responsibleName: string;
    dueDate: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  } | null;
}
export interface ActionPlanView extends ActionPlanSummary {
  sourceSubmissionId: string;
  questionId: string;
  question: FormQuestion;
  sourceAnswer: AnswerValue;
  sourceNote: string | null;
  sourceEvidence: EvidenceFile[];
  inspectionTitle: string;
  evidence: EvidenceFile[];
  canManage: boolean;
  canExecute: boolean;
  history: Paginated<ActionPlanEventView>;
}
