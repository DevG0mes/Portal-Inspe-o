import type { AnswerInput, FormVersionSnapshot, NonconformityOccurrence } from './forms.js';

export interface InspectionSubmissionView {
  id: string;
  cycle: number;
  sourceRevision: number;
  completedAt: string;
  completedById: string;
  answers: AnswerInput[];
  nonconformities: NonconformityOccurrence[];
}
export interface InspectionView {
  id: string;
  unitId: string;
  sectorId: string;
  assignmentId: string | null;
  createdById: string;
  formVersionId: string;
  formVersionNumber: number;
  snapshot: FormVersionSnapshot;
  state: 'DRAFT' | 'COMPLETED';
  revision: number;
  cycle: number;
  answers: AnswerInput[];
  submissions: InspectionSubmissionView[];
  canEdit: boolean;
  canReopen: boolean;
}

export interface InspectionSummary {
  id: string;
  title: string;
  unitName: string;
  sectorName: string;
  createdByName: string;
  formVersionNumber: number;
  state: 'DRAFT' | 'COMPLETED';
  updatedAt: string;
}
